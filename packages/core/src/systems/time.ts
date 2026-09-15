/**
 * TimeSystem —— 时间系统（方案 v2 §5.4）
 *
 * 核心概念：gameTime（游戏时钟）
 * - 所有游戏逻辑（生长/昼夜/季节/订单刷新）只读 gameTime
 * - 在线：由主循环每帧推进，gameTime += 现实delta × 速度倍率
 * - 离线：读档时一次性结算，固定 1x，上限 8 现实小时
 *
 * 速度倍率只影响 gameTime 的推进速率 —— 这让"可调速"的实现成本为零，
 * 且天然支持暂停（speed = 0 时农场静止，但仍可整理/种植/购买）。
 */

import {
  GAME_DAY_MS,
  OFFLINE_CAP_MS,
  SEASON_DAYS,
} from '../constants';
import { SEASONS } from '../types';
import type { GameState, OfflineReport, Season } from '../types';

// ---------- 在线推进（每帧调用） ----------

/**
 * 推进游戏时钟。由宿主（app 的主循环 / Phaser update）每帧调用。
 * @param state   游戏状态
 * @param deltaMs 距上一帧的现实毫秒
 */
export function tick(state: GameState, deltaMs: number): void {
  // speed = 0 时 gameTime 不动；暂停中依然允许操作农场
  state.gameTime += deltaMs * state.speed;
}

// ---------- 离线结算（读档时调用一次） ----------

/**
 * 离线结算：把离开期间的农场变化一次性算清。
 *
 * 规则：
 * - 固定按 1x 推进（防止"10x 种菜 + 关网页"的无限加速漏洞）
 * - 现实时长截断到 OFFLINE_CAP_MS（8 小时），超出部分不再生长
 *
 * @param state      读入的存档
 * @param nowReal    当前现实时间戳（Date.now()）
 * @returns          离线结算报告（供 UI 弹出"你不在的时候…"面板）
 */
export function settleOffline(state: GameState, nowReal: number): OfflineReport {
  const report: OfflineReport = {
    realElapsedMs: 0,
    maturedCrops: [],
    notes: [],
  };

  if (state.lastSeen <= 0) {
    return report; // 首次进入游戏，无离线结算
  }

  const realElapsed = Math.min(nowReal - state.lastSeen, OFFLINE_CAP_MS);
  if (realElapsed <= 0) return report;

  report.realElapsedMs = realElapsed;

  // 1x 推进：现实毫秒 1:1 变为游戏毫秒
  const before = state.gameTime;
  state.gameTime += realElapsed;

  // 结算地块：成熟判定（浇水窗口内的时间才计入生长）
  const matured = new Set<string>();
  for (const tile of state.tiles) {
    if (tile.state === 'growing' && isMature(state, tile.id)) {
      tile.state = 'mature';
      if (tile.crop) matured.add(tile.crop);
    }
  }
  report.maturedCrops = [...matured] as OfflineReport['maturedCrops'];

  // TODO(M1)：动物产出、加工完成、订单刷新的离线结算
  // TODO(M1+)：换季检测（before/after 跨季时追加 note）

  state.lastSeen = nowReal;
  return report;
}

// ---------- 生长判定 ----------

/**
 * 地块是否成熟。
 * 有效生长 = 浇水窗口覆盖的时间；缺水只暂停、不倒退（无失败原则）。
 */
export function isMature(state: GameState, tileId: number): boolean {
  const tile = state.tiles.find((t) => t.id === tileId);
  if (!tile || tile.state !== 'growing' || !tile.crop) return false;

  const growMs = cropGrowMs(tile.crop);
  const elapsed = effectiveGrownMs(state, tile);
  return elapsed >= growMs;
}

/**
 * 计算地块已有效生长的游戏毫秒数（浇水窗口内的部分）。
 *
 * 简化模型（v2 骨架）：
 *   生长有效当且仅当 gameTime 处于 [plantedAt, wateredUntil) 窗口内。
 *   浇水会把 wateredUntil 延长（GrowthSystem 负责，见 TODO）。
 */
export function effectiveGrownMs(state: GameState, tile: {
  plantedAt: number;
  wateredUntil: number;
}): number {
  const now = state.gameTime;
  const windowEnd = Math.min(now, tile.wateredUntil);
  return Math.max(0, windowEnd - tile.plantedAt);
}

// TODO(M1)：cropGrowMs 将由 config/crops.ts 的 CROPS 表提供；
// 此处临时内联以保持骨架可编译，M1 接入真实配置表后删除。
function cropGrowMs(_crop: string): number {
  return Number.POSITIVE_INFINITY;
}

// ---------- 日历换算（供 UI 展示） ----------

/** 当前是第几个游戏日（从 0 开始） */
export function currentDay(state: GameState): number {
  return Math.floor(state.gameTime / GAME_DAY_MS);
}

/** 当前季节内第几天（1 ~ SEASON_DAYS） */
export function currentSeasonDay(state: GameState): number {
  return (currentDay(state) % SEASON_DAYS) + 1;
}

/** 当前季节 */
export function currentSeason(state: GameState): Season {
  const idx = Math.floor(currentDay(state) / SEASON_DAYS) % SEASONS.length;
  return SEASONS[idx] ?? 'spring';
}

/** 当前游戏内时刻（0~24 的小时数，用于昼夜渲染） */
export function currentClockHours(state: GameState): number {
  return (state.gameTime % GAME_DAY_MS) / (60 * 60 * 1000);
}

/** 是否白天（日出 6:00 ~ 日落 18:00） */
export function isDaytime(state: GameState): boolean {
  const h = currentClockHours(state);
  return h >= 6 && h < 18;
}
