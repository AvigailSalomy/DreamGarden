import Phaser from "phaser";
import { makeIconButton } from "../ui/hit";

export interface PlacementStartOptions {
  textureKey: string;
  targetHeight: number;
  /** Fraction of the raw PNG's height that's actually visible artwork (rest is transparent padding) — see FrostedShopItemDef.visibleHeightFraction. Defaults to 1. */
  contentHeightFraction?: number;
  startX: number;
  startY: number;
  startRotation?: number;
  isValid: (x: number, y: number) => boolean;
  onConfirm: (x: number, y: number, rotation: number) => void;
  onCancel: () => void;
  /**
   * Sims-style drag-and-drop instead of tap-to-move-then-confirm: no toolbar
   * buttons, just a small hint — releasing the pointer over a valid spot
   * commits immediately, releasing over an invalid spot cancels for free.
   * Used for buying a NEW item straight off a Shop card (the player is
   * already holding the pointer down from the card, so the very next
   * pointerup is naturally "let go of it here").
   */
  dragToPlace?: boolean;
}

/**
 * A Sims-style "ghost preview follows the pointer, then confirm or cancel"
 * mode for placing a decoration in FrostedValleyScene's world. Deliberately
 * generic: the owning scene supplies the texture, a validity predicate, and
 * what happens on confirm/cancel — this class only owns the ghost sprite,
 * the pointer plumbing, and a small fixed on-screen toolbar. It knows
 * nothing about the Shop, coins, or SaveState.
 *
 * While active it sets registry `pointerOnUI = true`, which the shared
 * CameraController already reads to suspend drag-panning (see
 * CameraController.uiHasPointer()). That same flag also makes
 * CameraController swallow its own tap dispatch (handleUp's `!this.dragging`
 * guard never sets `dragging=true` while a UI has the pointer) — so
 * placement taps are read directly off `scene.input`, not through
 * `camera.onTap`.
 */
export class FrostedPlacementController {
  private ghost?: Phaser.GameObjects.Image;
  private toolbar?: Phaser.GameObjects.Container;
  private confirmBtn?: Phaser.GameObjects.Container;
  private _active = false;
  private rotation = 0;
  private x = 0;
  private y = 0;
  private isValidFn: (x: number, y: number) => boolean = () => true;
  private onConfirmCb?: (x: number, y: number, rotation: number) => void;
  private onCancelCb?: () => void;
  private dragToPlace = false;

  constructor(private scene: Phaser.Scene) {}

  get active(): boolean {
    return this._active;
  }

  start(opts: PlacementStartOptions): void {
    if (this._active) this.teardown(true);
    this._active = true;
    this.isValidFn = opts.isValid;
    this.onConfirmCb = opts.onConfirm;
    this.onCancelCb = opts.onCancel;
    this.rotation = opts.startRotation ?? 0;
    this.x = opts.startX;
    this.y = opts.startY;
    this.dragToPlace = opts.dragToPlace ?? false;

    this.scene.registry.set("pointerOnUI", true);

    this.ghost = this.scene.add.image(this.x, this.y, opts.textureKey).setOrigin(0.5, 1).setAlpha(0.82).setDepth(9999);
    const native = this.ghost.height || opts.targetHeight;
    this.ghost.setScale(opts.targetHeight / (native * (opts.contentHeightFraction ?? 1)));
    this.ghost.setAngle(this.rotation);

    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointer, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    if (this.dragToPlace) this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.handleDragRelease, this);

    this.buildToolbar();
    this.repositionToolbar();
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.repositionToolbar, this);
    this.refreshValidity();
  }

  cancel(): void {
    if (!this._active) return;
    const cb = this.onCancelCb;
    this.teardown(true);
    cb?.();
  }

  private confirm(): void {
    if (!this._active) return;
    if (!this.isValidFn(this.x, this.y)) return; // Confirm dims when invalid; this is the safety backstop
    const cb = this.onConfirmCb;
    const { x, y, rotation } = this;
    this.teardown(true);
    cb?.(x, y, rotation);
  }

  /** dragToPlace mode: whatever the pointer is doing when it's released IS the decision — no separate confirm tap. */
  private handleDragRelease = (): void => {
    if (!this._active) return;
    if (this.isValidFn(this.x, this.y)) this.confirm();
    else this.cancel();
  };

  private rotate(): void {
    if (!this.ghost) return;
    this.rotation = (this.rotation + 45) % 360;
    this.ghost.setAngle(this.rotation);
  }

  private handlePointer = (p: Phaser.Input.Pointer): void => {
    if (!this.ghost) return;
    const world = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    this.x = world.x;
    this.y = world.y;
    this.ghost.setPosition(this.x, this.y);
    this.ghost.setDepth(this.y); // keep it depth-sorted like a real prop while previewing
    this.refreshValidity();
  };

  private refreshValidity(): void {
    if (!this.ghost) return;
    const ok = this.isValidFn(this.x, this.y);
    this.ghost.setTint(ok ? 0xffffff : 0xff8a8a);
    this.confirmBtn?.setAlpha(ok ? 1 : 0.4);
  }

  /**
   * Built at LOCAL offsets around (0,0) — the toolbar container itself is
   * what gets positioned every frame (see repositionToolbar). `scrollFactor
   * (0)` alone is NOT enough for a "fixed" HUD here: it cancels camera PAN
   * but Phaser still applies the camera's ZOOM to scrollFactor-0 objects, so
   * at any zoom other than 1 (this world is pinch/wheel-zoomable) the old
   * approach rendered the toolbar shrunk and dragged toward the zoom focal
   * point — nowhere near where a player would actually tap.
   */
  private buildToolbar(): void {
    this.toolbar = this.scene.add.container(0, 0).setDepth(10000);

    if (this.dragToPlace) {
      // no buttons at all — the player is already holding the pointer down
      // from the shop card, so releasing it IS the action; just a small
      // reminder of what letting go does.
      const dragHint = this.scene.add
        .text(0, -70, "Drag to a spot, then let go to place it ✨", {
          fontFamily: '"Baloo 2", system-ui, sans-serif',
          fontSize: "15px",
          fontStyle: "600",
          color: "#fef6e8",
        })
        .setOrigin(0.5)
        .setShadow(0, 2, "rgba(0,0,0,0.4)", 3);
      this.toolbar.add(dragHint);
      return;
    }

    const cancelBtn = makeIconButton(this.scene, -100, 0, "✕", 24, () => this.cancel(), {
      hitW: 68,
      hitH: 68,
      color: "#5b4636",
    });
    const rotateBtn = makeIconButton(this.scene, 0, 0, "⟳", 26, () => this.rotate(), {
      hitW: 68,
      hitH: 68,
      color: "#5b4636",
    });
    const confirmBtn = makeIconButton(this.scene, 100, 0, "✓", 26, () => this.confirm(), {
      hitW: 68,
      hitH: 68,
      color: "#2f6b52",
    });
    this.confirmBtn = confirmBtn;

    const hint = this.scene.add
      .text(0, -62, "Tap to move  ·  ⟳ rotate  ·  ✓ confirm", {
        fontFamily: '"Baloo 2", system-ui, sans-serif',
        fontSize: "15px",
        fontStyle: "600",
        color: "#fef6e8",
      })
      .setOrigin(0.5)
      .setShadow(0, 2, "rgba(0,0,0,0.4)", 3);

    this.toolbar.add([cancelBtn, rotateBtn, confirmBtn, hint]);
  }

  /** Keeps the toolbar pinned to the same SCREEN position/size regardless of the world camera's current pan or zoom. */
  private repositionToolbar = (): void => {
    if (!this.toolbar) return;
    const cam = this.scene.cameras.main;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const pt = cam.getWorldPoint(w / 2, h - 90);
    this.toolbar.setPosition(pt.x, pt.y).setScale(1 / cam.zoom);
  };

  private teardown(destroyGhost: boolean): void {
    this._active = false;
    this.scene.registry.set("pointerOnUI", false);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointer, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointer, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handleDragRelease, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.repositionToolbar, this);
    if (destroyGhost) this.ghost?.destroy();
    this.ghost = undefined;
    this.toolbar?.destroy();
    this.toolbar = undefined;
    this.confirmBtn = undefined;
  }
}
