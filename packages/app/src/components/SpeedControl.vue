<script setup lang="ts">
/**
 * 速度选择器 —— 本作核心特色：在线时间流速手动可调（⏸/1x/2x/5x/10x）
 *
 * 桌面快捷键：空格 = 暂停/恢复，1/2/3/4 = 1x/2x/5x/10x（在 App.vue 全局注册）
 */
import { SPEED_STEPS, type Speed } from '@cozy-farm/core';
import { useGameStore } from '../stores/game';

const store = useGameStore();

const STEP_LABELS: Record<Speed, string> = {
  0: '⏸',
  1: '1x',
  2: '2x',
  5: '5x',
  10: '10x',
};

function pick(s: Speed) {
  store.setSpeed(s);
}
</script>

<template>
  <div class="speed-control" role="group" aria-label="时间流速">
    <button
      v-for="s in SPEED_STEPS"
      :key="s"
      class="speed-btn"
      :class="{ active: store.speed === s }"
      :aria-pressed="store.speed === s"
      @click="pick(s)"
    >
      {{ STEP_LABELS[s] }}
    </button>
  </div>
</template>

<style scoped>
.speed-control {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: rgba(61, 90, 61, 0.15);
  border-radius: 10px;
}

.speed-btn {
  /* 移动端可用性底线：触摸目标 ≥ 44px */
  min-width: 44px;
  min-height: 44px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #3d5a3d;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.speed-btn.active {
  background: #7fb069;
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.speed-btn:not(.active):hover {
  background: rgba(127, 176, 105, 0.25);
}
</style>
