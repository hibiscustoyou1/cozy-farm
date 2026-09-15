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

// ---------- 存档 ----------

/**
 * 当前存档结构版本（= GameState.version）。
 * 结构变更时递增此值并在 systems/save.ts 的 MIGRATIONS 里补迁移函数。
 */
export const SAVE_VERSION = 2;
