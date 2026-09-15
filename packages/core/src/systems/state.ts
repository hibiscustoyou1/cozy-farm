/**
 * 初始状态工厂 —— 新开一档时的 GameState。
 *
 * 规则（方案 v2 §三 P0，M2 网格模型）：
 * - 最大网格 10×8 = 80 块（tiles 全量生成，id = row*10+col）
 * - 初始解锁中心 5×4 = 20 格（col 2~6 / row 2~5），其余锁定待扩地
 * - 起始金币 500、等级 1；gameTime 从第 1 天 6:00（日出）开始
 */

import { GAME_DAY_MS, SAVE_VERSION, MAX_GRID_COLS, MAX_GRID_ROWS, initialUnlockedTileIds } from '../constants';
import type { GameState, Tile } from '../types';

export function createInitialState(): GameState {
  const tiles: Tile[] = [];
  for (let i = 0; i < MAX_GRID_COLS * MAX_GRID_ROWS; i++) {
    tiles.push({
      id: i,
      state: 'wild',
      crop: null,
      plantedAt: 0,
      wateredUntil: 0,
      grownMs: 0,
      lastGrowthAt: 0,
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
    unlockedTileIds: initialUnlockedTileIds(),

    // M2+ 系统占位
    animals: [],
    // M1 首次体验赠送种子；商店（M2）接管后续补货。
    inventory: { 'seed:radish': 6, 'seed:wheat': 6, 'seed:potato': 3 },
    npcs: {},
    orders: [],
    decorations: [],
    collection: { crops: [], dishes: [], fish: [] },
  };
}
