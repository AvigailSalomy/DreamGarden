import Phaser from "phaser";
import type { GardenObjectView } from "../world/GardenObjectView";
import type { IdleBehaviorId, MovementBounds } from "../data/types";

type State = "idle" | "look" | "hop" | "rest";

const WEIGHTS: Record<State, Record<State, number>> = {
  idle: { idle: 3, look: 3, hop: 3, rest: 1 },
  look: { idle: 4, look: 1, hop: 3, rest: 1 },
  hop: { idle: 5, look: 3, hop: 1, rest: 1 },
  rest: { idle: 5, look: 2, hop: 2, rest: 0 },
};

function pickNext(cur: State, rng: () => number): State {
  const w = WEIGHTS[cur];
  const total = (Object.values(w) as number[]).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const k of Object.keys(w) as State[]) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return "idle";
}

/**
 * Believable idle loop: a tiny weighted state machine with random timers and bounded
 * movement. No pathfinding — just the illusion of life. Behaviour type tunes the feel:
 *   rabbit_hop  -> springy arced hops
 *   bird_ground -> small quick hops + the occasional low "flit" flight
 */
export class IdleBehavior {
  private state: State = "idle";
  private timer?: Phaser.Time.TimerEvent;
  private tweens: Phaser.Tweens.Tween[] = [];
  private rng = Math.random;
  private running = false;
  private homeX: number;
  private homeY: number;
  private breatheTween?: Phaser.Tweens.Tween;
  private readonly bird: boolean;

  constructor(
    private scene: Phaser.Scene,
    private view: GardenObjectView,
    private bounds: MovementBounds,
    type: IdleBehaviorId = "rabbit_hop",
  ) {
    this.homeX = view.x;
    this.homeY = view.y;
    this.bird = type === "bird_ground";
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.breathe();
    this.schedule(400 + this.rng() * 600);
  }

  stop(): void {
    this.running = false;
    this.timer?.remove(false);
    this.tweens.forEach((t) => t.stop());
    this.tweens = [];
  }

  private schedule(delay: number): void {
    this.timer = this.scene.time.delayedCall(delay, () => this.advance());
  }

  private advance(): void {
    if (!this.running) return;
    this.state = pickNext(this.state, this.rng);
    switch (this.state) {
      case "idle":
        this.schedule(900 + this.rng() * 1400);
        break;
      case "look":
        this.doLook();
        break;
      case "hop":
        this.doHops(1 + Math.floor(this.rng() * 3));
        break;
      case "rest":
        this.doRest();
        break;
    }
  }

  private breathe(): void {
    this.breatheTween = this.scene.tweens.add({
      targets: this.view.body,
      scaleY: 1.04,
      scaleX: 0.98,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.push(this.breatheTween);
  }

  private doLook(): void {
    const dir = this.rng() < 0.5 ? -1 : 1;
    this.view.faceLeft(dir < 0);
    const t = this.scene.tweens.add({
      targets: this.view.body,
      angle: dir * 6,
      duration: 260,
      yoyo: true,
      hold: 500 + this.rng() * 700,
      ease: "Sine.easeInOut",
      onComplete: () => this.schedule(300 + this.rng() * 500),
    });
    this.tweens.push(t);
  }

  private doRest(): void {
    this.breatheTween?.pause();
    const t = this.scene.tweens.add({
      targets: this.view.body,
      scaleY: 0.92,
      scaleX: 1.05,
      duration: 400,
      yoyo: true,
      hold: 1400 + this.rng() * 1800,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.breatheTween?.resume();
        this.schedule(300);
      },
    });
    this.tweens.push(t);
  }

  private randomTargetInBounds(): { x: number; y: number } {
    if (this.bounds.shape === "circle") {
      const r = (this.bounds.r ?? 120) * Math.sqrt(this.rng());
      const a = this.rng() * Math.PI * 2;
      return { x: this.bounds.x + Math.cos(a) * r, y: this.bounds.y + Math.sin(a) * r };
    }
    const w = this.bounds.w ?? 240;
    const h = this.bounds.h ?? 160;
    return {
      x: this.bounds.x + (this.rng() - 0.5) * w,
      y: this.bounds.y + (this.rng() - 0.5) * h,
    };
  }

  private doHops(times: number): void {
    this.breatheTween?.pause();
    const finish = () => {
      this.view.body.setScale(1);
      this.breatheTween?.resume();
      this.schedule(500 + this.rng() * 900);
    };
    const step = () => {
      if (!this.running || times <= 0) {
        finish();
        return;
      }
      times--;
      const flit = this.bird && this.rng() < 0.35;
      const maxHop = this.bird ? (flit ? 240 : 78) : 130;
      const target = this.randomTargetInBounds();
      const fromX = this.view.x;
      const fromY = this.view.y;
      let tx = Phaser.Math.Clamp(target.x, fromX - maxHop, fromX + maxHop);
      let ty = Phaser.Math.Clamp(target.y, fromY - maxHop * 0.5, fromY + maxHop * 0.5);
      // keep near home
      tx = Phaser.Math.Clamp(tx, this.homeX - (this.bounds.w ?? 240) / 2, this.homeX + (this.bounds.w ?? 240) / 2);
      ty = Phaser.Math.Clamp(ty, this.homeY - (this.bounds.h ?? 160) / 2, this.homeY + (this.bounds.h ?? 160) / 2);
      this.view.faceLeft(tx < fromX);

      const hopHeight = this.bird ? (flit ? 90 + this.rng() * 40 : 14 + this.rng() * 12) : 46 + this.rng() * 26;
      const dur = this.bird ? (flit ? 460 : 240) : 380;
      const proxy = { t: 0 };

      // anticipation squash
      this.scene.tweens.add({
        targets: this.view.body,
        scaleY: 0.82,
        scaleX: 1.14,
        duration: 110,
        yoyo: true,
        ease: "Quad.easeOut",
      });

      const t = this.scene.tweens.add({
        targets: proxy,
        t: 1,
        delay: 90,
        duration: dur,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          const x = Phaser.Math.Linear(fromX, tx, proxy.t);
          const y = Phaser.Math.Linear(fromY, ty, proxy.t);
          this.view.setGroundPosition(x, y);
          this.view.setHopHeight(Math.sin(Math.PI * proxy.t) * hopHeight);
          this.view.setDepthFromY();
        },
        onComplete: () => {
          this.view.setHopHeight(0);
          // landing squash
          this.scene.tweens.add({
            targets: this.view.body,
            scaleY: 0.86,
            scaleX: 1.12,
            duration: 90,
            yoyo: true,
            ease: "Quad.easeOut",
            onComplete: step,
          });
        },
      });
      this.tweens.push(t);
    };
    step();
  }
}
