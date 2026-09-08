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

// perched birds mostly sit and look; the "hop" slot becomes an occasional takeoff.
const PERCH_WEIGHTS: Record<State, Record<State, number>> = {
  idle: { idle: 5, look: 5, hop: 1, rest: 2 },
  look: { idle: 5, look: 2, hop: 1, rest: 2 },
  hop: { idle: 7, look: 4, hop: 0, rest: 1 },
  rest: { idle: 6, look: 4, hop: 1, rest: 0 },
};

function pickNext(
  cur: State,
  rng: () => number,
  table: Record<State, Record<State, number>>,
): State {
  const w = table[cur];
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
 *   bird_ground -> small quick hops + the occasional low "flit"
 *   bird_perch  -> perched: head/look/preen micro-idle + occasional takeoff, short
 *                  bounded aerial flight, and a landing back on the perch
 *   plant_sway  -> no movement, a permanent gentle sway
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
  private readonly kind: IdleBehaviorId;
  private readonly ground: boolean; // bird that hops on the ground
  private readonly perch: boolean; // bird that stays on a perch
  private readonly plant: boolean;

  constructor(
    private scene: Phaser.Scene,
    private view: GardenObjectView,
    private bounds: MovementBounds,
    type: IdleBehaviorId = "rabbit_hop",
  ) {
    this.homeX = view.x;
    this.homeY = view.y;
    this.kind = type;
    this.ground = type === "bird_ground";
    this.perch = type === "bird_perch";
    this.plant = type === "plant_sway" || type === "tree_breathe";
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.plant) {
      this.startSway();
      return;
    }

    this.breathe();
    this.schedule(400 + this.rng() * 600);
  }

  stop(): void {
    this.running = false;
    this.timer?.remove(false);
    this.tweens.forEach((t) => t.stop());
    this.tweens = [];
  }

  /* ---------------- plant ---------------- */

  private startSway(): void {
    const amp = this.kind === "tree_breathe" ? 2 : 3.4;
    this.tweens.push(
      this.scene.tweens.add({
        targets: this.view.body,
        angle: { from: -amp, to: amp },
        duration: 2200 + this.rng() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
    this.tweens.push(
      this.scene.tweens.add({
        targets: this.view.body,
        scaleY: 1.02,
        scaleX: 0.99,
        duration: 2600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
  }

  /* ---------------- shared machine ---------------- */

  private schedule(delay: number): void {
    this.timer = this.scene.time.delayedCall(delay, () => this.advance());
  }

  private advance(): void {
    if (!this.running) return;
    const table = this.perch ? PERCH_WEIGHTS : WEIGHTS;
    this.state = pickNext(this.state, this.rng, table);
    switch (this.state) {
      case "idle":
        this.schedule(900 + this.rng() * 1400);
        break;
      case "look":
        this.doLook();
        break;
      case "hop":
        if (this.perch) this.doTakeoffFlight();
        else this.doHops(1 + Math.floor(this.rng() * 3));
        break;
      case "rest":
        if (this.perch) this.doPreen();
        else this.doRest();
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
      angle: dir * (this.perch ? 8 : 6),
      duration: 240,
      yoyo: true,
      hold: 400 + this.rng() * 700,
      ease: "Sine.easeInOut",
      onComplete: () => this.schedule(280 + this.rng() * 500),
    });
    this.tweens.push(t);
  }

  /** Perched bird: a quick wing/tail flick + head bob (a "chirp"). */
  private doPreen(): void {
    this.breatheTween?.pause();
    const t = this.scene.tweens.add({
      targets: this.view.body,
      scaleX: 1.08,
      scaleY: 0.94,
      duration: 110,
      yoyo: true,
      repeat: 1,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.view.body.setScale(1);
        this.breatheTween?.resume();
        this.schedule(500 + this.rng() * 900);
      },
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
    const w = this.bounds.w ?? 240;
    const h = this.bounds.h ?? 160;
    return {
      x: this.bounds.x + (this.rng() - 0.5) * w,
      y: this.bounds.y + (this.rng() - 0.5) * h,
    };
  }

  /* ---------------- perched bird: takeoff + return ---------------- */

  private doTakeoffFlight(): void {
    this.breatheTween?.pause();
    const home = { x: this.homeX, y: this.homeY };
    const t0 = this.randomTargetInBounds();
    const away = { x: t0.x, y: Math.min(t0.y, home.y - 30) }; // stays above the rail
    this.view.faceLeft(away.x < home.x);

    const legOut = 640 + this.rng() * 220;
    const legBack = 640 + this.rng() * 220;
    const arc = 60 + this.rng() * 50;

    const fly = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      dur: number,
      then: () => void,
    ) => {
      const proxy = { t: 0 };
      const ctrlY = Math.min(from.y, to.y) - arc;
      const t = this.scene.tweens.add({
        targets: proxy,
        t: 1,
        duration: dur,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          const u = proxy.t;
          const x = Phaser.Math.Linear(from.x, to.x, u);
          const groundY = Phaser.Math.Linear(from.y, to.y, u);
          const arcY = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * ctrlY + u * u * to.y;
          this.view.setGroundPosition(x, groundY);
          this.view.setHopHeight(Math.max(0, groundY - arcY));
          this.view.body.setScale(
            1 + Math.sin(u * Math.PI * 6) * 0.03,
            1 - Math.sin(u * Math.PI * 6) * 0.03,
          );
          this.view.setDepthFromY();
        },
        onComplete: () => {
          this.view.body.setScale(1);
          then();
        },
      });
      this.tweens.push(t);
    };

    fly(home, away, legOut, () => {
      this.scene.time.delayedCall(140 + this.rng() * 260, () => {
        if (!this.running) return;
        this.view.faceLeft(home.x < away.x);
        fly(away, home, legBack, () => this.landOnPerch());
      });
    });
  }

  private landOnPerch(): void {
    this.view.setGroundPosition(this.homeX, this.homeY);
    this.view.setHopHeight(0);
    const t = this.scene.tweens.add({
      targets: this.view.body,
      scaleY: 0.82,
      scaleX: 1.16,
      duration: 90,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.view.body.setScale(1);
        this.breatheTween?.resume();
        this.schedule(700 + this.rng() * 1200);
      },
    });
    this.tweens.push(t);
  }

  /* ---------------- rabbit / ground bird hops ---------------- */

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
      const flit = this.ground && this.rng() < 0.35;
      const maxHop = this.ground ? (flit ? 240 : 78) : 130;
      const target = this.randomTargetInBounds();
      const fromX = this.view.x;
      const fromY = this.view.y;
      let tx = Phaser.Math.Clamp(target.x, fromX - maxHop, fromX + maxHop);
      let ty = Phaser.Math.Clamp(target.y, fromY - maxHop * 0.5, fromY + maxHop * 0.5);
      tx = Phaser.Math.Clamp(tx, this.homeX - (this.bounds.w ?? 240) / 2, this.homeX + (this.bounds.w ?? 240) / 2);
      ty = Phaser.Math.Clamp(ty, this.homeY - (this.bounds.h ?? 160) / 2, this.homeY + (this.bounds.h ?? 160) / 2);
      this.view.faceLeft(tx < fromX);

      const hopHeight = this.ground ? (flit ? 90 + this.rng() * 40 : 14 + this.rng() * 12) : 46 + this.rng() * 26;
      const dur = this.ground ? (flit ? 460 : 240) : 380;
      const proxy = { t: 0 };

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
