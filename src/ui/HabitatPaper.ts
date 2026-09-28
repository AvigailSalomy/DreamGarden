import Phaser from "phaser";

export type PaperKind = "frame" | "resource" | "count" | "gold" | "cream";

/** Small reusable UI textures, painted in code; no additional downloaded art. */
export function habitatPaper(scene: Phaser.Scene, w: number, h: number, kind: PaperKind): Phaser.GameObjects.Image {
  const key = `habitat-paper-${kind}-${w}-${h}`;
  const pad = 16;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, (w + pad * 2) * 2, (h + pad * 2) * 2)!;
    const ctx = texture.getContext();
    ctx.scale(2, 2);
    ctx.translate(pad, pad);
    const rounded = (x: number, y: number, width: number, height: number, radius: number, colors: string[]) => {
      const gradient = ctx.createLinearGradient(0, y, 0, y + height);
      colors.forEach((color, i) => gradient.addColorStop(i / Math.max(1, colors.length - 1), color));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      ctx.fill();
    };
    ctx.shadowColor = "rgba(73,40,17,.26)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 7;
    rounded(0, 0, w, h, kind === "frame" ? 44 : 26, ["#c4a77f", "#9d754c"]);
    ctx.shadowColor = "transparent";
    if (kind === "frame") {
      rounded(0, 0, w, h, 44, ["#dba46a", "#a46a3c", "#8b512f"]);
      rounded(4, 3, w - 8, h - 11, 40, ["#f1c38a", "#b77a47", "#cb9158"]);
      rounded(9, 7, w - 18, h - 21, 36, ["#bb7e49", "#e4b880", "#8f542f"]);
      // Fine irregular grain follows the vertical stiles and horizontal rails.
      ctx.strokeStyle = "rgba(107,57,29,.24)";
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) {
        const inset = 3 + i * 2;
        ctx.beginPath();
        ctx.moveTo(inset, 53);
        ctx.bezierCurveTo(inset + 3, h * .3, inset - 2, h * .6, inset, h - 54);
        ctx.moveTo(w - inset, 55);
        ctx.bezierCurveTo(w - inset - 3, h * .4, w - inset + 1, h * .7, w - inset, h - 54);
        ctx.moveTo(48, h - inset);
        ctx.bezierCurveTo(w * .3, h - inset - 3, w * .6, h - inset + 1, w - 48, h - inset);
        ctx.stroke();
      }
      rounded(17, 16, w - 34, h - 37, 31, ["#ebca9b", "#f9e6c4", "#d5b58c"]);
      rounded(22, 20, w - 44, h - 46, 28, ["#fffaf0", "#fff1d7", "#f9e9cc"]);
      ctx.strokeStyle = "rgba(255,255,255,.75)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(28, 26, w - 56, h - 58, 24); ctx.stroke();
      // Subtle paper flecks; deterministic positions keep the panel calm.
      ctx.fillStyle = "rgba(151,102,47,.035)";
      for (let i = 0; i < 400; i++) {
        ctx.fillRect(38 + ((i * 71) % (w - 76)), 40 + ((i * 137) % (h - 80)), 1, 1);
      }
    } else if (kind === "resource") {
      rounded(0, 0, w, h, 28, ["#eed4ac", "#f4dfbd", "#dbc09b"]);
      rounded(3, 3, w - 6, h - 9, 25, ["#f8e6c8", "#fff5e3", "#f6e5c8"]);
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(7, 7, w - 14, h - 18, 22); ctx.stroke();
    } else if (kind === "gold") {
      rounded(0, 0, w, h, 29, ["#f1c16b", "#d38b26", "#bc731e"]);
      rounded(3, 2, w - 6, h - 9, 26, ["#ffe98e", "#ffd147", "#f2b631"]);
      rounded(8, 6, w - 16, h * .40, 21, ["#fff3ad", "#ffdd65"]);
    } else {
      rounded(0, 0, w, h, 26, ["#fffaf0", "#f5e0bd", "#d6b48a"]);
      rounded(3, 2, w - 6, h - 8, 23, ["#fffdf5", "#fff1d8"]);
    }
    texture.refresh();
  }
  return scene.add.image(0, 0, key).setDisplaySize(w + pad * 2, h + pad * 2);
}

/** Painted leaf-and-flower corner ornaments; cached once and reused. */
export function habitatFlowers(scene: Phaser.Scene, x: number, y: number, flip = false): Phaser.GameObjects.Image {
  const key = "habitat-flower-trim";
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, 300, 220)!;
    const ctx = texture.getContext();
    ctx.scale(2, 2);
    const leaf = (lx: number, ly: number, angle: number, size: number) => {
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(angle);
      ctx.shadowColor = "rgba(60,68,23,.25)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
      const g = ctx.createLinearGradient(-12, 0, 16, 0);
      g.addColorStop(0, "#547e24"); g.addColorStop(.5, "#93b83e"); g.addColorStop(1, "#bed360");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-size * .6, -size * .25, -size * .38, -size * .9, 0, -size);
      ctx.bezierCurveTo(size * .5, -size * .7, size * .45, -size * .15, 0, 0); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.strokeStyle = "#b9ce64"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-2, -size * .5, 0, -size + 4); ctx.stroke();
      ctx.restore();
    };
    leaf(72, 71, -.8, 58); leaf(79, 70, .3, 62); leaf(85, 74, 1.1, 56);
    leaf(62, 82, -1.6, 43); leaf(96, 80, 1.9, 38);
    const flower = (fx: number, fy: number, radius: number, pink: boolean) => {
      ctx.save(); ctx.translate(fx, fy);
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate(i * Math.PI * 2 / 5);
        ctx.shadowColor = "rgba(94,58,29,.18)"; ctx.shadowBlur = 2; ctx.shadowOffsetY = 2;
        const g = ctx.createLinearGradient(0, -radius * 1.3, 0, 0);
        g.addColorStop(0, pink ? "#fbdce5" : "#fffef4");
        g.addColorStop(1, pink ? "#d980a6" : "#ecd1a9"); ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -radius * .6, radius * .43, radius * .72, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, radius * .4);
      g.addColorStop(0, "#ffe989"); g.addColorStop(.65, "#f6ba34"); g.addColorStop(1, "#d38822");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, radius * .4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    flower(75, 64, 23, false); flower(105, 83, 14, true); flower(43, 87, 10, false);
    texture.refresh();
  }
  return scene.add.image(x, y, key).setDisplaySize(150, 110).setFlipX(flip);
}
