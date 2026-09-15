/**
 * 游戏主 store —— Vue 与 Phaser 之间的桥梁。
 *
 * ⚠️ 三条铁律（违反任何一条都会导致性能或架构问题，见 docs/田园小游戏方案设计.md §5.2）：
 *
 * 1. 高频数据不进 Vue 响应式
 *    GameState 用 shallowRef 持有 —— 深层变化不触发依赖收集。
 *    gameTime / 生长进度等每帧变化的值，Phaser 侧通过 gameData.value 直接读原始对象。
 *
 * 2. Vue 组件只订阅低频镜像字段
 *    金币 / 等级 / 季节 / 速度等 UI 展示值，用独立 ref 维护，
 *    由 syncFromGame() 在关键操作后手动同步。
 *
 * 3. 单向数据流
 *    UI 操作 → 调 core 系统函数修改 gameData → Phaser 下一帧自然读到新值；
 *    游戏事件 → 修改 gameData → syncFromGame() 刷新 UI。
 *    禁止 Phaser 直接改状态、禁止 Vue 绕过系统函数改状态。
 */

import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import {
  createInitialState,
  currentClockHours,
  currentSeason,
  currentSeasonDay,
  settleOffline,
  tick,
  type GameState,
  type OfflineReport,
  type ParsedSave,
  type Speed,
} from '@cozy-farm/core';
import { createSaveStorage } from '../save/storage';
import { createAutoSaveController } from '../save/autoSave';

const SEASON_LABELS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } as const;

export const useGameStore = defineStore('game', () => {
  // ---------- 存档读写（双写轮换，localStorage 不可用时内存降级） ----------
  const storage = createSaveStorage();
  const loaded = storage.load();

  // ---------- 唯一真相源（铁律 1：shallowRef，深层不代理） ----------
  const gameData = shallowRef<GameState>(loaded?.state ?? createInitialState());

  // ---------- 低频 UI 镜像（铁律 2） ----------
  const gold = ref(gameData.value.gold);
  const level = ref(gameData.value.level);
  const speed = ref<Speed>(gameData.value.speed);
  const seasonLabel = ref('');
  const clockLabel = ref('');
  /** 离线结算结果（非 null 时 UI 弹出结算面板） */
  const offlineReport = ref<OfflineReport | null>(null);
  /** 上次成功保存的现实时刻（存档菜单显示） */
  const lastSavedAt = ref<number>(loaded?.savedAt ?? 0);
  /** 持久化失败标志（内存降级中/配额满），UI 据此提示"本次会话存档不可靠" */
  const saveDegraded = ref(false);
  /** 本次读档发生的版本迁移（v1 → v2 等），存档菜单展示一次性提示 */
  const migratedFrom = ref<number | null>(loaded?.migratedFrom ?? null);

  /** 把 gameData 的低频字段同步到响应式镜像（关键操作后调用） */
  function syncFromGame(): void {
    const s = gameData.value;
    gold.value = s.gold;
    level.value = s.level;
    speed.value = s.speed;
    seasonLabel.value = `${SEASON_LABELS[currentSeason(s)]} · 第 ${currentSeasonDay(s)} 天`;
    const h = currentClockHours(s);
    const hh = String(Math.floor(h)).padStart(2, '0');
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    clockLabel.value = `${hh}:${mm}`;
  }

  // ---------- 速度控制（在线调速） ----------
  function setSpeed(s: Speed): void {
    gameData.value.speed = s;
    speed.value = s;
    // speed 是存档字段，切换后走关键操作通道尽快落盘
    notifyGameAction();
  }

  // ---------- 主循环（每帧调用，只推 gameTime，零响应式开销） ----------
  let lastTs = 0;

  function frame(now: number): void {
    if (lastTs === 0) lastTs = now;
    tick(gameData.value, now - lastTs);
    lastTs = now;
  }

  /** 低频时钟刷新：UI 顶栏每秒调一次即可（不是每帧！） */
  function refreshClock(): void {
    syncFromGame();
  }

  // ---------- 离线结算（读档时调用一次） ----------
  function settleOnLoad(): void {
    // 先结算（要用存档里的旧 lastSeen），再固化 —— 顺序反了会吞掉离线时长
    const report = settleOffline(gameData.value, Date.now());

    // 读档时发生过版本迁移 → 结算完立即固化，下次启动不必再迁
    if (migratedFrom.value !== null) saveNow();

    if (report.realElapsedMs > 0) offlineReport.value = report;
    syncFromGame();
  }

  function dismissOfflineReport(): void {
    offlineReport.value = null;
  }

  // ---------- 存档（M0） ----------

  /**
   * 立即保存。必须同步完成 —— pagehide 触发时异步队列来不及跑。
   * lastSeen 在此处刷新：离线结算从最后一次成功落盘算起。
   */
  function saveNow(): boolean {
    gameData.value.lastSeen = Date.now();
    const result = storage.write(gameData.value);
    saveDegraded.value = !result.ok;
    if (result.ok) lastSavedAt.value = Date.now();
    return result.ok;
  }

  /** 应用导入的存档（fileIO 解析通过后调用），并立即落盘固化 */
  function applyImport(parsed: ParsedSave): void {
    gameData.value = parsed.state;
    migratedFrom.value = parsed.migratedFrom;
    syncFromGame();
    saveNow();
  }

  /** 重置存档（调用方必须先做二次确认） */
  function resetSave(): void {
    storage.clear();
    gameData.value = createInitialState();
    migratedFrom.value = null;
    lastSavedAt.value = 0;
    saveDegraded.value = false;
    syncFromGame();
    saveNow();
  }

  /**
   * 关键操作通知：种植/收获/购买等改变进度的动作完成后调用，
   * 自动存档控制器会在 3 秒静默后落盘。M1 交互层接入。
   */
  function notifyGameAction(): void {
    autoSave.notifyAction();
  }

  // 自动存档：30s 定时 + 关键操作防抖 + 页面隐藏/关闭前
  const autoSave = createAutoSaveController({ saveNow });

  // ---------- 初始化 ----------
  syncFromGame();

  return {
    gameData,
    gold,
    level,
    speed,
    seasonLabel,
    clockLabel,
    offlineReport,
    lastSavedAt,
    saveDegraded,
    migratedFrom,
    autoSave,
    setSpeed,
    frame,
    refreshClock,
    syncFromGame,
    settleOnLoad,
    dismissOfflineReport,
    saveNow,
    applyImport,
    resetSave,
    notifyGameAction,
  };
});
