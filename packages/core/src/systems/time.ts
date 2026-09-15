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

  // 结算地块：统一走累计模型（断水时段不计入生长）
  const matured = new Set<string>();
  for (const tileId of advanceGrowth(state)) {
    const tile = state.tiles.find((t) => t.id === tileId);
    if (tile?.crop) matured.add(tile.crop);
  }
  report.maturedCrops = [...matured] as OfflineReport['maturedCrops'];

  // TODO(M1)：动物产出、加工完成、订单刷新的离线结算
  // TODO(M1+)：换季检测（before/after 跨季时追加 note）

  state.lastSeen = nowReal;
  return report;
}

// ---------- 生长判定（M1：累计模型） ----------

import { CROPS } from '../config/crops';
import type { Tile } from '../types';

/** 作物生长所需的游戏毫秒（CROPS 数值表唯一来源） */
export function cropGrowMs(crop: Tile['crop']): number {
  if (!crop) return Number.POSITIVE_INFINITY;
  return CROPS[crop].growMs;
}

/**
 * 结算所有 growing 地块的累计生长进度（幂等）。
 *
 * 模型：湿润窗口 = [plantedAt, wateredUntil)。断水时段不计入，
 * 补浇后 wateredUntil 前移，从断点继续累计 —— 生长只暂停、不倒退。
 * 由主循环每帧调用（app 层 store.frame），离线结算内部也会调用。
 *
 * @returns 本次新成熟的地块 id（供 UI 弹提示；空数组 = 无新成熟）
 */
export function advanceGrowth(state: GameState): number[] {
  const newlyMature: number[] = [];
  const now = state.gameTime;

  for (const tile of state.tiles) {
    if (tile.state !== 'growing' || !tile.crop) {
      continue; // 未种植/已成熟/已收获的地块无需结算
    }

    const from = Math.max(tile.lastGrowthAt, tile.plantedAt);
    if (now > from) {
      // [from, now) 与湿润窗口 [plantedAt, wateredUntil) 的交集
      const wetEnd = Math.min(now, tile.wateredUntil);
      if (wetEnd > from) tile.grownMs += wetEnd - from;
      tile.lastGrowthAt = now;
    }

    if (tile.grownMs >= cropGrowMs(tile.crop)) {
      tile.state = 'mature';
      newlyMature.push(tile.id);
    }
  }
  return newlyMature;
}

/**
 * 地块是否成熟（只读判定，不推进进度）。
 * 有效生长 = 浇水窗口覆盖的时间；缺水只暂停、不倒退（无失败原则）。
 */
export function isMature(state: GameState, tileId: number): boolean {
  const tile = state.tiles.find((t) => t.id === tileId);
  if (!tile || tile.state !== 'growing' || !tile.crop) return false;
  return tile.grownMs >= cropGrowMs(tile.crop);
}

/**
 * 计算地块当前有效生长毫秒数（纯读，渲染层画进度条/选阶段用）。
 * = 已结算的 grownMs + 上次结算以来仍在湿润窗口内的增量。
 */
export function effectiveGrownMs(state: GameState, tile: {
  plantedAt: number;
  wateredUntil: number;
  grownMs: number;
  lastGrowthAt: number;
}): number {
  const now = state.gameTime;
  const from = Math.max(tile.lastGrowthAt, tile.plantedAt);
  const wetEnd = Math.min(now, tile.wateredUntil);
  const pending = wetEnd > from ? wetEnd - from : 0;
  return tile.grownMs + pending;
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
