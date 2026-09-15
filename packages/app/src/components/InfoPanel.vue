<script setup lang="ts">
/**
 * 信息面板 —— M2 经济三件套：商店 / 背包 / 图鉴。
 *
 * 桌面：右栏常驻（tab 切换）；移动端：底部弹出 sheet。
 * 商店按当季+等级过滤货架（购买校验在 core）；背包支持单件卖与一键全卖；
 * 图鉴展示 8 作物收集状态（collection.crops，收获时记录）。
 */
import { computed } from 'vue';
import {
  CROPS,
  cropsBySeason,
  currentSeason,
  expToNext,
  type CropId,
} from '@cozy-farm/core';
import { useGameStore, type PanelTab } from '../stores/game';

const store = useGameStore();

const TABS: Array<{ id: PanelTab; icon: string; label: string }> = [
  { id: 'shop', icon: '🛒', label: '商店' },
  { id: 'bag', icon: '🎒', label: '背包' },
  { id: 'codex', icon: '📖', label: '图鉴' },
];

const CROP_ICONS: Record<CropId, string> = {
  radish: '🥕', wheat: '🌾', potato: '🥔', corn: '🌽',
  tomato: '🍅', eggplant: '🍆', pumpkin: '🎃', watermelon: '🍉',
};

const season = computed(() => currentSeason(store.gameData));

/** 商店货架：当季作物，按解锁等级排序（未解锁置灰展示目标） */
const shopRows = computed(() =>
  cropsBySeason(season.value)
    .sort((a, b) => a.unlockLevel - b.unlockLevel)
    .map((c) => ({
      ...c,
      icon: CROP_ICONS[c.id],
      owned: store.seedCounts[`seed:${c.id}`] ?? 0,
      unlocked: store.level >= c.unlockLevel,
      canBuy1: store.level >= c.unlockLevel && store.gold >= c.seedPrice,
      canBuy5: store.level >= c.unlockLevel && store.gold >= c.seedPrice * 5,
    })),
);

/** 背包：有库存的作物（种子不在此列） */
const bagRows = computed(() =>
  Object.values(CROPS)
    .map((c) => ({
      id: c.id,
      name: c.name,
      icon: CROP_ICONS[c.id],
      count: store.cropCount(c.id),
      sellPrice: c.sellPrice,
    }))
    .filter((r) => r.count > 0),
);

const bagEmpty = computed(() => bagRows.value.length === 0);
const bagTotal = computed(() =>
  bagRows.value.reduce((sum, r) => sum + r.count * r.sellPrice, 0),
);

/** 图鉴：全部 8 作物的收集状态 */
const codexRows = computed(() =>
  Object.values(CROPS)
    .sort((a, b) => a.unlockLevel - b.unlockLevel)
    .map((c) => ({
      id: c.id,
      name: c.name,
      icon: CROP_ICONS[c.id],
      collected: store.gameData.collection.crops.includes(c.id),
      season: c.season,
    })),
);
const collectedCount = computed(() => codexRows.value.filter((r) => r.collected).length);

/** 经验进度（顶栏 Lv 的展开，放图鉴 tab 顶部） */
const expProgress = computed(() => {
  const need = expToNext(store.level);
  return { have: store.gameData.exp, need, pct: Math.min(100, Math.round((store.gameData.exp / need) * 100)) };
});

function openTab(tab: PanelTab): void {
  // 再点同一 tab = 收起（移动端 sheet 关闭）
  store.activeTab = store.activeTab === tab ? null : tab;
}
</script>

<template>
  <div class="info-panel">
    <!-- tab 头 -->
    <div class="tab-head">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="tab-head-btn"
        :class="{ active: store.activeTab === t.id }"
        @click="openTab(t.id)"
      >
        <span class="tab-icon">{{ t.icon }}</span>
        <span class="tab-label">{{ t.label }}</span>
      </button>
    </div>

    <!-- 面板主体：未选 tab 时显示提示 -->
    <div v-if="store.activeTab" class="panel-body">
      <!-- 商店 -->
      <div v-if="store.activeTab === 'shop'" class="tab-page">
        <p class="page-title">种子商店 · {{ season === 'spring' ? '春' : season === 'summer' ? '夏' : season === 'autumn' ? '秋' : '冬' }}季货架</p>
        <div v-for="row in shopRows" :key="row.id" class="row">
          <span class="row-icon">{{ row.icon }}</span>
          <span class="row-main">
            <span class="row-name">{{ row.name }}</span>
            <span class="row-sub">🪙{{ row.seedPrice }} · 卖{{ row.sellPrice }} · 持有{{ row.owned }}</span>
          </span>
          <template v-if="row.unlocked">
            <button class="btn buy" :disabled="!row.canBuy1" @click="store.shopBuySeed(row.id, 1)">买1</button>
            <button class="btn buy" :disabled="!row.canBuy5" @click="store.shopBuySeed(row.id, 5)">买5</button>
          </template>
          <span v-else class="row-tag">Lv.{{ row.unlockLevel }}</span>
        </div>
      </div>

      <!-- 背包 -->
      <div v-else-if="store.activeTab === 'bag'" class="tab-page">
        <div class="page-title-row">
          <p class="page-title">背包 · 收成</p>
          <button v-if="!bagEmpty" class="btn sell-all" @click="store.sellAllAction()">
            一键卖出 +{{ bagTotal }}
          </button>
        </div>
        <p v-if="bagEmpty" class="empty-hint">还没有收成，去地里看看吧 🌱</p>
        <div v-for="row in bagRows" :key="row.id" class="row">
          <span class="row-icon">{{ row.icon }}</span>
          <span class="row-main">
            <span class="row-name">{{ row.name }} ×{{ row.count }}</span>
            <span class="row-sub">单价 🪙{{ row.sellPrice }}</span>
          </span>
          <button class="btn sell" @click="store.sellCropAction(row.id, 1)">卖1</button>
          <button class="btn sell" @click="store.sellCropAction(row.id, row.count)">全卖</button>
        </div>
      </div>

      <!-- 图鉴 -->
      <div v-else-if="store.activeTab === 'codex'" class="tab-page">
        <p class="page-title">作物图鉴 · {{ collectedCount }}/{{ codexRows.length }}</p>
        <div class="exp-bar-wrap" title="升级进度">
          <div class="exp-bar" :style="{ width: expProgress.pct + '%' }" />
          <span class="exp-text">Lv.{{ store.level }} · {{ expProgress.have }}/{{ expProgress.need }} exp</span>
        </div>
        <div class="codex-grid">
          <div
            v-for="row in codexRows"
            :key="row.id"
            class="codex-cell"
            :class="{ collected: row.collected }"
          >
            <span class="codex-icon">{{ row.collected ? row.icon : '❓' }}</span>
            <span class="codex-name">{{ row.collected ? row.name : '未遇见' }}</span>
          </div>
        </div>
      </div>
    </div>

    <p v-else class="panel-hint">🛒 商店 · 🎒 背包 · 📖 图鉴<br />点开看看</p>
  </div>
</template>

<style scoped>
.info-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tab-head {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.tab-head-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 48px;
  padding: 6px 0;
  border: none;
  border-radius: 10px;
  background: rgba(61, 90, 61, 0.08);
  cursor: pointer;
}

.tab-head-btn.active {
  background: #7fb069;
}

.tab-icon {
  font-size: 18px;
}

.tab-label {
  font-size: 12px;
  color: #3d5a3d;
}

.tab-head-btn.active .tab-label {
  color: #fff;
  font-weight: 600;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.page-title {
  font-size: 13px;
  font-weight: 700;
  color: #3d5a3d;
  margin-bottom: 8px;
}

.page-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 13px;
  opacity: 0.6;
  text-align: center;
  padding: 24px 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-bottom: 1px dashed #e0d8c3;
}

.row-icon {
  font-size: 20px;
}

.row-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row-name {
  font-size: 14px;
  color: #3d5a3d;
}

.row-sub {
  font-size: 11px;
  opacity: 0.6;
}

.row-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(61, 90, 61, 0.15);
  color: #3d5a3d;
}

.btn {
  min-height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn.buy {
  background: #e8b04b;
  color: #fff;
}

.btn.buy:not(:disabled):active {
  transform: scale(0.94);
}

.btn.sell {
  background: rgba(127, 176, 105, 0.3);
  color: #3d5a3d;
}

.btn.sell-all {
  background: #7fb069;
  color: #fff;
}

/* 图鉴 */
.exp-bar-wrap {
  position: relative;
  height: 22px;
  border-radius: 999px;
  background: rgba(61, 90, 61, 0.12);
  overflow: hidden;
  margin-bottom: 10px;
}

.exp-bar {
  height: 100%;
  background: linear-gradient(90deg, #a8d5a2, #7fb069);
  transition: width 0.4s ease;
}

.exp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #3d5a3d;
  font-weight: 600;
}

.codex-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.codex-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border-radius: 10px;
  background: rgba(61, 90, 61, 0.06);
}

.codex-cell.collected {
  background: rgba(127, 176, 105, 0.22);
}

.codex-icon {
  font-size: 22px;
}

.codex-cell:not(.collected) .codex-icon {
  filter: grayscale(1);
  opacity: 0.5;
}

.codex-name {
  font-size: 11px;
  color: #3d5a3d;
}

.panel-hint {
  font-size: 13px;
  opacity: 0.55;
  line-height: 1.8;
  text-align: center;
  margin-top: 16px;
}

/* ---------- 移动端：底部 sheet 形态由 App.vue 包裹，这里只管内容 ---------- */
@media (max-width: 767px) {
  .codex-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
