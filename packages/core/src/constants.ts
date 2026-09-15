/**
 * 时间常量 —— 全游戏时间体系的唯一刻度来源。
 *
 * 设计要点（方案 v2 §2.2）：
 * - 1 游戏日 = 24 现实分钟（1x 速度下）
 * - 1 季 = 7 游戏日；1 年 = 4 季
 * - 离线固定 1x，上限 8 现实小时
 */

/** 1 游戏日的游戏毫秒数（游戏内时钟走满 24h） */
export const GAME_DAY_MS = 24 * 60 * 60 * 1000;

/** 每季游戏日数 */
export const SEASON_DAYS = 7;

/** 每年季数 */
const SEASONS_PER_YEAR = 4;

/** 1 季的游戏毫秒数 */
export const SEASON_MS = GAME_DAY_MS * SEASON_DAYS;

/** 1 年的游戏毫秒数 */
export const YEAR_MS = SEASON_MS * SEASONS_PER_YEAR;

/** 游戏内一天中日出的时刻（毫秒） */
export const SUNRISE_MS = 6 * 60 * 60 * 1000;

/** 游戏内一天中日落的时刻（毫秒） */
export const SUNSET_MS = 18 * 60 * 60 * 1000;

// ---------- 速度系统 ----------

import type { Speed } from './types';

/** 允许的速度倍率档位（0 = 暂停） */
export const SPEED_STEPS: readonly Speed[] = [0, 1, 2, 5, 10];

/** 离线结算：固定速度 */
export const OFFLINE_SPEED = 1;

/** 离线结算：现实时长上限（8 小时） */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

// ---------- 浇水 ----------

/** 一次浇水维持湿度的游戏时长（1 游戏日） */
export const WATERING_LASTS_MS = GAME_DAY_MS;

// ---------- 农场网格 ----------

/** 农场最大网格：10 列 × 8 行 = 80 格（扩地上限，方案 §三 P0） */
export const MAX_GRID_COLS = 10;
export const MAX_GRID_ROWS = 8;

/** 初始解锁区域：5×4，居中放在最大网格里（col 2~6 / row 2~5） */
export const INITIAL_GRID_COLS = 5;
export const INITIAL_GRID_ROWS = 4;
/** 初始解锁区在最大网格中的偏移（居中：10-5=5 取左 2；8-4=4 上下各 2） */
export const INITIAL_GRID_COL_OFFSET = 2;
export const INITIAL_GRID_ROW_OFFSET = 2;

/** 初始解锁的地块 id 集合（新档与迁移共用） */
export function initialUnlockedTileIds(): number[] {
  const ids: number[] = [];
  for (let r = 0; r < INITIAL_GRID_ROWS; r++) {
    for (let c = 0; c < INITIAL_GRID_COLS; c++) {
      ids.push((r + INITIAL_GRID_ROW_OFFSET) * MAX_GRID_COLS + (c + INITIAL_GRID_COL_OFFSET));
    }
  }
  return ids;
}

// ---------- 扩地价格 ----------

/**
 * 前 4 次扩地价格（方案 §三 P0：200/500/1200/3000 递增）；
 * 之后每次 ×1.5 向上取整到百位 —— 个人项目无需精调，先跑通闭环。
 */
export const EXPAND_PRICES: readonly number[] = [200, 500, 1200, 3000];

/** 第 n 次（0 起）扩地的价格 */
export function expandPrice(n: number): number {
  if (n < EXPAND_PRICES.length) return EXPAND_PRICES[n]!;
  return Math.ceil((EXPAND_PRICES[EXPAND_PRICES.length - 1]! * Math.pow(1.5, n - EXPAND_PRICES.length + 1)) / 100) * 100;
}

// ---------- 存档 ----------

/**
 * 当前存档结构版本（= GameState.version）。
 * 结构变更时递增此值并在 systems/save.ts 的 MIGRATIONS 里补迁移函数。
 * v4：网格扩为 10×8，tiles 重排为全量 80 块（id=row*10+col），初始区居中。
 */
export const SAVE_VERSION = 4;
