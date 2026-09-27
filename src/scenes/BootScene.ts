import Phaser from "phaser";

/** Sets up scale + waits for the web font, then hands off to Preload. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor("#e7cfe4");

    const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      try {
        await Promise.all([
          fonts.load('700 32px "Baloo 2"'),
          fonts.load('600 24px "Baloo 2"'),
          fonts.load('500 20px "Baloo 2"'),
        ]);
        await fonts.ready;
      } catch {
        /* fall back to the system stack */
      }
    }

    document.getElementById("boot")?.remove();

    // isolated art-direction prototype — never part of the normal boot flow.
    if (/(?:\?|&)slice\b/.test(location.search)) {
      this.scene.start("VisualSlice");
      return;
    }
    this.scene.start("Preload");
  }
}
