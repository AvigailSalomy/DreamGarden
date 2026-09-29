import Phaser from 'phaser';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampScroll,
  clampZoom,
  computeMinZoom,
  decayVelocity,
  isDragGesture,
  zoomAroundPoint,
} from './cameraMath';
import type { WorldSize } from './cameraMath';

/**
 * Encapsulated garden camera control:
 *  - one finger / mouse drag  -> pan (gentle inertial glide + world-bounds clamp)
 *  - two fingers              -> pinch zoom toward the gesture midpoint
 *  - mouse wheel / trackpad   -> smooth zoom toward the pointer
 *  - tap vs drag disambiguation -> onTap(worldX, worldY)
 *  - focusOn() / frameWide() / disable() -> cinematics borrow the camera, then hand it back
 *
 * The minimum zoom is computed from the viewport so a player can always pull back
 * far enough to see most of the garden. The UI lives on its own scene/camera.
 */
export class CameraController {
  onTap?: (worldX: number, worldY: number) => void;

  private cam: Phaser.Cameras.Scene2D.Camera;
  private enabled = false;
  private minZoom = ZOOM_MIN;

  // pan
  private dragging = false;
  private last = { x: 0, y: 0 };
  private down = { x: 0, y: 0, t: 0 };
  private vel = { x: 0, y: 0 };
  private moved = false;
  private panSuppressUntil = 0;

  // zoom
  private targetZoom: number;
  private zoomFocal = { x: 0, y: 0 };

  // multi-touch bookkeeping
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { startDist: number; startZoom: number } | null = null;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldSize,
  ) {
    this.cam = scene.cameras.main;
    const padding = 400;
    this.cam.setBounds(
      -padding,
      -padding,
      world.w + padding * 2,
      world.h + padding * 2,
    );
    this.recomputeMinZoom();
    this.targetZoom = this.cam.zoom;

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleUp, this);
    scene.input.on('wheel', this.handleWheel, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  /* ---------------- public API ---------------- */

  enable(): void {
    this.enabled = true;
    this.targetZoom = this.cam.zoom;
  }

  disable(): void {
    this.enabled = false;
    this.dragging = false;
    this.pinch = null;
    this.pointers.clear();
    this.vel.x = 0;
    this.vel.y = 0;
    this.targetZoom = this.cam.zoom;
  }

  get zoom(): number {
    return this.cam.zoom;
  }

  get minZoomValue(): number {
    return this.minZoom;
  }

  /** Immediately frame the whole garden as wide as this viewport sensibly allows. */
  frameWide(centreX: number, centreY: number): void {
    this.cam.setZoom(this.minZoom);
    this.cam.centerOn(centreX, centreY);
    this.clamp();
    this.targetZoom = this.minZoom;
  }

  /** Smoothly centre on a world point, optionally settling to a specific zoom. */
  focusOn(x: number, y: number, duration = 850, zoom?: number): Promise<void> {
    this.vel.x = 0;
    this.vel.y = 0;
    const tasks: Promise<void>[] = [];

    tasks.push(
      new Promise((resolve) => {
        this.cam.pan(
          x,
          y,
          duration,
          Phaser.Math.Easing.Sine.InOut,
          false,
          (_c, p) => {
            if (p >= 1) resolve();
          },
        );
      }),
    );

    if (zoom !== undefined) {
      const z = clampZoom(zoom, this.minZoom, ZOOM_MAX);
      if (Math.abs(z - this.cam.zoom) > 0.001) {
        tasks.push(
          new Promise((resolve) => {
            this.scene.tweens.add({
              targets: this.cam,
              zoom: z,
              duration,
              ease: 'Sine.easeInOut',
              onComplete: () => resolve(),
            });
          }),
        );
      }
    }

    return Promise.all(tasks).then(() => {
      this.targetZoom = this.cam.zoom;
    });
  }

  /** Re-clamp + recompute the responsive min zoom after the viewport size changes. */
  onResize(): void {
    this.recomputeMinZoom();
    if (this.cam.zoom < this.minZoom) this.cam.setZoom(this.minZoom);
    this.targetZoom = clampZoom(this.targetZoom, this.minZoom, ZOOM_MAX);
    this.clamp();
  }

  private recomputeMinZoom(): void {
    this.minZoom = computeMinZoom(this.cam.width, this.cam.height);
  }

  private cz(z: number): number {
    return clampZoom(z, this.minZoom, ZOOM_MAX);
  }

  /* ---------------- pointer plumbing ---------------- */

  private uiHasPointer(): boolean {
    return this.scene.registry.get('pointerOnUI') === true;
  }

  private handleDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    this.pointers.set(p.id, { x: p.x, y: p.y });

    if (this.pointers.size >= 2) {
      this.beginPinch();
      return;
    }
    if (this.uiHasPointer()) return;

    this.dragging = true;
    this.moved = false;
    this.last.x = p.x;
    this.last.y = p.y;
    this.down.x = p.x;
    this.down.y = p.y;
    this.down.t = this.scene.time.now;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  private handleMove(p: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    if (this.pointers.has(p.id)) this.pointers.set(p.id, { x: p.x, y: p.y });

    if (this.pinch && this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }
    if (!this.dragging) return;
    if (this.scene.time.now < this.panSuppressUntil) {
      this.last.x = p.x;
      this.last.y = p.y;
      return;
    }

    const dx = p.x - this.last.x;
    const dy = p.y - this.last.y;
    this.last.x = p.x;
    this.last.y = p.y;

    if (!this.moved && isDragGesture(p.x - this.down.x, p.y - this.down.y, 0)) {
      this.moved = true;
    }
    if (!this.moved) return;

    this.cam.scrollX -= dx / this.cam.zoom;
    this.cam.scrollY -= dy / this.cam.zoom;
    // clamp the tracked velocity so a hard flick can't rocket across the world
    this.vel.x = Phaser.Math.Clamp(dx, -55, 55);
    this.vel.y = Phaser.Math.Clamp(dy, -55, 55);
    this.clamp();
  }

  private handleUp(p: Phaser.Input.Pointer): void {
    this.pointers.delete(p.id);

    if (this.pinch) {
      if (this.pointers.size >= 2) {
        this.beginPinch();
      } else {
        this.endPinch();
      }
      return;
    }

    if (!this.dragging) return;
    this.dragging = false;
    const dt = this.scene.time.now - this.down.t;
    const drag = isDragGesture(p.x - this.down.x, p.y - this.down.y, dt);
    if (!drag && this.enabled && !this.uiHasPointer()) {
      this.vel.x = 0;
      this.vel.y = 0;
      const wp = this.cam.getWorldPoint(p.x, p.y);
      this.onTap?.(wp.x, wp.y);
    }
  }

  /* ---------------- pinch ---------------- */

  private pointerPair():
    | [{ x: number; y: number }, { x: number; y: number }]
    | null {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return null;
    return [pts[0], pts[1]];
  }

  private beginPinch(): void {
    const pair = this.pointerPair();
    if (!pair) return;
    this.dragging = false;
    this.vel.x = 0;
    this.vel.y = 0;
    const dist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1;
    this.pinch = { startDist: dist, startZoom: this.cam.zoom };
  }

  private updatePinch(): void {
    const pair = this.pointerPair();
    if (!pair || !this.pinch) return;
    const dist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1;
    const midX = (pair[0].x + pair[1].x) / 2;
    const midY = (pair[0].y + pair[1].y) / 2;
    // slight amplification so a small, natural spread does enough
    const ratio = Math.pow(dist / this.pinch.startDist, 1.15);
    this.applyZoom(this.cz(this.pinch.startZoom * ratio), midX, midY, true);
  }

  private endPinch(): void {
    this.pinch = null;
    const remaining = [...this.pointers.values()][0];
    if (remaining) {
      this.dragging = true;
      this.moved = true;
      this.last.x = remaining.x;
      this.last.y = remaining.y;
      this.down.x = remaining.x;
      this.down.y = remaining.y;
      this.down.t = this.scene.time.now;
    } else {
      this.dragging = false;
    }
    this.vel.x = 0;
    this.vel.y = 0;
    this.panSuppressUntil = this.scene.time.now + 120;
    this.targetZoom = this.cam.zoom;
  }

  /* ---------------- wheel ---------------- */

  private handleWheel(
    p: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number,
  ): void {
    if (!this.enabled || this.uiHasPointer()) return;
    const factor = Math.exp(-dy * 0.0018);
    const nextZoom = clampZoom(this.targetZoom * factor, 0.22, 1.25);
    this.applyZoom(nextZoom, p.x, p.y, false);
  }

  /* ---------------- zoom apply + loop ---------------- */

  private applyZoom(
    z: number,
    focalX: number,
    focalY: number,
    immediate: boolean,
  ): void {
    this.targetZoom = z;
    this.zoomFocal.x = focalX;
    this.zoomFocal.y = focalY;
    if (immediate) this.setZoom(z, focalX, focalY);
  }

  private setZoom(z: number, focalX: number, focalY: number): void {
    const next = zoomAroundPoint(
      {
        width: this.cam.width,
        height: this.cam.height,
        zoom: this.cam.zoom,
        scrollX: this.cam.scrollX,
        scrollY: this.cam.scrollY,
      },
      focalX - this.cam.x,
      focalY - this.cam.y,
      z,
    );
    this.cam.setZoom(z);
    this.cam.scrollX = next.scrollX;
    this.cam.scrollY = next.scrollY;
    this.clamp();
  }

  private update = (_time: number, delta: number): void => {
    // ease wheel zoom toward its target (responsive but smooth)
    if (this.enabled && Math.abs(this.cam.zoom - this.targetZoom) > 0.0008) {
      const k = 1 - Math.pow(0.0012, delta / 1000);
      const z = this.cz(Phaser.Math.Linear(this.cam.zoom, this.targetZoom, k));
      this.setZoom(
        z,
        this.zoomFocal.x || this.cam.width / 2,
        this.zoomFocal.y || this.cam.height / 2,
      );
    }

    // gentle inertial pan
    if (this.dragging || this.pinch || (this.vel.x === 0 && this.vel.y === 0))
      return;
    this.cam.scrollX -= this.vel.x / this.cam.zoom;
    this.cam.scrollY -= this.vel.y / this.cam.zoom;
    this.vel.x = decayVelocity(this.vel.x, delta);
    this.vel.y = decayVelocity(this.vel.y, delta);
    this.clamp();
  };

  private clamp(): void {
    // clampScroll works in a [0, world] space. The real scroll range is
    // [-padding, world+padding], so shift IN by +padding before clamping,
    // then shift back OUT by -padding after — both halves are required.
    // (The previous version only shifted out, never in, which drove scroll
    // toward a broken fixed point near -padding on both axes within a few
    // frames — the camera would appear to work briefly then freeze.)
    const padding = 400;
    const c = clampScroll(
      this.cam.scrollX + padding,
      this.cam.scrollY + padding,
      { width: this.cam.width, height: this.cam.height, zoom: this.cam.zoom },
      { w: this.world.w + padding * 2, h: this.world.h + padding * 2 },
    );
    this.cam.scrollX = c.x - padding;
    this.cam.scrollY = c.y - padding;
  }

  private destroy(): void {
    this.scene.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleDown,
      this,
    );
    this.scene.input.off(
      Phaser.Input.Events.POINTER_MOVE,
      this.handleMove,
      this,
    );
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    this.scene.input.off(
      Phaser.Input.Events.POINTER_UP_OUTSIDE,
      this.handleUp,
      this,
    );
    this.scene.input.off('wheel', this.handleWheel, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
  }
}

export { ZOOM_MIN, ZOOM_MAX };
