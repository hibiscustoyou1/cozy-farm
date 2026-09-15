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

  preload(): void {
    // 主环境图集为 7×7 的 16×16 像素图块；从 public 目录加载，供 M1 地图系统复用。
    this.load.spritesheet('environment', '/assets/environment/ellen0ra/cozy-farm-tileset.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
  }

  create(): void {
    // M0 先用图集首帧铺设草地；M1 再由 Tilemap 接管具体地形和地块状态。
    const grass = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, 'environment', 0)
      .setOrigin(0);

    const hint = this.add
      .text(0, 0, '四季田园 · 环境资源已接入', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#3d5a3d',
      })
      .setOrigin(0.5)
      .setShadow(1, 1, '#f4efe0', 2, true, true);

    const resize = (gameSize: Phaser.Structs.Size): void => {
      grass.setSize(gameSize.width, gameSize.height);
      hint.setPosition(gameSize.width / 2, gameSize.height / 2);
    };

    // RESIZE 模式下，背景和标语跟随可视区域；不把高频状态放进 Vue。
    this.scale.on('resize', resize);
    resize(this.scale.gameSize);

    // 演示 gameTime 已接入：昼夜先以镜头色调表现，后续替换为真正的全场景滤镜。
    this.events.on('update', () => {
      const state = this.getState();
      const hour = (state.gameTime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000);
      this.cameras.main.setBackgroundColor(hour >= 6 && hour < 18 ? '#a8d5a2' : '#2b3a4a');
      grass.setAlpha(hour >= 6 && hour < 18 ? 1 : 0.7);
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
