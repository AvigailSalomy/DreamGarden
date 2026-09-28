import type Phaser from "phaser";

/** Shared, grounded frames prevent different source PNG dimensions moving a
 * Bird resource when its state changes. Art retains its original aspect ratio. */
export function bakeBirdResourceFrames(scene: Phaser.Scene): void {
  const sizes: Record<string, [number, number]> = {
    bird_blossom_tree: [1100, 1100],
    bird_seed_feeder: [760, 1100],
    bird_water_lily_patch: [1100, 850],
  };
  for (const [id, [w, h]] of Object.entries(sizes)) {
    for (const state of ["damaged", "restored"]) {
      const source = scene.textures.get(`dg_${id}_${state}`).getSourceImage() as HTMLImageElement;
      const scan = document.createElement("canvas");
      scan.width = source.width; scan.height = source.height;
      const ctx = scan.getContext("2d")!;
      ctx.drawImage(source, 0, 0);
      const pixels = ctx.getImageData(0, 0, scan.width, scan.height).data;
      let left = scan.width, top = scan.height, right = 0, bottom = 0;
      for (let y = 0; y < scan.height; y++) for (let x = 0; x < scan.width; x++) {
        if (pixels[(y * scan.width + x) * 4 + 3] > 8) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      const sw = right - left + 1, sh = bottom - top + 1;
      const scale = Math.min((w - 12) / sw, (h - 12) / sh);
      const frame = scene.textures.createCanvas(`dg_${id}_${state}_grounded`, w, h)!;
      frame.context.drawImage(source, left, top, sw, sh, (w - sw * scale) / 2, h - 6 - sh * scale, sw * scale, sh * scale);
      frame.refresh();
    }
  }
}
