import Phaser from "phaser";
import { clampScroll, decayVelocity, isDragGesture } from "./cameraMath";
import type { WorldSize } from "./cameraMath";

/**
 * Touch / mouse drag-to-pan for the garden camera:
 *  - drag to pan, release for inertial glide
 *  - hard clamp to world bounds
 *  - tap vs drag disambiguation (short + still = tap -> onTap)
 *  - focusOn() for the scripted camera move during a reveal
 */
export class CameraController {
  onTap?: (worldX: number, worldY: number) => void;

  private cam: Phaser.Cameras.Scene2D.Camera;
  private enabled = false;
  private dragging = false;
  private last = { x: 0, y: 0 };
  private down = { x: 0, y: 0, t: 0 };
  private vel = { x: 0, y: 0 };
  private moved = false;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldSize,
  ) {
    this.cam = scene.cameras.main;
    this.cam.setBounds(0, 0, world.w, world.h);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleUp, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
    this.dragging = false;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  /** Smoothly centre the camera on a world point. Resolves when the pan finishes. */
  focusOn(x: number, y: number, duration = 850): Promise<void> {
    this.vel.x = 0;
    this.vel.y = 0;
    return new Promise((resolve) => {
      this.cam.pan(x, y, duration, Phaser.Math.Easing.Sine.InOut, false, (_c, progress) => {
        if (progress >= 1) resolve();
      });
    });
  }

  private uiHasPointer(): boolean {
    return this.scene.registry.get("pointerOnUI") === true;
  }

  private handleDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled || this.uiHasPointer()) return;
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
    if (!this.dragging || !this.enabled) return;
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
    if (!this.dragging) return;
    this.dragging = false;
    const dt = this.scene.time.now - this.down.t;
    const drag = isDragGesture(p.x - this.down.x, p.y - this.down.y, dt);
    if (!drag && this.enabled) {
      this.vel.x = 0;
      this.vel.y = 0;
      const wp = this.cam.getWorldPoint(p.x, p.y);
      this.onTap?.(wp.x, wp.y);
    }
  }

  private update = (_time: number, delta: number): void => {
    if (this.dragging || (this.vel.x === 0 && this.vel.y === 0)) return;
    this.cam.scrollX -= this.vel.x;
    this.cam.scrollY -= this.vel.y;
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
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
  }
}
