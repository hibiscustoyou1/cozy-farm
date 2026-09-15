<script setup lang="ts">
/**
 * 工具栏 —— M1 种植交互入口：锄头/种子/水壶/篮子 + 种子品种面板。
 *
 * 桌面：左侧竖栏；移动端：底部横条（同一组件两套布局）。
 * 种子面板按"已解锁"列全部品种：当季可购买，反季只显示库存
 * （种植不限季 —— 种子是玩家财产，方案 §2.2"换季不惩罚"）。
 */
import { computed, watch } from 'vue';
import {
  CROPS,
  currentSeason,
  type CropId,
} from '@cozy-farm/core';
import { useGameStore, type ToolId } from '../stores/game';

const store = useGameStore();

const TOOLS: Array<{ id: ToolId; icon: string; label: string }> = [
  { id: 'hoe', icon: '⛏️', label: '锄地' },
  { id: 'seed', icon: '🌱', label: '播种' },
  { id: 'water', icon: '💧', label: '浇水' },
  { id: 'basket', icon: '🧺', label: '收获' },
];

/** 品种展示信息（emoji 图标为 M1 临时方案，后续换像素图标） */
const CROP_ICONS: Record<CropId, string> = {
  radish: '🥕',
  wheat: '🌾',
  potato: '🥔',
  corn: '🌽',
  tomato: '🍅',
  eggplant: '🍆',
  pumpkin: '🎃',
  watermelon: '🍉',
};

interface SeedRow {
  id: CropId;
  name: string;
  icon: string;
  price: number;
  owned: number;
  inSeason: boolean;
  unlocked: boolean;
  unlockLevel: number;
}

/** 全部已解锁品种（含反季持有）；等级不够的置灰展示，给玩家目标感 */
const seedRows = computed<SeedRow[]>(() => {
  const season = currentSeason(store.gameData);
  return Object.values(CROPS)
    .sort((a, b) => a.unlockLevel - b.unlockLevel)
    .map((c) => ({
      id: c.id,
      name: c.name,
      icon: CROP_ICONS[c.id],
      price: c.seedPrice,
      owned: store.seedCounts[`seed:${c.id}`] ?? 0,
      inSeason: c.season === season,
      unlocked: store.level >= c.unlockLevel,
      unlockLevel: c.unlockLevel,
    }));
});

// 换季/升级后面板变化时，校正选中品种：没库存又买不了的就换掉
watch(
  seedRows,
  (rows) => {
    const cur = rows.find((r) => r.id === store.selectedSeed);
    const usable = cur && (cur.owned > 0 || (cur.unlocked && cur.inSeason));
    if (!usable) {
      const first = rows.find((r) => r.owned > 0 || (r.unlocked && r.inSeason));
      if (first) store.selectedSeed = first.id;
    }
  },
  { immediate: true },
);

function pickTool(t: ToolId): void {
  store.selectedTool = t;
}

function pickSeed(id: CropId): void {
  store.selectedTool = 'seed';
  store.selectedSeed = id;
}
</script>

<template>
  <div class="toolbar">
    <!-- 工具行：桌面竖排 / 移动横排 -->
    <div class="tool-row">
      <button
        v-for="t in TOOLS"
        :key="t.id"
        class="tool-btn"
        :class="{ active: store.selectedTool === t.id }"
        :aria-pressed="store.selectedTool === t.id"
        @click="pickTool(t.id)"
      >
        <span class="tool-icon">{{ t.icon }}</span>
        <span class="tool-label">{{ t.label }}</span>
        <span
          v-if="t.id === 'seed' && (store.seedCounts[`seed:${store.selectedSeed}`] ?? 0) > 0"
          class="tool-badge"
        >
          {{ store.seedCounts[`seed:${store.selectedSeed}`] }}
        </span>
      </button>
    </div>

    <!-- 种子品种面板：播种工具激活时展开 -->
    <div v-if="store.selectedTool === 'seed'" class="seed-panel">
      <p class="panel-title">种子袋</p>
      <button
        v-for="row in seedRows"
        :key="row.id"
        class="seed-row"
        :class="{
          active: store.selectedSeed === row.id,
          locked: !row.unlocked,
        }"
        :disabled="!row.unlocked"
        @click="row.unlocked && pickSeed(row.id)"
      >
        <span class="seed-icon">{{ row.icon }}</span>
        <span class="seed-name">{{ row.name }}</span>
        <span class="seed-owned">×{{ row.owned }}</span>
        <span
          v-if="!row.unlocked"
          class="seed-tag locked-tag"
        >Lv.{{ row.unlockLevel }} 解锁</span>
        <span v-else-if="!row.inSeason" class="seed-tag off-tag">非当季</span>
        <span
          v-else-if="row.owned === 0"
          class="seed-buy"
          role="button"
          tabindex="-1"
          :title="`购买 1 粒（${row.price} 金币）`"
          @click.stop="store.quickBuySeed(row.id)"
        >＋{{ row.price }}</span>
      </button>
      <p class="panel-hint">点击地块播种 · 拖动批量</p>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 工具行 ---------- */
.tool-row {
  display: flex;
  flex-direction: column; /* 桌面竖排；移动端媒体查询改横排 */
  gap: 8px;
}

.tool-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 56px;
  padding: 6px 4px;
  border: none;
  border-radius: 12px;
  background: rgba(61, 90, 61, 0.08);
  cursor: pointer;
  transition: background 0.15s ease;
}

.tool-btn:hover {
  background: rgba(127, 176, 105, 0.25);
}

.tool-btn.active {
  background: #7fb069;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.tool-icon {
  font-size: 22px;
  line-height: 1.2;
}

.tool-label {
  font-size: 12px;
  color: #3d5a3d;
}

.tool-btn.active .tool-label {
  color: #fff;
  font-weight: 600;
}

.tool-badge {
  position: absolute;
  top: 2px;
  right: 6px;
  min-width: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #d97757;
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  font-weight: 600;
}

/* ---------- 种子面板 ---------- */
.seed-panel {
  margin-top: 10px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255, 253, 245, 0.85);
  border: 2px solid #e0d8c3;
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #3d5a3d;
}

.seed-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 4px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.seed-row:hover:not(.locked) {
  background: rgba(127, 176, 105, 0.18);
}

.seed-row.active {
  background: rgba(127, 176, 105, 0.32);
}

.seed-row.locked {
  opacity: 0.45;
  cursor: default;
}

.seed-icon {
  font-size: 18px;
}

.seed-name {
  flex: 1;
  font-size: 14px;
  color: #3d5a3d;
}

.seed-owned {
  font-size: 13px;
  color: #3d5a3d;
  opacity: 0.7;
}

.seed-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
}

.locked-tag {
  background: rgba(61, 90, 61, 0.15);
  color: #3d5a3d;
}

.off-tag {
  background: rgba(217, 119, 87, 0.15);
  color: #b3543a;
}

.seed-buy {
  padding: 2px 8px;
  border-radius: 8px;
  background: #e8b04b;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.seed-buy:active {
  transform: scale(0.94);
}

.panel-hint {
  margin-top: 8px;
  font-size: 11px;
  opacity: 0.55;
  text-align: center;
}

/* ---------- 移动端：横排工具条 ---------- */
@media (max-width: 767px) {
  .tool-row {
    flex-direction: row;
    gap: 6px;
  }

  .tool-btn {
    flex: 1;
    min-height: 52px;
  }

  .tool-label {
    font-size: 11px;
  }

  /* 种子面板从底部弹出，限高可滚 */
  .seed-panel {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: calc(72px + env(safe-area-inset-bottom));
    z-index: 60;
    max-height: 42dvh;
    overflow-y: auto;
    margin-top: 0;
  }
}
</style>
