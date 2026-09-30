import Phaser from "phaser";
import { attachHit } from "../ui/hit";
import { makePanel, makePill } from "../ui/Panel";
import { titleStyle, bodyStyle, COLORS } from "../ui/theme";
import { FROSTED_SHOP_CATALOG, FROSTED_SHOP_CATEGORIES } from "../data/frostedShop";
import type { FrostedAnimalDef, FrostedShopCategory, FrostedShopItemDef } from "../data/types";
import { frostedShop, frostedProgression, economy } from "../game/services";
import { SHOP_TUTORIAL, shouldShowNote } from "../data/frostedStory";
import { showNote } from "../story/StoryNotes";
import type { FrostedValleyScene } from "./FrostedValleyScene";
import { Sfx } from "../fx/Sfx";
import { sparkleBurst } from "../fx/Particles";
import { wornAccessoryPose } from "../world/petAccessoryFit";

const CARD_W = 158;
const CARD_H = 196;
const GRID_COLS = 4;
const NAV_W = 150;
const PREVIEW_W = 260;

/**
 * "Winter Market" — the Frosted Valley Shop. Three columns: category nav on
 * the left, a 4-per-row item grid in the center, and a live animal preview
 * on the right. Buildings/Plants/Decorations keep the existing world-
 * placement flow untouched (Buy on the card → Sims-style placement in the
 * live world). Pet Accessories are different: clicking a card is a FREE
 * try-on that shows it live on the preview animal immediately; only the
 * preview panel's own BUY button spends coins (via
 * FrostedShopService.buyPetAccessory, which owns+equips atomically).
 *
 * One coin balance throughout — `economy.coins` — no second currency.
 */
export class FrostedShopScene extends Phaser.Scene {
  private activeTab: FrostedShopCategory = "pet";
  private gridContent?: Phaser.GameObjects.Container;
  private gridMaskGfx?: Phaser.GameObjects.Graphics;
  private gridScrollY = 0;
  private gridViewportH = 0;
  private gridContentH = 0;
  private coinText?: Phaser.GameObjects.Text;
  private tabButtons: Array<{ cat: FrostedShopCategory; bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }> = [];
  private cardHighlights = new Map<string, Phaser.GameObjects.Graphics>();

  private previewAnimalId = "";
  private previewRoot?: Phaser.GameObjects.Container;
  private previewSprite?: Phaser.GameObjects.Image;
  private previewAccessory?: Phaser.GameObjects.Image;
  private previewAccessoryShadow?: Phaser.GameObjects.Ellipse;
  private previewAccessoryItem?: FrostedShopItemDef;
  /** The entrance pop multiplies the fitted scale; kept separate so the per-frame fit never fights the tween. */
  private previewPop = { k: 1 };
  /** The preview animal's fixed display height — every animal is fitted to it, never to a mid-breath height. */
  private previewAnimalH = 0;
  /** The preview sprite's un-animated scale (its breathing tween oscillates scaleY above this). */
  private previewBaseScale = 1;
  private selectedPetItem: string | null = null;
  private previewNameText?: Phaser.GameObjects.Text;
  private previewPriceText?: Phaser.GameObjects.Text;
  private previewBuyLabel?: Phaser.GameObjects.Text;
  private previewBuyBg?: Phaser.GameObjects.Graphics;
  private previewBuyHit?: Phaser.GameObjects.Rectangle;
  private previewBlurb?: Phaser.GameObjects.Text;
  private animalChips = new Map<string, Phaser.GameObjects.Arc>();

  constructor() {
    super("FrostedShop");
  }

  create(data?: { tab?: FrostedShopCategory; previewAnimal?: string }): void {
    this.registry.set("pointerOnUI", true);
    // the story's guided first visit can pick the tab and which friend is dressed up
    this.activeTab = data?.tab ?? "pet";
    this.cardHighlights.clear();
    this.tabButtons = [];
    // only genuinely unlocked animals can be previewed; a guided visit picks
    // the friend to dress, otherwise default to the newest one
    const unlockedNow = frostedProgression.unlockedAnimals();
    this.previewAnimalId = data?.previewAnimal ?? unlockedNow[unlockedNow.length - 1]?.id ?? "";

    const w = this.scale.width;
    const h = this.scale.height;
    const scrim = this.add.rectangle(0, 0, w, h, 0x0d1f2e, 0.62).setOrigin(0, 0).setInteractive();
    attachHit(this, scrim as unknown as Parameters<typeof attachHit>[1], w, h, {});

    const panelW = Math.min(NAV_W + GRID_COLS * CARD_W + (GRID_COLS + 1) * 14 + PREVIEW_W + 60, w - 40);
    const panelH = Math.min(3 * CARD_H + 4 * 14 + 150, h - 40);
    const cx = w / 2;
    const cy = h / 2;

    // a simple fade-in only (no scale tween) — the grid's scroll mask below
    // is computed in absolute screen coordinates, which only stays correct
    // if this root never rescales after creation
    const root = this.add.container(cx, cy).setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 220 });

    const panel = makePanel(this, panelW, panelH, { radius: 30, fill: COLORS.panel });
    root.add(panel);

    const halfW = panelW / 2;
    const halfH = panelH / 2;

    // ---- top bar ----
    const closeBtn = this.add.text(halfW - 34, -halfH + 34, "✕", { ...titleStyle(24), color: "#5b4636" }).setOrigin(0.5);
    attachHit(this, closeBtn as unknown as Parameters<typeof attachHit>[1], 44, 44, { onTap: () => this.close() });
    root.add(closeBtn);

    const title = this.add.text(-halfW + 30, -halfH + 34, "❄️ Winter Market", { ...titleStyle(24), color: "#5b4636" }).setOrigin(0, 0.5);
    root.add(title);

    const coinPill = makePill(this, 130, 44);
    coinPill.setPosition(halfW - 150, -halfH + 34);
    this.coinText = this.add.text(halfW - 150, -halfH + 34, `🪙 ${economy.coins}`, titleStyle(17)).setOrigin(0.5);
    root.add([coinPill, this.coinText]);

    // ---- left nav ----
    const navX = -halfW + 20;
    const navTop = -halfH + 74;
    FROSTED_SHOP_CATEGORIES.forEach((cat, i) => {
      const ny = navTop + i * 54;
      const bg = this.add.graphics();
      const label = this.add.text(navX + 16, ny + 22, `${cat.icon}  ${cat.label}`, { ...titleStyle(13), color: "#5b4636" }).setOrigin(0, 0.5);
      root.add([bg, label]);
      this.tabButtons.push({ cat: cat.id, bg, label });
      const hitZone = this.add.rectangle(navX + NAV_W / 2 - 8, ny + 22, NAV_W - 8, 44, 0xffffff, 0.001);
      attachHit(this, hitZone as unknown as Parameters<typeof attachHit>[1], NAV_W - 8, 44, {
        onTap: () => this.selectCategory(cat.id),
      });
      root.add(hitZone);
      this.drawNavBg(bg, navX, ny, cat.id === this.activeTab);
    });

    // ---- right live preview ----
    const previewX = halfW - PREVIEW_W - 4;
    const previewTop = -halfH + 74;
    const previewPanel = makePanel(this, PREVIEW_W, panelH - 100, { radius: 22, fill: 0xeef5fa, edge: 0xcfe3ee, shadow: false });
    previewPanel.setPosition(previewX + PREVIEW_W / 2, previewTop + (panelH - 100) / 2);
    root.add(previewPanel);
    this.buildPreview(root, previewX + PREVIEW_W / 2, previewTop + 26, panelH - 100);

    // ---- center grid, masked + scrollable ----
    const gridX = navX + NAV_W + 14;
    const gridTop = navTop;
    const gridW = previewX - 14 - gridX;
    const gridH = panelH - 100;
    this.gridViewportH = gridH;

    this.gridContent = this.add.container(0, 0);
    root.add(this.gridContent);

    // the mask + viewport rectangle are computed in ABSOLUTE screen space —
    // valid because `root` never rescales (see the fade-in note above)
    this.gridMaskGfx = this.make.graphics({}, false);
    this.gridMaskGfx.fillStyle(0xffffff, 1);
    this.gridMaskGfx.fillRect(cx + gridX, cy + gridTop, gridW, gridH);
    this.gridContent.setMask(new Phaser.Display.Masks.GeometryMask(this, this.gridMaskGfx));

    const scrollHit = this.add.rectangle(cx + gridX + gridW / 2, cy + gridTop + gridH / 2, gridW, gridH, 0xffffff, 0.001);
    const scrollBounds = scrollHit.getBounds();
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (!scrollBounds.contains(pointer.x, pointer.y)) return;
      this.scrollGridBy(dy * 0.5);
    });

    this.rebuildGrid(gridX, gridTop, gridW);
    this.paintNav();
    this.refreshPreviewForTab();

    // the first time the Market opens: a short "how it works" note (one-time, persisted like every other story note)
    if (shouldShowNote(SHOP_TUTORIAL, (id) => frostedProgression.isStoryNoteSeen(id))) {
      this.time.delayedCall(600, () => {
        void showNote(this.game, { note: SHOP_TUTORIAL, blocking: true, anchor: "center" });
      });
    }
  }

  /* ---------------- nav ---------------- */

  private drawNavBg(bg: Phaser.GameObjects.Graphics, x: number, y: number, active: boolean): void {
    bg.clear();
    bg.fillStyle(active ? 0xe8d7a5 : 0xf4efe6, 1);
    bg.fillRoundedRect(x, y, NAV_W - 8, 44, 12);
    if (active) {
      bg.lineStyle(2, 0xb9894a, 1);
      bg.strokeRoundedRect(x, y, NAV_W - 8, 44, 12);
    }
  }

  private paintNav(): void {
    this.tabButtons.forEach((b) => {
      b.label.setColor(b.cat === this.activeTab ? "#2d2417" : "#5b4636");
      // the background rect's top-left is the label's own anchor minus its fixed inset (see create())
      this.drawNavBg(b.bg, b.label.x - 16, b.label.y - 22, b.cat === this.activeTab);
    });
  }

  private selectCategory(cat: FrostedShopCategory): void {
    if (this.activeTab === cat) return;
    this.activeTab = cat;
    this.selectedPetItem = null;
    this.paintNav();
    this.rebuildGridKeepingLayout();
    this.refreshPreviewForTab();
  }

  private lastGridX = 0;
  private lastGridTop = 0;
  private lastGridW = 0;

  private rebuildGridKeepingLayout(): void {
    this.rebuildGrid(this.lastGridX, this.lastGridTop, this.lastGridW);
  }

  /* ---------------- grid ---------------- */

  private rebuildGrid(gridX: number, gridTop: number, gridW: number): void {
    this.lastGridX = gridX;
    this.lastGridTop = gridTop;
    this.lastGridW = gridW;
    this.gridContent?.removeAll(true);
    this.cardHighlights.clear();
    this.gridScrollY = 0;

    const items = FROSTED_SHOP_CATALOG.filter((i) => i.category === this.activeTab);
    const gap = 14;
    const usableW = gridW - (GRID_COLS - 1) * gap;
    const colW = usableW / GRID_COLS;

    items.forEach((item, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = gridX + col * (colW + gap) + colW / 2;
      const y = gridTop + row * (CARD_H + gap) + CARD_H / 2;
      this.gridContent?.add(this.buildCard(item, x, y, colW));
    });

    const rows = Math.ceil(items.length / GRID_COLS);
    this.gridContentH = rows * CARD_H + Math.max(0, rows - 1) * gap;
    this.applyGridScroll();
  }

  private scrollGridBy(dy: number): void {
    const maxScroll = Math.max(0, this.gridContentH - this.gridViewportH);
    if (maxScroll <= 0) return;
    this.gridScrollY = Phaser.Math.Clamp(this.gridScrollY + dy, 0, maxScroll);
    this.applyGridScroll();
  }

  private applyGridScroll(): void {
    this.gridContent?.setPosition(0, -this.gridScrollY);
  }

  private buildCard(item: FrostedShopItemDef, cx: number, cy: number, colW: number): Phaser.GameObjects.Container {
    const card = this.add.container(cx, cy);

    const isPet = item.category === "pet";
    const owned = isPet ? frostedShop.isPetOwned(item.id) : frostedShop.ownedCount(item.id) > 0;
    // A world item can be bought again and again, so owning one copy says nothing
    // about being able to pay for the next: only pet accessories (bought once,
    // re-equipped free) are available regardless of the wallet once owned.
    const affordable = isPet ? owned || economy.canAfford(item.price) : economy.canAfford(item.price);

    const bg = makePanel(this, Math.min(colW, CARD_W), CARD_H, { radius: 16, fill: 0xfffaf0, edge: COLORS.panelEdge, shadow: false });
    card.add(bg);

    const highlight = this.add.graphics();
    card.add(highlight);
    this.cardHighlights.set(item.id, highlight);

    const iconFrame = this.add.rectangle(0, -58, Math.min(colW, CARD_W) - 22, 92, 0xffffff, 0.55).setStrokeStyle(2, 0xf0e3c8);
    const icon = this.add.image(0, -58, item.textureKey).setOrigin(0.5);
    const iconScale = Math.min((Math.min(colW, CARD_W) - 32) / (icon.width || 1), 80 / (icon.height || 1));
    icon.setScale(iconScale);
    card.add([iconFrame, icon]);

    const label = this.add
      .text(0, -2, item.label, { ...titleStyle(12), color: "#5b4636", align: "center", wordWrap: { width: Math.min(colW, CARD_W) - 16 } })
      .setOrigin(0.5, 0);
    card.add(label);

    if (isPet) {
      const priceText = this.add
        .text(0, 44, owned ? "Owned ✓" : `🪙 ${item.price}`, { ...titleStyle(13), color: owned ? "#3f8a4c" : "#8a5a00" })
        .setOrigin(0.5);
      card.add(priceText);
      const hint = this.add.text(0, 68, "Tap to try on", bodyStyle(10)).setOrigin(0.5);
      card.add(hint);

      const hit = this.add.rectangle(0, 0, Math.min(colW, CARD_W), CARD_H, 0xffffff, 0.001);
      attachHit(this, hit as unknown as Parameters<typeof attachHit>[1], Math.min(colW, CARD_W), CARD_H, { onTap: () => this.tryOnPetItem(item.id) });
      card.add(hit);
    } else {
      const priceText = this.add
        .text(0, 34, `🪙 ${item.price}`, { ...titleStyle(13), color: affordable ? "#8a5a00" : "#9a9086" })
        .setOrigin(0.5);
      card.add(priceText);
      if (owned) card.add(this.add.text(0, 8, `In valley: ×${frostedShop.ownedCount(item.id)}`, bodyStyle(10)).setOrigin(0.5, 0));

      const btnBg = this.add.graphics();
      const btnY = 62;
      const btnW = Math.min(colW, CARD_W) - 24;
      const btnH = 26;
      btnBg.fillStyle(affordable ? COLORS.gold : 0xd8d2c4, 1);
      btnBg.fillRoundedRect(-btnW / 2, btnY - btnH / 2, btnW, btnH, 9);
      card.add(btnBg);
      const btnLabel = this.add
        .text(0, btnY, affordable ? "Drag to place" : "Need coins", { ...titleStyle(affordable ? 12 : 10), color: affordable ? "#5b3a00" : "#7a7264" })
        .setOrigin(0.5);
      card.add(btnLabel);

      // the WHOLE card is the grab handle — pressing down on it immediately
      // picks the item up (closes the Shop and hands the still-held pointer
      // to the world as a drag-ghost); this is a raw pointerdown, not
      // attachHit's tap pairing, because we act before any pointerup.
      if (affordable) {
        const hit = this.add.rectangle(0, 0, Math.min(colW, CARD_W), CARD_H, 0xffffff, 0.001).setOrigin(0.5);
        hit.setInteractive({ cursor: "grab" });
        hit.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
          this.startWorldItemDrag(item, pointer);
        });
        card.add(hit);
      }
    }

    if (this.selectedPetItem === item.id) this.paintCardHighlight(item.id, true);
    return card;
  }

  private paintCardHighlight(itemId: string, active: boolean): void {
    const g = this.cardHighlights.get(itemId);
    if (!g) return;
    g.clear();
    if (!active) return;
    g.lineStyle(3, 0x7fc2e0, 1);
    g.strokeRoundedRect(-CARD_W / 2 - 2, -CARD_H / 2 - 2, CARD_W + 4, CARD_H + 4, 18);
  }

  /* ---------------- pet try-on ---------------- */

  private tryOnPetItem(itemId: string): void {
    if (!this.previewAnimalId) return; // nobody unlocked yet: nothing to dress
    const prev = this.selectedPetItem;
    if (prev) this.paintCardHighlight(prev, false);
    this.selectedPetItem = itemId;
    this.paintCardHighlight(itemId, true);
    this.applyAccessoryToPreview(itemId);
    this.updatePreviewInfoPanel();
    Sfx.tap();
  }

  private onBuyPetItem(): void {
    if (!this.selectedPetItem || !this.previewAnimalId) return;
    const item = frostedShop.def(this.selectedPetItem);
    if (!item) return;
    const owned = frostedShop.isPetOwned(item.id);
    if (!owned && !economy.canAfford(item.price)) {
      this.flashNotEnoughCoins();
      return;
    }
    const ok = frostedShop.buyPetAccessory(this.previewAnimalId, item.id);
    if (!ok) {
      this.flashNotEnoughCoins();
      return;
    }
    Sfx.complete();
    if (this.previewAccessory) sparkleBurst(this, this.previewAccessory.x + (this.previewRoot?.x ?? 0), this.previewAccessory.y + (this.previewRoot?.y ?? 0), 16, 40);
    if (this.coinText) this.coinText.setText(`🪙 ${economy.coins}`);
    this.rebuildGridKeepingLayout();
    this.updatePreviewInfoPanel();
  }

  private flashNotEnoughCoins(): void {
    if (!this.previewBuyLabel) return;
    const original = this.previewBuyLabel.text;
    this.previewBuyLabel.setText("Not enough coins").setColor("#a33f3f");
    this.time.delayedCall(1100, () => {
      this.previewBuyLabel?.setText(original).setColor("#5b3a00");
    });
  }

  /**
   * Real drag-and-drop: the Shop closes the instant the card is pressed,
   * handing the SAME still-held pointer to FrostedValleyScene so the ghost
   * picks up right under the finger/cursor and the player just drags it to
   * a spot and lets go — no separate confirm/checkmark step.
   */
  private startWorldItemDrag(item: FrostedShopItemDef, pointer: Phaser.Input.Pointer): void {
    // never enter placement for something the wallet can't cover
    if (!frostedShop.canAfford(item.id)) return;
    const sx = pointer.x;
    const sy = pointer.y;
    this.registry.set("pointerOnUI", false);
    this.scene.stop();
    this.scene.resume("FrostedValley");
    const fv = this.scene.get("FrostedValley") as FrostedValleyScene;
    fv.beginShopDragPlacement(item.id, sx, sy);
  }

  /* ---------------- live preview ---------------- */

  private buildPreview(root: Phaser.GameObjects.Container, cx: number, topY: number, panelH: number): void {
    const label = this.add.text(cx, topY, "TRY IT OUT ✨", { ...titleStyle(16), color: "#2f6b52" }).setOrigin(0.5);
    root.add(label);

    // only unlocked (already-met) animals are offered — never a future
    // locked one — and the picker itself only appears once there's an
    // actual choice to make, so a fresh save with just the rabbit stays
    // exactly as compact as before.
    const unlocked = frostedProgression.unlockedAnimals();
    if (unlocked.length === 0) {
      root.add(
        this.add
          .text(cx, topY + 120, "Rescue a friend to\ntry accessories on!", { ...bodyStyle(15), align: "center" })
          .setOrigin(0.5, 0),
      );
      this.previewBuyBg = this.add.graphics();
      this.previewBuyHit = undefined;
      return;
    }
    const selectorH = unlocked.length > 1 ? 44 : 0;
    if (selectorH > 0) this.buildAnimalSelector(root, cx, topY + 30, unlocked);

    const animalTop = topY + 30 + selectorH;
    const animalH = Math.min(panelH * 0.46, 210);
    this.previewRoot = this.add.container(cx, animalTop + animalH);
    root.add(this.previewRoot);

    this.previewSprite = this.add.image(0, 0, this.previewAnimalId).setOrigin(0.5, 1);
    this.previewAnimalH = animalH;
    const scale = animalH / (this.previewSprite.height || animalH);
    this.previewBaseScale = scale;
    this.previewSprite.setScale(scale);
    this.previewRoot.add(this.previewSprite);
    this.startPreviewIdle();

    this.previewBlurb = this.add
      .text(cx, animalTop + animalH + 24, "Make your cuddly friend uniquely yours!", {
        ...bodyStyle(13),
        align: "center",
        wordWrap: { width: PREVIEW_W - 40 },
      })
      .setOrigin(0.5, 0);
    root.add(this.previewBlurb);

    this.previewNameText = this.add.text(cx, animalTop + animalH + 60, "", titleStyle(16)).setOrigin(0.5, 0);
    this.previewPriceText = this.add.text(cx, animalTop + animalH + 84, "", { ...titleStyle(14), color: "#8a5a00" }).setOrigin(0.5, 0);
    root.add([this.previewNameText, this.previewPriceText]);

    this.previewBuyBg = this.add.graphics();
    // clear of the price line above it ("Owned — tap to equip" was tucked under the button)
    const buyY = animalTop + animalH + 140;
    const buyW = PREVIEW_W - 60;
    const buyH = 44;
    this.previewBuyBg.fillStyle(COLORS.gold, 1);
    this.previewBuyBg.fillRoundedRect(cx - buyW / 2, buyY - buyH / 2, buyW, buyH, 14);
    root.add(this.previewBuyBg);
    this.previewBuyLabel = this.add.text(cx, buyY, "BUY", { ...titleStyle(16), color: "#5b3a00" }).setOrigin(0.5);
    root.add(this.previewBuyLabel);
    this.previewBuyHit = this.add.rectangle(cx, buyY, buyW, buyH, 0xffffff, 0.001);
    attachHit(this, this.previewBuyHit as unknown as Parameters<typeof attachHit>[1], buyW, buyH, { onTap: () => this.onBuyPetItem() });
    root.add(this.previewBuyHit);

    this.setPreviewBuyVisible(false);
  }

  /**
   * "Choose which animal you want to dress" — a compact row of small round
   * portraits, one per unlocked animal. Purely a preview-panel control: it
   * never touches ownership, coins, or progression, and its selection is
   * never persisted (matches the existing "try it out" preview, which was
   * already free and temporary — this just lets it target any met animal
   * instead of always the current one).
   */
  private buildAnimalSelector(root: Phaser.GameObjects.Container, cx: number, y: number, unlocked: FrostedAnimalDef[]): void {
    this.animalChips.clear();
    const r = 17;
    const gap = 8;
    const totalW = unlocked.length * (r * 2) + (unlocked.length - 1) * gap;
    let x = cx - totalW / 2 + r;
    for (const a of unlocked) {
      const ring = this.add.circle(x, y, r + 3, 0x000000, 0).setStrokeStyle(3, 0x7fc2e0, a.id === this.previewAnimalId ? 1 : 0);
      const bg = this.add.circle(x, y, r, 0xffffff, 1).setStrokeStyle(2, 0xe4d3ab, 1);
      const thumb = this.add.image(x, y, a.id).setOrigin(0.5);
      const fit = Math.min((r * 1.7) / (thumb.width || 1), (r * 1.7) / (thumb.height || 1));
      thumb.setScale(fit);
      const hit = this.add.circle(x, y, r + 4, 0xffffff, 0.001);
      attachHit(this, hit as unknown as Parameters<typeof attachHit>[1], (r + 4) * 2, (r + 4) * 2, {
        onTap: () => this.switchPreviewAnimal(a.id),
      });
      root.add([ring, bg, thumb, hit]);
      this.animalChips.set(a.id, ring);
      x += r * 2 + gap;
    }
  }

  private paintAnimalSelector(): void {
    this.animalChips.forEach((ring, id) => ring.setStrokeStyle(3, 0x7fc2e0, id === this.previewAnimalId ? 1 : 0));
  }

  /**
   * Switches which unlocked animal the preview shows, WITHOUT touching the
   * currently try-on'd accessory — it simply re-fits to the new animal, so
   * "pick fox, then pick goggles, then switch to rabbit" keeps the goggles
   * on and correctly refitted, per the requested flow.
   */
  private switchPreviewAnimal(animalId: string): void {
    if (animalId === this.previewAnimalId || !this.previewSprite || !this.previewRoot) return;
    // defence in depth: a locked animal can never be previewed, whatever calls this
    if (!frostedProgression.isRescued(animalId)) return;
    Sfx.tap();
    this.previewAnimalId = animalId;
    this.previewSprite.destroy();
    this.previewSprite = this.add.image(0, 0, animalId).setOrigin(0.5, 1);
    // fitted to the fixed preview height — NOT the old sprite's displayHeight,
    // which includes wherever its breathing was mid-tween (up to +4.5%), so
    // repeated switching used to ratchet the animals' size up
    const scale = this.previewAnimalH / (this.previewSprite.height || this.previewAnimalH);
    this.previewBaseScale = scale;
    this.previewSprite.setScale(scale);
    this.previewRoot.addAt(this.previewSprite, 0);
    // only the breathing tween needs restarting on the fresh sprite — the
    // sway/hop tweens live on previewRoot itself and were never destroyed
    this.tweens.add({
      targets: this.previewSprite,
      scaleY: this.previewSprite.scaleY * 1.045,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.paintAnimalSelector();
    this.applyAccessoryToPreview(this.selectedPetItem);
  }

  private startPreviewIdle(): void {
    if (!this.previewSprite || !this.previewRoot) return;
    this.tweens.add({
      targets: this.previewSprite,
      scaleY: this.previewSprite.scaleY * 1.045,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.previewRoot,
      angle: { from: -2.5, to: 2.5 },
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    // an occasional cute little hop, since there's no separate blink frame to animate
    this.time.addEvent({
      delay: 3600,
      loop: true,
      callback: () => {
        if (!this.previewRoot) return;
        this.tweens.add({ targets: this.previewRoot, y: this.previewRoot.y - 8, duration: 180, yoyo: true, ease: "Sine.easeOut" });
      },
    });
  }

  private setPreviewBuyVisible(visible: boolean): void {
    this.previewBuyBg?.setVisible(visible);
    this.previewBuyLabel?.setVisible(visible);
    this.previewBuyHit?.setActive(visible);
    if (this.previewBuyHit) this.previewBuyHit.input!.enabled = visible;
  }

  /** Switching tabs (not just picking a card) resets the preview to whatever is REALLY equipped, discarding any un-bought try-on — "close without buying = no purchase, preview disappears". */
  private refreshPreviewForTab(): void {
    if (this.activeTab !== "pet") {
      this.selectedPetItem = null;
      this.applyAccessoryToPreview(frostedShop.equippedFor(this.previewAnimalId));
      this.previewBlurb?.setVisible(true);
      this.previewNameText?.setText("");
      this.previewPriceText?.setText("");
      this.setPreviewBuyVisible(false);
      return;
    }
    const equipped = frostedShop.equippedFor(this.previewAnimalId);
    this.selectedPetItem = equipped;
    if (equipped) this.paintCardHighlight(equipped, true);
    this.applyAccessoryToPreview(equipped);
    this.updatePreviewInfoPanel();
  }

  private updatePreviewInfoPanel(): void {
    if (this.activeTab !== "pet" || !this.selectedPetItem) {
      this.previewBlurb?.setVisible(true);
      this.previewNameText?.setText("");
      this.previewPriceText?.setText("");
      this.setPreviewBuyVisible(false);
      return;
    }
    const item = frostedShop.def(this.selectedPetItem);
    if (!item) return;
    const owned = frostedShop.isPetOwned(item.id);
    this.previewBlurb?.setVisible(false);
    this.previewNameText?.setText(item.label);
    this.previewPriceText?.setText(owned ? "Owned — tap to equip" : `🪙 ${item.price}`);
    this.previewBuyLabel?.setText(owned ? "EQUIP" : "BUY").setColor("#5b3a00");
    this.setPreviewBuyVisible(true);
  }

  private applyAccessoryToPreview(itemId: string | null): void {
    this.previewAccessory?.destroy();
    this.previewAccessory = undefined;
    this.previewAccessoryShadow?.destroy();
    this.previewAccessoryShadow = undefined;
    this.previewAccessoryItem = undefined;
    if (!itemId || !this.previewSprite || !this.previewRoot) return;
    const item = frostedShop.def(itemId);
    if (!item || !item.anchor) return;

    // placed (and then re-fitted every frame in update()) by the shared
    // fitting the world animals use too — see petAccessoryFit
    const img = this.add.image(0, 0, item.textureKey).setDepth(5).setAlpha(0);
    // a soft contact shadow UNDER the accessory, on the fur — the single
    // biggest cue that grounds a flat cutout against the body instead of
    // reading as a sticker floating in front of it.
    const shadow = this.add.ellipse(0, 0, 10, 10, 0x2b1a12, 0.22).setDepth(4).setAlpha(0);
    this.previewRoot.add(shadow);
    this.previewRoot.add(img);
    this.previewAccessory = img;
    this.previewAccessoryShadow = shadow;
    this.previewAccessoryItem = item;
    this.syncPreviewAccessory();

    this.tweens.add({ targets: shadow, alpha: 0.22, duration: 200 });
    // alpha fades in once and stays — kept as its own tween so it's never
    // caught by the scale-pop's yoyo (a single tween's yoyo reverses EVERY
    // property it targets, which previously also yoyoed alpha back to 0)
    this.tweens.add({ targets: img, alpha: 1, duration: 160 });
    this.tweens.killTweensOf(this.previewPop);
    this.previewPop.k = 1;
    this.tweens.add({ targets: this.previewPop, k: 1.1, duration: 160, ease: "Back.easeOut", yoyo: true });
  }

  update(): void {
    this.syncPreviewAccessory();
  }

  /** Keeps the worn accessory on the head through the breathing tween (which scales only the sprite). */
  private syncPreviewAccessory(): void {
    const img = this.previewAccessory;
    const item = this.previewAccessoryItem;
    if (!img || !item || !this.previewSprite?.active) return;
    const pose = wornAccessoryPose(this.previewSprite, this.previewAnimalId, item, this.previewBaseScale);
    if (!pose) return;
    img
      .setPosition(pose.x, pose.y)
      .setOrigin(pose.originX, pose.originY)
      .setRotation(pose.rotation)
      .setScale(pose.scale * this.previewPop.k)
      .setFlipX(pose.flipX);
    const shadow = this.previewAccessoryShadow;
    if (!shadow) return;
    const shadowW = pose.visibleH * 0.9;
    if (shadow.width !== shadowW) shadow.setSize(shadowW, shadowW * 0.32);
    shadow.setPosition(pose.x, pose.y + pose.visibleH * (item.anchor === "neck" ? 0.08 : item.anchor === "collar" ? 0.1 : 0.22));
  }

  private close(): void {
    this.registry.set("pointerOnUI", false);
    this.scene.stop();
    this.scene.resume("FrostedValley");
  }
}
