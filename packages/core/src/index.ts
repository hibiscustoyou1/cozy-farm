/**
 * @cozy-farm/core —— 系统层统一出口
 *
 * 分层纪律：本包是纯 TypeScript 逻辑层，禁止 import Vue / Pinia / Phaser。
 */

// 类型
export type {
  CropDef,
  CropId,
  GameState,
  OfflineReport,
  Season,
  Speed,
  Tile,
  TileState,
} from './types';
export { SEASONS } from './types';

// 常量
export {
  GAME_DAY_MS,
  SEASON_DAYS,
  SEASON_MS,
  YEAR_MS,
  SUNRISE_MS,
  SUNSET_MS,
  SPEED_STEPS,
  OFFLINE_SPEED,
  OFFLINE_CAP_MS,
  WATERING_LASTS_MS,
  SAVE_VERSION,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  INITIAL_GRID_COLS,
  INITIAL_GRID_ROWS,
  INITIAL_GRID_COL_OFFSET,
  INITIAL_GRID_ROW_OFFSET,
  EXPAND_PRICES,
  expandPrice,
} from './constants';

// 配置表
export { CROPS, cropsBySeason } from './config/crops';

// 时间系统
export {
  tick,
  settleOffline,
  advanceGrowth,
  isMature,
  effectiveGrownMs,
  cropGrowMs,
  currentDay,
  currentSeasonDay,
  currentSeason,
  currentClockHours,
  isDaytime,
} from './systems/time';

// 种植系统
export type { FarmResult, FarmFailReason } from './systems/farming';
export {
  seedKey,
  cropKey,
  tillTile,
  plantSeed,
  waterTile,
  harvestTile,
  buySeed,
  expToNext,
} from './systems/farming';

// 初始状态
export { createInitialState } from './systems/state';
export { initialUnlockedTileIds } from './constants';

// 经济系统
export type { SellAllResult } from './systems/economy';
export {
  sellCrop,
  sellAll,
  canExpandTile,
  expandTile,
  isAdjacentToUnlocked,
  nextExpandPrice,
  tileCoord,
} from './systems/economy';

// 存档系统
export type { SaveSlot, SaveEnvelope, ParsedSave } from './systems/save';
export {
  serializeSave,
  parseSave,
  makeEnvelope,
  parseEnvelope,
} from './systems/save';
