<script setup lang="ts">
/**
 * 根组件 —— 双端响应式布局骨架（M0）
 *
 * 桌面 (≥1024px)：顶栏 + [工具栏 | 画布 | 信息面板] 三栏
 * 移动端 (<768px)：顶栏(紧凑) + 全屏画布 + 底部标签栏
 *
 * TODO(M0+)：工具栏（锄头/种子/水壶）、信息面板内容、底部标签页路由
 */
import { onBeforeUnmount, onMounted } from 'vue';
import GameCanvas from './components/GameCanvas.vue';
import SpeedControl from './components/SpeedControl.vue';
import { useGameStore } from './stores/game';
import type { Speed } from '@cozy-farm/core';

const store = useGameStore();

// ---------- 生命周期 ----------

onMounted(() => {
  // 读档时执行离线结算（"你不在的时候…"）
  store.settleOnLoad();

  // 桌面快捷键：空格 = 暂停/恢复，1/2/3/4 = 1x/2x/5x/10x
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});

let lastNonZeroSpeed: Speed = 1;

function onKeydown(e: KeyboardEvent): void {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (store.speed === 0) {
      store.setSpeed(lastNonZeroSpeed);
    } else {
      lastNonZeroSpeed = store.speed;
      store.setSpeed(0);
    }
  } else if (e.key === '1') store.setSpeed(1);
  else if (e.key === '2') store.setSpeed(2);
  else if (e.key === '3') store.setSpeed(5);
  else if (e.key === '4') store.setSpeed(10);
}

// ---------- 移动端底部标签（M0 占位） ----------
const TABS = [
  { key: 'shop', label: '商店' },
  { key: 'bag', label: '背包' },
  { key: 'codex', label: '图鉴' },
] as const;
</script>

<template>
  <div class="app-shell">
    <!-- 顶栏：常驻状态 + 速度选择器 -->
    <header class="topbar">
      <div class="topbar-left">
        <span class="game-title">四季田园</span>
        <span class="stat">🪙 {{ store.gold }}</span>
        <span class="stat hide-narrow">Lv.{{ store.level }}</span>
      </div>
      <div class="topbar-right">
        <span class="stat hide-narrow">{{ store.seasonLabel }}</span>
        <span class="stat clock">🕐 {{ store.clockLabel }}</span>
        <SpeedControl />
      </div>
    </header>

    <!-- 主区域：桌面三栏 / 移动全屏画布 -->
    <main class="main-area">
      <aside class="side-panel left hide-narrow">
        <p class="panel-hint">工具栏</p>
        <p class="panel-sub">锄头 · 种子 · 水壶<br />（M1 接入）</p>
      </aside>

      <div class="canvas-wrap">
        <GameCanvas />
      </div>

      <aside class="side-panel right hide-narrow">
        <p class="panel-hint">信息面板</p>
        <p class="panel-sub">订单 · 好感 · 图鉴<br />（M2+ 接入）</p>
      </aside>
    </main>

    <!-- 移动端底部标签栏 -->
    <nav class="tabbar">
      <button v-for="t in TABS" :key="t.key" class="tab-btn">
        {{ t.label }}
      </button>
    </nav>

    <!-- 离线结算面板 -->
    <div v-if="store.offlineReport" class="modal-mask" @click.self="store.dismissOfflineReport()">
      <div class="modal">
        <h2>欢迎回来 🌱</h2>
        <p class="modal-text">
          你离开的 {{ Math.round(store.offlineReport.realElapsedMs / 60000) }} 分钟里，农场安静地生长着——
        </p>
        <ul class="modal-list">
          <li v-if="store.offlineReport.maturedCrops.length">
            🌾 有作物成熟了（{{ store.offlineReport.maturedCrops.length }} 种）
          </li>
          <li v-else>🌱 地里的作物还在慢慢长</li>
        </ul>
        <button class="modal-btn" @click="store.dismissOfflineReport()">回到农场</button>
      </div>
    </div>
  </div>
</template>

<style>
/* ---------- 全局 reset 与双端骨架 ---------- */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  /* 移动端 100vh 问题：用 dvh 跟随动态工具栏 */
  height: 100dvh;
  overflow: hidden;
  font-family:
    'Fusion Pixel', '方舟像素字体', system-ui, -apple-system, sans-serif;
  background: #f4efe0;
  color: #3d5a3d;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

/* ---------- 顶栏 ---------- */
.topbar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f4efe0;
  border-bottom: 2px solid #e0d8c3;
  /* 刘海屏安全区 */
  padding-top: calc(8px + env(safe-area-inset-top));
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.game-title {
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 2px;
}

.stat {
  font-size: 14px;
  white-space: nowrap;
}

/* ---------- 主区域 ---------- */
.main-area {
  flex: 1;
  display: flex;
  min-height: 0; /* 关键：让子元素可收缩 */
}

.canvas-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.side-panel {
  flex-shrink: 0;
  width: 240px;
  padding: 16px;
  background: #efe8d5;
  border-right: 2px solid #e0d8c3;
}

.side-panel.right {
  border-right: none;
  border-left: 2px solid #e0d8c3;
}

.panel-hint {
  font-weight: 700;
  margin-bottom: 8px;
}

.panel-sub {
  font-size: 13px;
  opacity: 0.6;
  line-height: 1.8;
}

/* ---------- 移动端底部标签栏 ---------- */
.tabbar {
  flex-shrink: 0;
  display: none; /* 桌面隐藏 */
}

/* ---------- 离线结算 modal ---------- */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(43, 58, 74, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: min(90vw, 380px);
  background: #fffdf5;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.modal h2 {
  margin-bottom: 12px;
}

.modal-text {
  font-size: 14px;
  line-height: 1.8;
  margin-bottom: 12px;
  opacity: 0.85;
}

.modal-list {
  list-style: none;
  margin-bottom: 20px;
  font-size: 14px;
}

.modal-btn {
  min-height: 44px;
  padding: 0 32px;
  border: none;
  border-radius: 10px;
  background: #7fb069;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

/* ---------- 响应式断点：<768px 移动端 ---------- */
@media (max-width: 767px) {
  .hide-narrow {
    display: none !important;
  }

  .topbar {
    padding: 6px 12px;
  }

  .game-title {
    font-size: 16px;
  }

  .tabbar {
    display: flex;
    background: #f4efe0;
    border-top: 2px solid #e0d8c3;
    /* 底部安全区（iPhone home 条） */
    padding-bottom: env(safe-area-inset-bottom);
  }

  .tab-btn {
    flex: 1;
    min-height: 52px;
    border: none;
    background: transparent;
    font-size: 14px;
    color: #3d5a3d;
    cursor: pointer;
  }
}
</style>
