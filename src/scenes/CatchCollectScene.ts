import Phaser from "phaser";
import { COLORS, labelStyle, titleStyle } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { safeInsets } from "../util/safeArea";
import { bus, requests as requestsService } from "../game/services";
import { Sfx } from "../fx/Sfx";
import { sparkleBurst } from "../fx/Particles";
import type { LevelDef, MiniGameItemDef } from "../data/types";

interface CatchCollectInit {
  objectId: string;
  level: LevelDef;
}

interface GoalState {
  itemId: string;
  icon: string;
  target: number;
  collected: number;
  countText: Phaser.GameObjects.Text;
}

interface FallingItem {
  sprite: Phaser.GameObjects.Image;
  itemId: string;
  speed: number;
  special: boolean;
}

const STAR_CHANCE = 0.06;
const BASKET_HALF_W = 70;
const BASKET_Y_FROM_BOTTOM = 76;

/**
 * Cozy falling-item mini-game: drag/arrow the basket to catch goal items.
 * No lives, no fail state — catching a distractor just does nothing.
 * Launched on top of a paused "Requests"; Continue on completion resumes it.
 */
export class CatchCollectScene extends Phaser.Scene {
  private objectId!: string;
  private levelDef!: LevelDef;
  private goals: GoalState[] = [];
  private pool: MiniGameItemDef[] = [];
  private distractorPool: MiniGameItemDef[] = [];

  private root!: Phaser.GameObjects.Container;
  private basket!: Phaser.GameObjects.Image;
  private basketX = 0;
  private dragging = false;
  private falling: FallingItem[] = [];
  private spawnTimer?: Phaser.Time.TimerEvent;
  private finished = false;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super("CatchCollect");
  }

  init(data: CatchCollectInit): void {
    this.objectId = data.objectId;
    this.levelDef = data.level;
    this.goals = [];
    this.falling = [];
    this.finished = false;
    this.dragging = false;
  }

  create(): void {
    const def = requestsService.def(this.objectId);
    if (!def) {
      this.finishAbort();
      return;
    }
    this.pool = def.miniGamePool;
    const goalIds = new Set(this.levelDef.goals.map((g) => g.itemId));
    this.distractorPool = this.pool.filter((i) => !goalIds.has(i.id));

    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();

    this.root = this.add.container(0, 0);

    const sky = this.add.graphics();
    sky.fillGradientStyle(COLORS.skyMid, COLORS.skyMid, COLORS.skyLow, COLORS.skyLow, 1);
    sky.fillRect(0, 0, W, H);
    this.root.add(sky);

    // HUD panel
    const hudW = Math.min(W - 24, 420);
    const hud = makePanel(this, hudW, 74, { radius: 20 }).setPosition(W / 2, inset.top + 54);
    this.root.add(hud);
    this.root.add(
      this.add
        .text(W / 2, inset.top + 30, `Level ${this.levelDef.level}`, labelStyle(16, "#7a6350"))
        .setOrigin(0.5),
    );

    const goalIcons = this.levelDef.goals
      .map((g) => this.pool.find((i) => i.id === g.itemId))
      .filter((i): i is MiniGameItemDef => !!i);
    const slot = hudW / (goalIcons.length + 1);
    goalIcons.forEach((item, i) => {
      const gx = W / 2 - hudW / 2 + slot * (i + 1);
      const gy = inset.top + 60;
      this.root.add(this.add.image(gx - 22, gy, item.icon).setDisplaySize(34, 34));
      const goal = this.levelDef.goals[i];
      const countText = this.add
        .text(gx + 6, gy, `0/${goal.target}`, titleStyle(20))
        .setOrigin(0, 0.5);
      this.root.add(countText);
      this.goals.push({ itemId: goal.itemId, icon: item.icon, target: goal.target, collected: 0, countText });
    });

    // basket
    this.basketX = W / 2;
    this.basket = this.add
      .image(this.basketX, H - inset.bottom - BASKET_Y_FROM_BOTTOM, "basket")
      .setDisplaySize(140, 105)
      .setDepth(500);
    this.root.add(this.basket);

    // full-play-area drag zone (very forgiving hit area, per spec)
    const dragZone = this.add
      .rectangle(0, 0, W, H, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(1);
    this.root.add(dragZone);
    dragZone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.registry.set("pointerOnUI", true);
      this.moveBasketTo(p.x);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.dragging) this.moveBasketTo(p.x);
    });
    this.input.on("pointerup", () => {
      this.dragging = false;
      this.registry.set("pointerOnUI", false);
    });

    this.cursors = this.input.keyboard?.createCursorKeys();

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 200 });

    this.spawnTimer = this.time.addEvent({
      delay: this.spawnDelay(),
      loop: true,
      callback: () => this.spawnItem(),
    });
    this.spawnItem();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgCatch = {
        forceWin: () => this.goals.forEach((g) => this.addProgress(g.itemId, g.target)),
      };
    }
  }

  private spawnDelay(): number {
    return Phaser.Math.Clamp(820 - this.levelDef.level * 18, 480, 820);
  }

  private fallSpeed(): number {
    return Phaser.Math.Between(120, 150) + this.levelDef.level * 4;
  }

  private moveBasketTo(x: number): void {
    const W = this.scale.width;
    this.basketX = Phaser.Math.Clamp(x, BASKET_HALF_W, W - BASKET_HALF_W);
    this.basket.x = this.basketX;
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;

    if (this.cursors) {
      const speed = 420 * (delta / 1000);
      if (this.cursors.left?.isDown) this.moveBasketTo(this.basketX - speed);
      if (this.cursors.right?.isDown) this.moveBasketTo(this.basketX + speed);
    }

    const H = this.scale.height;
    const basketTop = this.basket.y - 28;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.sprite.y += f.speed * (delta / 1000);

      const withinX = Math.abs(f.sprite.x - this.basket.x) < BASKET_HALF_W + 18;
      if (withinX && f.sprite.y >= basketTop && f.sprite.y <= this.basket.y + 20) {
        this.catchItem(f);
        this.falling.splice(i, 1);
        continue;
      }
      if (f.sprite.y > H + 40) {
        f.sprite.destroy();
        this.falling.splice(i, 1);
      }
    }
  }

  private spawnItem(): void {
    if (this.finished) return;
    const W = this.scale.width;
    const x = Phaser.Math.Between(40, W - 40);

    const roll = Math.random();
    let itemId: string;
    let special = false;
    const incompleteGoals = this.goals.filter((g) => g.collected < g.target);

    if (roll < STAR_CHANCE) {
      itemId = "star_special";
      special = true;
    } else if (incompleteGoals.length > 0 && (roll < 0.65 || this.distractorPool.length === 0)) {
      const g = incompleteGoals[Phaser.Math.Between(0, incompleteGoals.length - 1)];
      itemId = g.itemId;
    } else if (this.distractorPool.length > 0) {
      itemId = this.distractorPool[Phaser.Math.Between(0, this.distractorPool.length - 1)].id;
    } else {
      itemId = this.goals[0]?.itemId ?? "star_special";
    }

    const icon = special ? "star_special" : this.pool.find((i) => i.id === itemId)?.icon ?? itemId;
    const sprite = this.add.image(x, -40, icon).setDisplaySize(44, 44).setDepth(200);
    if (special) {
      this.tweens.add({ targets: sprite, angle: 360, duration: 1400, repeat: -1 });
    }
    this.root.add(sprite);
    this.falling.push({ sprite, itemId, speed: this.fallSpeed(), special });
  }

  private catchItem(f: FallingItem): void {
    if (f.special) {
      const incomplete = this.goals.filter((g) => g.collected < g.target);
      const target = incomplete[Phaser.Math.Between(0, incomplete.length - 1)] ?? this.goals[0];
      Sfx.sparkle();
      sparkleBurst(this, f.sprite.x, f.sprite.y, 14, 40);
      f.sprite.destroy();
      if (target) this.addProgress(target.itemId, 2);
      return;
    }

    const isGoal = this.goals.some((g) => g.itemId === f.itemId && g.collected < g.target);
    if (isGoal) {
      Sfx.pickup();
      sparkleBurst(this, f.sprite.x, f.sprite.y, 6, 24);
      this.addProgress(f.itemId, 1);
    } else {
      this.tweens.add({ targets: f.sprite, alpha: 0, scale: 0.6, duration: 150, onComplete: () => f.sprite.destroy() });
      return;
    }
    f.sprite.destroy();
  }

  private addProgress(itemId: string, amount: number): void {
    const g = this.goals.find((x) => x.itemId === itemId);
    if (!g) return;
    g.collected = Math.min(g.target, g.collected + amount);
    g.countText.setText(`${g.collected}/${g.target}`);
    if (this.goals.every((x) => x.collected >= x.target)) this.finishLevel();
  }

  private finishLevel(): void {
    if (this.finished) return;
    this.finished = true;
    this.spawnTimer?.remove();
    for (const f of this.falling) f.sprite.destroy();
    this.falling = [];

    Sfx.fanfare();
    sparkleBurst(this, this.scale.width / 2, this.scale.height * 0.4, 24, 90);

    const W = this.scale.width;
    const H = this.scale.height;
    const panel = makePanel(this, Math.min(W - 60, 340), 220).setPosition(W / 2, H / 2);
    this.root.add(panel);
    this.root.add(
      this.add.text(W / 2, H / 2 - 60, "LEVEL COMPLETE", titleStyle(26)).setOrigin(0.5),
    );
    this.root.add(
      this.add
        .text(W / 2, H / 2 - 14, `+${this.levelDef.reward} COINS`, { ...titleStyle(30), color: "#d9a43c" })
        .setOrigin(0.5),
    );
    const continueBtn = new Button(this, W / 2, H / 2 + 62, {
      width: 200,
      height: 60,
      label: "Continue",
      fontSize: 22,
      onClick: () => this.complete(),
    });
    this.root.add(continueBtn);
  }

  private complete(): void {
    requestsService.recordMinigameRound(this.objectId, this.levelDef.reward);
    this.scene.resume("Requests");
    this.scene.stop();
  }

  /** Defensive: if init data was invalid, bail out without leaving Requests paused forever. */
  private finishAbort(): void {
    bus.emit("requests:closed", { objectId: this.objectId });
    if (this.scene.isPaused("Requests")) this.scene.resume("Requests");
    else if (this.scene.isPaused("Garden")) this.scene.resume("Garden");
    this.scene.stop();
  }

  shutdown(): void {
    this.spawnTimer?.remove();
    for (const f of this.falling) f.sprite.destroy();
    this.falling = [];
  }
}
