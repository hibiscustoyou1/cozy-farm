/**
 * @cozy-farm/game —— Phaser 表现层
 *
 * 分层纪律：
 * - 本包不 import 任何 Vue 组件 / Pinia（仅允许类型）
 * - 场景对 GameState 只读；一切修改必须走 core 的系统函数（单向数据流）
 * - 数据通过 createGame 注入的只读访问器获取，不持有副本
 */

import Phaser from 'phaser';
import type { GameState } from '@cozy-farm/core';

/** 注入给 Phaser 侧的只读数据访问器 */
export type GameStateAccessor = () => GameState;

/** 农场主场景（M0 占位：天空底色 + 居中提示文字） */
export class FarmScene extends Phaser.Scene {
  private getState!: GameStateAccessor;

  constructor() {
    super({ key: 'farm' });
  }

  init(data: { getState: GameStateAccessor }): void {
    this.getState = data.getState;
  }

  create(): void {
    const state = this.getState();

    // M0 占位画面：随昼夜变化的底色 + 提示文字
    // TODO(M0): 接入 16x16 瓦片地图与相机拖拽/捏合缩放
    // TODO(M1): 地块渲染（荒地/耕地/生长阶段/成熟）、工具交互高亮
    this.cameras.main.setBackgroundColor('#a8d5a2');

    const hint = this.add
      .text(0, 0, '四季田园 · 农场画布（M0 占位）', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#3d5a3d',
      })
      .setOrigin(0.5);

    // RESIZE 模式下跟随视口居中
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      hint.setPosition(gameSize.width / 2, gameSize.height / 2);
    });
    hint.setPosition(this.scale.width / 2, this.scale.height / 2);

    // 演示 gameTime 已接入：白天/黄昏切换底色（后续替换为真正的昼夜滤镜）
    this.events.on('update', () => {
      const s = this.getState();
      const hour = (s.gameTime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000);
      this.cameras.main.setBackgroundColor(hour >= 6 && hour < 18 ? '#a8d5a2' : '#2b3a4a');
    });
  }
}

/** 创建 Phaser 游戏实例（由 app 层在 Vue onMounted 中调用） */
export function createGame(parent: HTMLElement, getState: GameStateAccessor): Phaser.Game {
  return new Phaser.Game({
    parent,
    type: Phaser.AUTO,
    pixelArt: true, // 像素风渲染：禁用平滑，整数倍缩放
    backgroundColor: '#a8d5a2',
    scale: {
      mode: Phaser.Scale.RESIZE, // 弹性利用全部屏幕，不留黑边
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [FarmScene],
    // 场景 init 数据：注入只读访问器（单向数据流的入口）
    callbacks: {
      postBoot: (game) => {
        game.scene.getScene('farm')?.scene.restart({ getState });
      },
    },
  });
}
