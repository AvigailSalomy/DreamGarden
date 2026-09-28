import type Phaser from "phaser";

/**
 * A dark, alpha-masked silhouette baked from a sprite's own texture (drawn
 * once onto a canvas texture, recoloured with 'source-in' compositing) — NOT
 * Phaser's `setTint()`. Tint is unreliable in this project's Canvas-renderer
 * fallback path (verified: it silently no-ops on some production PNGs, e.g.
 * dg_squirrel, and only partially applies on others) — baking guarantees an
 * identical, correct-looking dark shape in both Canvas and WebGL. Cached in
 * the global texture manager by source key, so repeat calls (any scene) are free.
 */
export function silhouetteTextureKey(scene: Phaser.Scene, spriteKey: string): string {
  const key = `dg_silhouette_${spriteKey}`;
  if (scene.textures.exists(key)) return key;
  try {
    const src = scene.textures.get(spriteKey).getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };
    const w = src.width;
    const h = src.height;
    if (!w || !h) return spriteKey;
    const canvas = scene.textures.createCanvas(key, w, h);
    if (!canvas) return spriteKey;
    const ctx = canvas.getContext();
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#3f3550";
    ctx.fillRect(0, 0, w, h);
    canvas.refresh();
    return key;
  } catch {
    return spriteKey; // caller still applies alpha, so this reads as a faint version rather than nothing
  }
}
