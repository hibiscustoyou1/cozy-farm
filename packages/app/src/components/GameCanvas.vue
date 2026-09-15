<script setup lang="ts">
/**
 * Phaser 画布容器 —— 游戏实例的挂载点与主循环驱动。
 *
 * - Phaser 实例用局部变量持有（不进响应式，避免 Vue 代理整棵对象树）
 * - 主循环用独立 rAF：每帧只调 store.frame()（推 gameTime），
 *   时钟 UI 每秒刷一次 —— 高频/低频分离
 */
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type Phaser from 'phaser';
import { createGame } from '@cozy-farm/game';
import { useGameStore } from '../stores/game';

const store = useGameStore();
const containerEl = ref<HTMLElement | null>(null);
// 仅类型引用 + shallowRef 持有实例
const game = shallowRef<Phaser.Game | null>(null);

let rafId = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  if (!containerEl.value) return;

  // 挂载 Phaser（注入只读访问器，单向数据流）
  game.value = createGame(containerEl.value, () => store.gameData);

  // 主循环：推 gameTime（高频，无响应式开销）
  const loop = (ts: number) => {
    store.frame(ts);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  // 顶栏时钟：每秒同步一次低频镜像
  clockTimer = setInterval(() => store.refreshClock(), 1000);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  if (clockTimer) clearInterval(clockTimer);
  game.value?.destroy(true);
  game.value = null;
});
</script>

<template>
  <div ref="containerEl" class="game-canvas"></div>
</template>

<style scoped>
.game-canvas {
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none; /* 阻止浏览器手势，触摸全归游戏 */
}
</style>
