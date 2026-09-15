/**
 * 作物数值表（方案 v2 §2.3）
 *
 * 时长单位：游戏毫秒（gameTime 坐标）。
 * 1 游戏日 = 24 现实分钟（1x）；10x 下 1 游戏日 = 2.4 现实分钟。
 *
 * 数值原则：
 * - 短作物"利润/游戏小时"略高 → 鼓励活跃游玩
 * - 长作物单次利润高 → 适合睡前 1x 慢慢长
 * - 个人项目无需精调，先跑起来再平衡
 */

import type { CropDef, CropId } from '../types';

export const CROPS: Record<CropId, CropDef> = {
  radish: {
    id: 'radish',
    name: '萝卜',
    season: 'spring',
    seedPrice: 20,
    sellPrice: 35,
    growMs: 4 * 60 * 60 * 1000,        // 4 游戏小时 → 1x 现实 4 分钟 / 10x 24 秒
    unlockLevel: 1,
  },
  wheat: {
    id: 'wheat',
    name: '小麦',
    season: 'spring',
    seedPrice: 15,
    sellPrice: 30,
    growMs: 6 * 60 * 60 * 1000,        // 6 游戏小时
    unlockLevel: 1,
  },
  potato: {
    id: 'potato',
    name: '土豆',
    season: 'spring',
    seedPrice: 40,
    sellPrice: 90,
    growMs: 12 * 60 * 60 * 1000,       // 12 游戏小时
    unlockLevel: 1,
  },
  corn: {
    id: 'corn',
    name: '玉米',
    season: 'summer',
    seedPrice: 60,
    sellPrice: 180,
    growMs: GAME_DAYS_TO_MS(1.5),      // 1.5 游戏日 → 1x 现实 36 分钟
    unlockLevel: 2,
  },
  tomato: {
    id: 'tomato',
    name: '番茄',
    season: 'summer',
    seedPrice: 80,
    sellPrice: 260,
    growMs: GAME_DAYS_TO_MS(2),        // 2 游戏日 → 1x 现实 48 分钟
    unlockLevel: 3,
  },
  eggplant: {
    id: 'eggplant',
    name: '茄子',
    season: 'autumn',
    seedPrice: 120,
    sellPrice: 400,
    growMs: GAME_DAYS_TO_MS(2.5),      // 2.5 游戏日
    unlockLevel: 4,
  },
  pumpkin: {
    id: 'pumpkin',
    name: '南瓜',
    season: 'autumn',
    seedPrice: 150,
    sellPrice: 560,
    growMs: GAME_DAYS_TO_MS(4),        // 4 游戏日 → 1x 现实 96 分钟
    unlockLevel: 4,
  },
  watermelon: {
    id: 'watermelon',
    name: '西瓜',
    season: 'summer',
    seedPrice: 300,
    sellPrice: 1200,
    growMs: GAME_DAYS_TO_MS(6),        // 6 游戏日 → 1x 现实 144 分钟
    unlockLevel: 5,
  },
};

/** 便捷换算：游戏日 → 游戏毫秒 */
function GAME_DAYS_TO_MS(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

/** 按季节过滤可购买的作物（当前商店货架） */
export function cropsBySeason(season: CropDef['season']): CropDef[] {
  return Object.values(CROPS).filter((c) => c.season === season);
}
