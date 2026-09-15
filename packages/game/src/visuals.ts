/**
 * 视觉映射 —— CropId/TileState 到具体纹理资源的绑定。
 *
 * 素材现状（manifest.json）：
 * - 环境：Ellen0ra 16×16 图集（7×7 帧），帧位由颜色分析确定
 * - 作物：Mossbell 32×32 独立 PNG，6 种 × 4 阶段
 *
 * 8 种作物对 6 种素材：3 种借用近似素材 + tint 区分（临时方案，
 * TODO M1+：补专属素材后删 tint）。
 */
import type { CropId } from '@cozy-farm/core';

// ---------- Ellen0ra 图集帧位（16×16） ----------

/** 纯草地（背景铺底） */
export const FRAME_GRASS = 0;
/** 杂草丛生的草地（wild 未开垦地块，与背景草区分） */
export const FRAME_WILD = 2;
/** 犁沟耕地（tilled / growing / mature 底图） */
export const FRAME_TILLED = 10;
/** 小黄花（收获粒子） */
export const FRAME_SPARK = 6;

// ---------- 作物素材映射 ----------

/** Mossbell 素材里实际存在的物种名 */
type MossbellCrop = 'carrot' | 'cabbage' | 'tomato' | 'pumpkin' | 'strawberry' | 'wheat';

/**
 * CropId → 素材物种 + 可选 tint。
 * - radish→carrot：萝卜缨与胡萝卜叶外形接近
 * - potato→cabbage：土豆地上叶丛近似叶球
 * - corn→wheat(绿tint)/eggplant→cabbage(紫tint)/watermelon→pumpkin(绿tint)：借用近似
 */
const CROP_SOURCE: Record<CropId, { species: MossbellCrop; tint?: number }> = {
  radish: { species: 'carrot' },
  wheat: { species: 'wheat' },
  potato: { species: 'cabbage' },
  corn: { species: 'wheat', tint: 0xa8d878 }, // 生长期玉米偏绿，与金黄小麦区分
  tomato: { species: 'tomato' },
  eggplant: { species: 'cabbage', tint: 0xc0a0d8 },
  pumpkin: { species: 'pumpkin' },
  watermelon: { species: 'pumpkin', tint: 0x7fc97f },
};

export interface CropVisual {
  /** 纹理 key：crop-{species}-{stage} */
  textureKey: (stage: GrowthStage) => string;
  tint: number | undefined;
}

export type GrowthStage = 1 | 2 | 3 | 4;

/** 生成某作物某阶段的纹理 key */
export function cropTextureKey(crop: CropId, stage: GrowthStage): string {
  return `crop-${CROP_SOURCE[crop].species}-${stage}`;
}

/** 某作物的 tint（无则 undefined = 原色） */
export function cropTint(crop: CropId): number | undefined {
  return CROP_SOURCE[crop].tint;
}

/** 需要预加载的全部作物纹理 key（去重后 6 物种 × 4 阶段） */
export function allCropTextureKeys(): Array<{ key: string; species: MossbellCrop; stage: GrowthStage }> {
  const speciesList = [...new Set(Object.values(CROP_SOURCE).map((v) => v.species))];
  const out: Array<{ key: string; species: MossbellCrop; stage: GrowthStage }> = [];
  for (const species of speciesList) {
    for (const stage of [1, 2, 3, 4] as const) {
      out.push({ key: `crop-${species}-${stage}`, species, stage });
    }
  }
  return out;
}

/** 生长进度（0~1）→ 视觉阶段；成熟(mature)固定用 4 */
export function growthStage(progress01: number): GrowthStage {
  if (progress01 >= 1) return 4;
  if (progress01 >= 0.66) return 3;
  if (progress01 >= 0.33) return 2;
  return 1;
}
