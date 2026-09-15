/**
 * @cozy-farm/game —— Phaser 表现层（M1：农场网格 + 种植循环渲染）
 *
 * 分层纪律：
 * - 本包不 import 任何 Vue 组件 / Pinia（仅允许类型）
 * - 场景对 GameState 只读；玩家输入只通过 onTileActivate 上报，
 *   由 app 层结合当前工具调 core 系统函数（单向数据流）
 * - 每帧 diff 渲染：状态没变的格子不碰纹理，避免无谓的重绘
 */

import Phaser from 'phaser';
import {
  effectiveGrownMs,
  cropGrowMs,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
  type GameState,
} from '@cozy-farm/core';
import {
  allCropTextureKeys,
  cropTextureKey,
  cropTint,
  growthStage,
  FRAME_GRASS,
  FRAME_TILLED,
  FRAME_WILD,
  type GrowthStage,
} from './visuals';

/** 注入给 Phaser 侧的钩子（由 app 层实现） */
export interface FarmHooks {
  /** 只读状态访问器 */
  getState: () => GameState;
  /** 玩家激活某格（点击/拖动划过）——app 层按当前工具解释语义 */
  onTileActivate: (tileId: number) => void;
  /** 可选：当前工具对该格是否可用（hover 高亮红/绿） */
  canActivate?: (tileId: number) => boolean;
  /**
   * 可选：锁定块的展示信息（M2 扩地）。
   * 返回价格 = 相邻可购；undefined = 不可购（远端锁定块）。
   */
  lockedTilePrice?: (tileId: number) => number | undefined;
}

/** 世界坐标下每格显示尺寸（16px 素材 ×4 整数缩放，作物 32px ×2） */
const TILE_PX = 64;

/** 农场网格世界尺寸（最大 10×8） */
const FARM_W = MAX_GRID_COLS * TILE_PX;
const FARM_H = MAX_GRID_ROWS * TILE_PX;

export class FarmScene extends Phaser.Scene {
  private hooks!: FarmHooks;

  /** tileId → 地块底图（帧：wild / tilled / 锁定） */
  private tileImages = new Map<number, Phaser.GameObjects.Image>();
  /** tileId → 锁定块标签（🔒 或 💰价格，M2 扩地） */
  private lockLabels = new Map<number, Phaser.GameObjects.Text>();
  /** tileId → 作物精灵（growing/mature 时存在） */
  private cropSprites = new Map<number, Phaser.GameObjects.Image>();
  /** tileId → 渲染缓存 key（state|stage），变了才更新纹理 */
  private renderKeys = new Map<number, string>();
  /** tileId → 成熟弹跳 tween（收获时停止） */
  private bounceTweens = new Map<number, Phaser.Tweens.Tween>();

  private hoverGrid!: Phaser.GameObjects.Graphics;
  private sparkEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  /** 一次拖动手势内已激活的格子（去重） */
  private gestureTiles = new Set<number>();
  private hoverTileId: number | null = null;

  constructor() {
    super({ key: 'farm' });
  }

  init(data: FarmHooks): void {
    this.hooks = data;
    // restart 复用场景时清掉上一世的渲染状态
    this.tileImages.clear();
    this.lockLabels.clear();
    this.cropSprites.clear();
    this.renderKeys.clear();
    this.bounceTweens.clear();
    this.gestureTiles.clear();
    this.hoverTileId = null;
  }

  preload(): void {
    this.load.spritesheet('environment', '/assets/environment/ellen0ra/cozy-farm-tileset.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    // Mossbell 作物阶段图（32×32 独立 PNG，按物种去重加载）
    for (const { key, species, stage } of allCropTextureKeys()) {
      this.load.image(key, `/assets/world/mossbell/sprites/crops/${species}_stage_0${stage}.png`);
    }
  }

  create(): void {
    const { width, height } = this.scale.gameSize;

    // ---- 背景：纯草铺底（tileSprite 平铺，16px 素材放大 4 倍与格对齐） ----
    this.add
      .tileSprite(-2000, -2000, FARM_W + 4000, FARM_H + 4000, 'environment', FRAME_GRASS)
      .setOrigin(0)
      .setTileScale(4);

    // ---- 网格：最大 10×8，每格一块底图（可交互，锁定块也响应点击买地） ----
    for (let row = 0; row < MAX_GRID_ROWS; row++) {
      for (let col = 0; col < MAX_GRID_COLS; col++) {
        const id = row * MAX_GRID_COLS + col;
        const img = this.add
          .image(col * TILE_PX, row * TILE_PX, 'environment', FRAME_WILD)
          .setOrigin(0)
          .setScale(4); // 16px → 64px
        img.setData('tileId', id);
        img.setInteractive({ useHandCursor: true });
        this.tileImages.set(id, img);
      }
    }

    // ---- hover 高亮框 ----
    this.hoverGrid = this.add.graphics().setDepth(10);

    // ---- 收获粒子（小黄花帧，爆发式） ----
    this.sparkEmitter = this.add.particles(0, 0, 'environment', {
      frame: 6,
      speed: { min: 60, max: 160 },
      lifespan: 650,
      scale: { start: 3, end: 0 },
      gravityY: 300,
      emitting: false,
    });
    this.sparkEmitter.setDepth(20);

    // ---- 输入 ----
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const id = this.tileAt(p);
      if (id === null) return;
      this.gestureTiles.clear(); // 新手势
      this.gestureTiles.add(id);
      this.hooks.onTileActivate(id);
    });
    // 拖动批量：按住划过连续激活（手势内去重）
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const id = this.tileAt(p);
      this.hoverTileId = id; // hover 高亮跟随（无论是否按下）
      if (p.isDown && id !== null && !this.gestureTiles.has(id)) {
        this.gestureTiles.add(id);
        this.hooks.onTileActivate(id);
      }
    });
    this.input.on('pointerup', () => this.gestureTiles.clear());

    // ---- 相机自适应：农场居中，zoom 随视口伸缩 ----
    const fitCamera = (): void => {
      const cam = this.cameras.main;
      const pad = TILE_PX; // 农场四周至少留一格视野
      const zoom = Phaser.Math.Clamp(
        Math.min(width / (FARM_W + pad * 2), height / (FARM_H + pad * 2)),
        0.6,
        1.6,
      );
      cam.setZoom(zoom);
      cam.centerOn(FARM_W / 2, FARM_H / 2);
    };
    fitCamera();
    this.scale.on('resize', () => fitCamera());

    // 首帧渲染一次状态（之后每帧 diff）
    this.syncTiles(true);
  }

  override update(): void {
    const state = this.hooks.getState();

    // 昼夜背景（M0 逻辑保留：白天/夜晚两档底色）
    const hour = (state.gameTime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000);
    const day = hour >= 6 && hour < 18;
    this.cameras.main.setBackgroundColor(day ? '#a8d5a2' : '#2b3a4a');

    this.syncTiles(false);
    this.drawHover();
  }

  // ---------- 内部：状态 diff 渲染 ----------

  /** 把 GameState 的地块同步到显示对象；force = 首帧全量 */
  private syncTiles(force: boolean): void {
    const state = this.hooks.getState();
    const unlocked = new Set(state.unlockedTileIds);

    for (const tile of state.tiles) {
      const isUnlocked = unlocked.has(tile.id);

      // 锁定块：半透明草地 + 标签（可购价格 / 🔒），不参与作物渲染
      if (!isUnlocked) {
        const price = this.hooks.lockedTilePrice?.(tile.id);
        const key = `locked|${price ?? '-'}`;
        if (!force && this.renderKeys.get(tile.id) === key) continue;
        this.renderKeys.set(tile.id, key);

        const img = this.tileImages.get(tile.id);
        if (img) {
          img.setFrame(FRAME_GRASS);
          img.setAlpha(0.45);
        }
        this.removeCrop(tile.id);
        this.updateLockLabel(tile.id, price);
        continue;
      }

      // 解锁块：正常渲染
      let stage: GrowthStage | null = null;
      if (tile.state === 'growing' && tile.crop) {
        const progress = effectiveGrownMs(state, tile) / cropGrowMs(tile.crop);
        stage = growthStage(Math.min(progress, 1));
      } else if (tile.state === 'mature') {
        stage = 4;
      }
      const key = `${tile.state}|${stage ?? '-'}`;
      if (!force && this.renderKeys.get(tile.id) === key) continue;
      this.renderKeys.set(tile.id, key);

      const img = this.tileImages.get(tile.id);
      if (img) {
        img.setAlpha(1);
        img.setFrame(tile.state === 'wild' ? FRAME_WILD : FRAME_TILLED);
      }
      this.removeLockLabel(tile.id);

      // 作物精灵：growing/mature 显示，其他状态销毁
      const col = tile.id % MAX_GRID_COLS;
      const row = Math.floor(tile.id / MAX_GRID_COLS);
      const cx = col * TILE_PX + TILE_PX / 2;
      const cyBottom = (row + 1) * TILE_PX;

      if (stage !== null && tile.crop) {
        let sprite = this.cropSprites.get(tile.id);
        if (!sprite) {
          sprite = this.add.image(cx, cyBottom, cropTextureKey(tile.crop, stage));
          sprite.setOrigin(0.5, 1); // 底部对齐格底
          sprite.setScale(2); // 32px → 64px
          this.cropSprites.set(tile.id, sprite);
        } else {
          sprite.setTexture(cropTextureKey(tile.crop, stage));
        }
        const tint = cropTint(tile.crop);
        if (tint !== undefined) sprite.setTint(tint);
        else sprite.clearTint();

        // 成熟：弹跳提示（收获时移除）
        if (tile.state === 'mature' && !this.bounceTweens.has(tile.id)) {
          this.bounceTweens.set(
            tile.id,
            this.tweens.add({
              targets: sprite,
              y: cyBottom - 6,
              duration: 480,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.InOut',
            }),
          );
        }
      } else if (this.cropSprites.has(tile.id)) {
        // 作物消失（收获）：粒子庆祝 + 清理
        this.harvestBurst(col, row);
        this.removeCrop(tile.id);
      }
    }
  }

  private removeCrop(tileId: number): void {
    this.cropSprites.get(tileId)?.destroy();
    this.cropSprites.delete(tileId);
    const tw = this.bounceTweens.get(tileId);
    if (tw) {
      tw.remove();
      this.bounceTweens.delete(tileId);
    }
  }

  /** 锁定块标签：可购显示价格，远端显示 🔒；解锁后移除 */
  private updateLockLabel(tileId: number, price: number | undefined): void {
    const col = tileId % MAX_GRID_COLS;
    const row = Math.floor(tileId / MAX_GRID_COLS);
    const cx = col * TILE_PX + TILE_PX / 2;
    const cy = row * TILE_PX + TILE_PX / 2;
    const text = price !== undefined ? `💰${price}` : '🔒';

    let label = this.lockLabels.get(tileId);
    if (!label) {
      label = this.add
        .text(cx, cy, text, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#3d5a3d',
        })
        .setOrigin(0.5)
        .setDepth(5);
      this.lockLabels.set(tileId, label);
    } else {
      label.setText(text);
    }
  }

  private removeLockLabel(tileId: number): void {
    this.lockLabels.get(tileId)?.destroy();
    this.lockLabels.delete(tileId);
  }

  private harvestBurst(col: number, row: number): void {
    this.sparkEmitter.explode(
      10,
      col * TILE_PX + TILE_PX / 2,
      row * TILE_PX + TILE_PX / 2,
    );
  }

  // ---------- 内部：输入与高亮 ----------

  /** 指针世界坐标 → 格子 id（网格外返回 null） */
  private tileAt(p: Phaser.Input.Pointer): number | null {
    const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const col = Math.floor(world.x / TILE_PX);
    const row = Math.floor(world.y / TILE_PX);
    if (col < 0 || col >= MAX_GRID_COLS || row < 0 || row >= MAX_GRID_ROWS) return null;
    return row * MAX_GRID_COLS + col;
  }

  /** hover 高亮：canActivate 绿框 / 否则红框（无判定回调时中性白框） */
  private drawHover(): void {
    const g = this.hoverGrid;
    g.clear();
    if (this.hoverTileId === null) return;

    const id = this.hoverTileId;
    const col = id % MAX_GRID_COLS;
    const row = Math.floor(id / MAX_GRID_COLS);
    const x = col * TILE_PX;
    const y = row * TILE_PX;

    let color = 0xffffff;
    let alpha = 0.25;
    if (this.hooks.canActivate) {
      const ok = this.hooks.canActivate(id);
      color = ok ? 0x7fb069 : 0xd97757;
      alpha = ok ? 0.28 : 0.18;
    }
    g.fillStyle(color, alpha);
    g.fillRect(x, y, TILE_PX, TILE_PX);
    g.lineStyle(3, color, 0.9);
    g.strokeRect(x + 1.5, y + 1.5, TILE_PX - 3, TILE_PX - 3);
  }
}

/** 创建 Phaser 游戏实例（由 app 层在 Vue onMounted 中调用） */
export function createGame(parent: HTMLElement, hooks: FarmHooks): Phaser.Game {
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
    // 场景 init 数据：注入钩子（单向数据流的入口）
    callbacks: {
      postBoot: (game) => {
        game.scene.getScene('farm')?.scene.restart({ ...hooks });
      },
    },
  });
}
