import Phaser from "phaser";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampScroll,
  clampZoom,
  decayVelocity,
  isDragGesture,
  zoomAroundPoint,
} from "./cameraMath";
import type { WorldSize } from "./cameraMath";

/**
 * Encapsulated garden camera control:
 *  - one finger / mouse drag  -> pan (with inertial glide + world-bounds clamp)
 *  - two fingers              -> pinch zoom toward the gesture midpoint
 *  - mouse wheel / trackpad   -> zoom toward the pointer
 *  - tap vs drag disambiguation -> onTap(worldX, worldY)
 *  - focusOn() / disable()      -> reveal sequences borrow the camera, then hand it back
 *
 * The UI lives on its own scene/camera and is never touched by this.
 */
export class CameraController {
  onTap?: (worldX: number, worldY: number) => void;

  private cam: Phaser.Cameras.Scene2D.Camera;
  private enabled = false;

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
    this.cam.setBounds(0, 0, world.w, world.h);
    this.targetZoom = this.cam.zoom;

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleUp, this);
    scene.input.on("wheel", this.handleWheel, this);
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

  /** Smoothly centre on a world point, optionally settling to a specific zoom. */
  focusOn(x: number, y: number, duration = 850, zoom?: number): Promise<void> {
    this.vel.x = 0;
    this.vel.y = 0;
    const tasks: Promise<void>[] = [];

    tasks.push(
      new Promise((resolve) => {
        this.cam.pan(x, y, duration, Phaser.Math.Easing.Sine.InOut, false, (_c, p) => {
          if (p >= 1) resolve();
        });
      }),
    );

    if (zoom !== undefined && Math.abs(zoom - this.cam.zoom) > 0.001) {
      tasks.push(
        new Promise((resolve) => {
          this.scene.tweens.add({
            targets: this.cam,
            zoom,
            duration,
            ease: "Sine.easeInOut",
            onComplete: () => resolve(),
          });
        }),
      );
    }

    return Promise.all(tasks).then(() => {
      this.targetZoom = this.cam.zoom;
    });
  }

  /** Re-clamp after the viewport size changes. */
  onResize(): void {
    this.clamp();
  }

  get zoom(): number {
    return this.cam.zoom;
  }

  /* ---------------- pointer plumbing ---------------- */

  private uiHasPointer(): boolean {
    return this.scene.registry.get("pointerOnUI") === true;
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
    this.vel.x = dx;
    this.vel.y = dy;
    this.clamp();
  }

  private handleUp(p: Phaser.Input.Pointer): void {
    this.pointers.delete(p.id);

    if (this.pinch) {
      if (this.pointers.size >= 2) {
        this.beginPinch(); // still pinching with a different pair
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

  private pointerPair(): [{ x: number; y: number }, { x: number; y: number }] | null {
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
    const z = clampZoom((this.pinch.startZoom * dist) / this.pinch.startDist);
    this.applyZoom(z, midX, midY, true);
  }

  private endPinch(): void {
    this.pinch = null;
    // hand back to one-finger pan without a jump
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
    const factor = Math.exp(-dy * 0.0016);
    const z = clampZoom(this.targetZoom * factor);
    this.applyZoom(z, p.x, p.y, false);
  }

  /* ---------------- zoom apply + loop ---------------- */

  private applyZoom(z: number, focalX: number, focalY: number, immediate: boolean): void {
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
    // ease wheel zoom toward its target
    if (this.enabled && Math.abs(this.cam.zoom - this.targetZoom) > 0.0008) {
      const k = 1 - Math.pow(0.0025, delta / 1000);
      const z = clampZoom(Phaser.Math.Linear(this.cam.zoom, this.targetZoom, k));
      this.setZoom(z, this.zoomFocal.x || this.cam.width / 2, this.zoomFocal.y || this.cam.height / 2);
    }

    // inertial pan
    if (this.dragging || this.pinch || (this.vel.x === 0 && this.vel.y === 0)) return;
    this.cam.scrollX -= this.vel.x / this.cam.zoom;
    this.cam.scrollY -= this.vel.y / this.cam.zoom;
    this.vel.x = decayVelocity(this.vel.x, delta);
    this.vel.y = decayVelocity(this.vel.y, delta);
    this.clamp();
  };

  private clamp(): void {
    const c = clampScroll(
      this.cam.scrollX,
      this.cam.scrollY,
      { width: this.cam.width, height: this.cam.height, zoom: this.cam.zoom },
      this.world,
    );
    this.cam.scrollX = c.x;
    this.cam.scrollY = c.y;
  }

  private destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleUp, this);
    this.scene.input.off("wheel", this.handleWheel, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
  }
}

export { ZOOM_MIN, ZOOM_MAX };
