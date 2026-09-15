/**
 * 初始状态工厂 —— 新开一档时的 GameState。
 *
 * 规则（方案 v2 §三 P0）：
 * - 初始 5×4 = 20 格可耕种（id 0~19）
 * - 起始金币 500、等级 1
 * - gameTime 从第 1 天 6:00（日出）开始
 */

import { GAME_DAY_MS, SAVE_VERSION } from '../constants';
import type { GameState, Tile } from '../types';

/** 初始可耕种网格：5 列 × 4 行 */
export const INITIAL_GRID_COLS = 5;
export const INITIAL_GRID_ROWS = 4;

export function createInitialState(): GameState {
  const tiles: Tile[] = [];
  for (let i = 0; i < INITIAL_GRID_COLS * INITIAL_GRID_ROWS; i++) {
    tiles.push({
      id: i,
      state: 'wild',
      crop: null,
      plantedAt: 0,
      wateredUntil: 0,
    });
  }

  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),

    // 从第 1 个游戏日的日出（6:00）开始
    gameTime: GAME_DAY_MS + 6 * 60 * 60 * 1000,
    lastSeen: Date.now(),
    speed: 1,

    gold: 500,
    level: 1,
    exp: 0,

    tiles,
    unlockedTileIds: tiles.map((t) => t.id),

    // M2+ 系统占位
    animals: [],
    inventory: {},
    npcs: {},
    orders: [],
    decorations: [],
    collection: { crops: [], dishes: [], fish: [] },
  };
}
