import Phaser from "phaser";
import { FONT_FAMILY, titleStyle, labelStyle } from "../ui/theme";
import { makePanel, makePill } from "../ui/Panel";
import { Button } from "../ui/Button";
import { makeIconButton } from "../ui/hit";
import { bus, economy, progression, shop } from "../game/services";
import { CATALOG } from "../data/objects";
import {
  ACCESSORY_CATALOG,
  accessoryIconFor,
  accessoryItem,
  calculateAccessoryTransform,
  decorItem,
  type AccessoryCatalogItem,
  type DecorCatalogItem,
} from "../data/shop";
import { sparkleBurst } from "../fx/Particles";
import { audio } from "../audio/AudioManager";

/** Content-space y where the item grid starts, below the Mystery Gift + Puzzle Hint cards. */
const GRID_TOP = 250;

type Tab = "daily" | "accessories";

/**
 * The Dream Garden Shop: Daily decor rotation + Accessories + one Mystery
 * Gift offer (see data/shop.ts + core/ShopService.ts). Purely personalization
 * — never sells anything the restoration system needs (Part Q).
 */
export class ShopScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private content!: Phaser.GameObjects.Container;
  private coinsLabel!: Phaser.GameObjects.Text;
  private tab: Tab = "daily";
  private dailyBtn!: Button;
  private accessoriesBtn!: Button;
  private closing = false;
  private panelW = 720;
  private panelH = 800;
  private viewportTop = -240;
  private viewportHeight = 600;
  private scrollOffset = 0;
  private contentHeight = 0;
  private suppressTapUntil = 0;
  private scrollBar!: Phaser.GameObjects.Graphics;
  private equipPanel?: Phaser.GameObjects.Container;

  constructor() {
    super("Shop");
  }

  init(): void {
    this.closing = false;
    this.tab = "daily";
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x252b20, 0.7).setOrigin(0).setInteractive();
    this.root = this.add.container(this.scale.width / 2, this.scale.height / 2);
    this.panelW = Math.min(720, this.scale.width - 20);
    this.panelH = Math.min(800, this.scale.height - 24);
    const w = this.panelW, top = -this.panelH / 2;
    this.root.add(makePanel(this, w, this.panelH, { radius: 32, fill: 0xb47b48, edge: 0x754b2e }));
    this.root.add(makePanel(this, w - 24, this.panelH - 24, { radius: 26, fill: 0xfff3dc, edge: 0xe6c392 }));
    this.root.add(this.add.text(0, top + 38, "Dream Garden Shop", titleStyle(w < 500 ? 24 : 32)).setOrigin(0.5).setColor("#5b3d22"));
    this.root.add(makePill(this, 144, 38).setPosition(0, top + 82));
    this.root.add(this.add.image(-48, top + 82, "coin").setDisplaySize(26, 26));
    this.coinsLabel = this.add.text(-22, top + 82, `${economy.coins}`, labelStyle(20)).setOrigin(0, 0.5);
    this.root.add(this.coinsLabel);
    this.root.add(makeIconButton(this, w / 2 - 35, top + 82, "✕", 24, () => this.close(), { color: "#7a4d12" }));
    const tabW = Math.min(190, (w - 64) / 2);
    this.dailyBtn = new Button(this, -(tabW + 12) / 2, top + 137, {
      width: tabW, height: 46, label: "Daily", fontSize: 18, variant: "gold", onClick: () => this.setTab("daily"),
    });
    this.accessoriesBtn = new Button(this, (tabW + 12) / 2, top + 137, {
      width: tabW, height: 46, label: "Accessories", fontSize: 18, variant: "gold", onClick: () => this.setTab("accessories"),
    });
    this.root.add([this.dailyBtn, this.accessoriesBtn]);
    this.viewportTop = top + 176;
    this.viewportHeight = this.panelH - 202;
    this.scrollOffset = 0;
    this.content = this.add.container(0, this.viewportTop);
    this.root.add(this.content);
    // Mask uses scene coordinates; it never renders. Input is clipped separately.
    const maskShape = this.make.graphics({ x: this.root.x, y: this.root.y });
    maskShape.fillStyle(0xffffff).fillRect(-w / 2 + 20, this.viewportTop, w - 40, this.viewportHeight);
    this.content.setMask(maskShape.createGeometryMask());
    this.scrollBar = this.add.graphics();
    this.root.add(this.scrollBar);
    let dragging = false, lastY = 0, distance = 0;
    const inside = (p: Phaser.Input.Pointer) => Math.abs(p.x - this.root.x) < w / 2 - 20 && p.y > this.root.y + this.viewportTop && p.y < this.root.y + this.viewportTop + this.viewportHeight;
    this.input.on("wheel", (p: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      if (inside(p) && !this.equipPanel) this.scrollTo(this.scrollOffset + dy);
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => { dragging = inside(p) && !this.equipPanel; lastY = p.y; distance = 0; });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!dragging || !p.isDown) return;
      const dy = lastY - p.y; lastY = p.y; distance += Math.abs(dy);
      if (distance > 8) { this.suppressTapUntil = this.time.now + 350; this.scrollTo(this.scrollOffset + dy); }
    });
    this.input.on("pointerup", () => { dragging = false; });
    this.input.on("pointerupoutside", () => { dragging = false; });
    const resize = () => this.scene.restart();
    this.scale.on("resize", resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.scale.off("resize", resize); maskShape.destroy(); });

    this.rebuild();

    const off = bus.on("coins:changed", () => this.coinsLabel.setText(`${economy.coins}`));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
  }

  private setTab(tab: Tab): void {
    if (this.tab === tab) return;
    this.tab = tab;
    this.scrollOffset = 0;
    this.rebuild();
  }

  private rebuild(): void {
    this.closeEquipPanel();
    this.content.removeAll(true);
    // re-skin the tab buttons (Button has no variant setter, so just tint via alpha)
    this.dailyBtn.setAlpha(this.tab === "daily" ? 1 : 0.72);
    this.accessoriesBtn.setAlpha(this.tab === "accessories" ? 1 : 0.72);

    this.buildMysteryGiftCard();
    this.buildHintCard();
    if (this.tab === "daily") this.buildDailyGrid();
    else this.buildAccessoriesGrid();
    this.scrollTo(this.scrollOffset);
  }

  /* ---------------- Puzzle Hint ---------------- */

  /** Consumable: +1 to the saved hint inventory, spent in rescue puzzles
   *  ("My Hints" / "Use Hint" there). Sits under the Mystery Gift on every tab. */
  private buildHintCard(): void {
    const w = this.panelW - 52;
    const compact = w < 500;
    const card = this.add.container(0, 65 + 59 + 12 + 52);
    card.add(makePanel(this, w, 104, { radius: 22, fill: 0xf1e6f6, edge: 0xc9b0dc }));
    const glow = this.add.image(-w / 2 + 48, 0, "glow").setDisplaySize(96, 96).setTint(0xffe6a3).setAlpha(0.55);
    const star = this.add.image(-w / 2 + 48, 0, "star_special").setDisplaySize(58, 58);
    card.add([glow, star]);
    const textX = compact ? 20 : -w / 2 + 110;
    card.add(this.add.text(textX, compact ? -28 : -18, "Puzzle Hint", { ...labelStyle(20), color: "#5e3f73" }).setOrigin(compact ? 0.5 : 0, 0.5));
    const owned = this.add.text(textX, compact ? -4 : 12, `You have: ${shop.hintsOwned}`, { ...labelStyle(15), color: "#70482e" }).setOrigin(compact ? 0.5 : 0, 0.5);
    card.add(owned);
    card.add(new Button(this, compact ? 20 : w / 2 - 95, compact ? 30 : 0, {
      width: 156, height: 42, label: `Buy · ${shop.hintCost}`, fontSize: 17, variant: "gold",
      onClick: () => {
        if (!this.canTapCatalog()) return;
        const res = shop.buyHint();
        if (!res.ok) { this.toast(res.reason === "cannot afford" ? "Not enough coins yet." : "Couldn't buy that."); return; }
        audio.playSfx("shop_purchase");
        owned.setText(`You have: ${shop.hintsOwned}`);
        this.tweens.add({ targets: owned, scale: { from: 1.2, to: 1 }, duration: 260, ease: "Back.easeOut" });
        this.toast(`Puzzle Hint added! You have ${shop.hintsOwned}.`);
      },
    }));
    this.content.add(card);
  }

  /* ---------------- Mystery Gift ---------------- */

  private buildMysteryGiftCard(): void {
    const w = this.panelW - 52;
    const compact = w < 500;
    const card = this.add.container(0, 65);
    card.add(makePanel(this, w, 118, { radius: 22, fill: 0xf7ead0, edge: 0xe2b978 }));
    const gift = this.add.image(-w / 2 + 48, 0, "dg_mystery_gift");
    gift.setScale(Math.min(76 / gift.width, 90 / gift.height));
    card.add(gift);
    const textX = compact ? 32 : -w / 2 + 110;
    card.add(this.add.text(textX, -30, "Mystery Gift", { ...labelStyle(20), color: "#70482e" }).setOrigin(compact ? 0.5 : 0, 0.5));
    if (!compact) card.add(this.add.text(textX, 4, "A surprise for your garden", labelStyle(15)).setOrigin(0, 0.5));
    card.add(new Button(this, compact ? 32 : w / 2 - 95, compact ? 22 : 8, {
      width: 156, height: 44, label: `Open · ${shop.mysteryGiftCost}`, fontSize: 17, variant: "gold",
      onClick: () => { if (this.canTapCatalog()) this.openMysteryGift(card); },
    }));
    this.content.add(card);
  }

  private openMysteryGift(card: Phaser.GameObjects.Container): void {
    if (!this.canTapCatalog()) return;
    this.suppressTapUntil = this.time.now + 450;
    const result = shop.openMysteryGift();
    if (!result.ok) {
      this.toast(result.reason === "cannot afford" ? "Not enough coins yet." : "Something went wrong.");
      return;
    }
    audio.playSfx("shop_purchase");
    const [wx, wy] = [this.root.x, this.root.y + this.content.y + 65];
    sparkleBurst(this, wx, wy, 20, 70);
    const reward = result.reward!;
    const displayName =
      reward.kind === "accessory" ? accessoryItem(reward.refId)?.label : decorItem(reward.refId)?.label;
    this.toast(`You received: ${displayName ?? reward.refId}! ✨`);
    void card;
    this.rebuild();
  }

  /* ---------------- Daily ---------------- */

  private buildDailyGrid(): void {
    const items = shop.dailyItems();
    const cols = this.panelW < 500 ? 2 : 3;
    const gapX = 12, gapY = 16;
    const cardW = (this.panelW - 56 - (cols - 1) * gapX) / cols;
    const cardH = 226;
    const startX = -(cols - 1) * (cardW + gapX) * 0.5;
    const startY = GRID_TOP + cardH / 2;
    this.contentHeight = GRID_TOP + Math.ceil(items.length / cols) * (cardH + gapY);
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      this.content.add(this.buildDecorCard(item, x, y, cardW, cardH));
    });
  }

  private buildDecorCard(item: DecorCatalogItem, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    c.add(makePanel(this, w, h, { radius: 22, fill: 0xf8e7ca, edge: 0xe8cda6 }));
    const art = this.add.image(0, -h * 0.2, item.icon);
    art.setScale(Math.min((w - 40) / art.width, (h * 0.52) / art.height));
    c.add(art);
    c.add(
      this.add
        .text(0, h * 0.14, item.label, { fontFamily: FONT_FAMILY, fontStyle: "700", fontSize: "18px", color: "#70482e", align: "center", wordWrap: { width: w - 20 } })
        .setOrigin(0.5),
    );
    const owned = shop.decorOwnedCount(item.id);
    const btnLabel = owned > 0 ? `Place (${owned})` : `${item.cost}`;
    c.add(
      new Button(this, 0, h * 0.36, {
        width: w - 30,
        height: 44,
        label: owned > 0 ? btnLabel : `Buy · ${item.cost}`,
        fontSize: 16,
        variant: owned > 0 ? "gold" : "cream",
        onClick: () => { if (this.canTapCatalog()) this.onDecorCardTap(item); },
      }),
    );
    return c;
  }

  private onDecorCardTap(item: DecorCatalogItem): void {
    if (!this.canTapCatalog()) return;
    this.suppressTapUntil = this.time.now + 450;
    if (shop.decorOwnedCount(item.id) > 0) {
      bus.emit("decor:placeStart", { itemId: item.id });
      this.close();
      return;
    }
    const res = shop.buyDecor(item.id);
    if (!res.ok) {
      this.toast(res.reason === "cannot afford" ? "Not enough coins yet." : "Couldn't buy that.");
      return;
    }
    audio.playSfx("shop_purchase");
    this.toast(`${item.label} added! Place it in the garden.`);
    this.rebuild();
  }

  /* ---------------- Accessories ---------------- */

  private buildAccessoriesGrid(): void {
    const items = ACCESSORY_CATALOG;
    const cols = this.panelW < 500 ? 2 : 3;
    const gapX = 12, gapY = 16;
    const cardW = (this.panelW - 56 - (cols - 1) * gapX) / cols;
    const cardH = 226;
    const startX = -(cols - 1) * (cardW + gapX) * 0.5;
    const startY = GRID_TOP + cardH / 2;
    this.contentHeight = GRID_TOP + Math.ceil(items.length / cols) * (cardH + gapY);
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      this.content.add(this.buildAccessoryCard(item, x, y, cardW, cardH));
    });
  }

  private buildAccessoryCard(item: AccessoryCatalogItem, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const rarityEdge = item.rarity === "magical" ? 0xd9a43c : item.rarity === "rare" ? 0xb98be0 : 0xe8cda6;
    c.add(makePanel(this, w, h, { radius: 22, fill: 0xf8e7ca, edge: rarityEdge }));
    const art = this.add.image(0, -h * 0.2, item.icon);
    art.setScale(Math.min((w - 40) / art.width, (h * 0.48) / art.height));
    c.add(art);
    c.add(
      this.add
        .text(0, h * 0.1, item.label, { fontFamily: FONT_FAMILY, fontStyle: "700", fontSize: "17px", color: "#70482e", align: "center", wordWrap: { width: w - 20 } })
        .setOrigin(0.5),
    );
    const owned = shop.ownsAccessory(item.id);
    // Tapping always opens the Try It On preview now (see onAccessoryCardTap)
    // — an unowned item still shows its price here so cost is visible at a
    // glance, but the tap itself never spends coins; buying happens from the
    // preview panel once you've seen the fit.
    if (!owned) {
      c.add(this.add.text(0, h * 0.21, `${item.cost} coins`, labelStyle(13)).setOrigin(0.5));
    }
    c.add(
      new Button(this, 0, h * 0.36, {
        width: w - 30,
        height: 44,
        label: "Try It On",
        fontSize: 16,
        variant: owned ? "gold" : "cream",
        onClick: () => { if (this.canTapCatalog()) this.onAccessoryCardTap(item); },
      }),
    );
    return c;
  }

  /** Tapping a card always opens the Try It On preview first, owned or not
   *  — buying happens from inside the panel once you've seen the fit. */
  private onAccessoryCardTap(item: AccessoryCatalogItem): void {
    if (!this.canTapCatalog()) return;
    this.suppressTapUntil = this.time.now + 450;
    this.openEquipPanel(item);
  }

  /** Small inline picker: choose a RESCUED animal to try this accessory on
   *  (Part Q — a still-silhouette animal never appears as a choice here).
   *  Opens for owned AND unowned items alike — Try It On is a free look
   *  before spending coins; the bottom button is Buy until owned, then
   *  Equip, so the flow is preview -> buy -> equip without leaving the
   *  panel or losing which animal you were checking the fit on. */
  private openEquipPanel(item: AccessoryCatalogItem, preselectId?: string): void {
    this.closeEquipPanel();
    const rescued = CATALOG.filter((o) => o.category === "animal" && progression.isUnlocked(o.id));
    const panel = this.add.container(0, 0);
    panel.setDepth(50);
    const w = this.panelW - 40;
    const cols = w < 450 && this.panelH >= 650 ? 2 : 3;
    const rows = Math.ceil(rescued.length / cols);
    const h = 340 + rows * 76;
    const veil = this.add.rectangle(0, 0, this.panelW - 24, this.panelH - 24, 0x2a2036, 0.65).setInteractive();
    veil.on("pointerup", () => this.closeEquipPanel());
    panel.add(veil);
    const box = this.add.container(0, 0);
    box.add(makePanel(this, w, h, { radius: 24, fill: 0xfff3dc, edge: 0xe2b978 }));
    box.add(this.add.text(0, -h / 2 + 28, rescued.length ? item.label : "Rescue an animal first!", {
      ...labelStyle(21), color: "#70482e", wordWrap: { width: w - 28 }, align: "center",
    }).setOrigin(0.5));
    let selected = rescued.find((o) => o.id === preselectId) ?? rescued[0];
    if (selected) {
      const feet = -h / 2 + 224;
      const animal = this.add.image(0, feet, selected.garden_sprite).setOrigin(0.5, 1);
      const accessory = this.add.image(0, 0, accessoryIconFor(selected.id, item.id) ?? item.icon).setOrigin(0.5, 0.5);
      box.add([animal, accessory]);
      // Same calculateAccessoryTransform() the real Garden animal uses (see
      // GardenScene.refreshAccessories) — passing the animal's ON-SCREEN
      // (already-fit-to-preview-box) size as the reference width/height, so
      // the returned local offsets are directly usable in this box's space.
      const updatePreview = () => {
        animal.setTexture(selected.garden_sprite).setScale(Math.min(165 / animal.width, 160 / animal.height));
        // accessoryIconFor() — some animal+accessory combos use their own
        // custom art (e.g. Nibs' Round Glasses) instead of the generic icon;
        // must re-resolve on every animal switch, not just at panel open.
        accessory.setTexture(accessoryIconFor(selected.id, item.id) ?? item.icon);
        const t = calculateAccessoryTransform(selected.id, item.id, animal.displayWidth, animal.displayHeight, accessory.width, accessory.height);
        if (!t) { accessory.setVisible(false); return; }
        accessory.setVisible(true);
        accessory.setPosition(t.x, feet + t.y);
        accessory.setScale(t.scale);
        accessory.setAngle(t.rotation);
        // render order must follow the SAME transform the world uses (see
        // GardenScene.refreshAccessories' container.addAt) — a "behind"
        // accessory sitting on top here would silently diverge preview from
        // world even though the position/scale math is otherwise identical.
        if (t.depthOffset < 0) box.moveBelow(accessory, animal);
        else box.moveAbove(accessory, animal);
      };
      updatePreview();
      rescued.forEach((def, i) => {
        const bx = ((i % cols) - (cols - 1) / 2) * (w - 24) / cols;
        const by = -h / 2 + 270 + Math.floor(i / cols) * 76;
        const portrait = this.add.image(bx, by, def.garden_sprite).setInteractive({ useHandCursor: true });
        portrait.setScale(Math.min(48 / portrait.width, 48 / portrait.height));
        portrait.on("pointerup", () => { selected = def; updatePreview(); });
        box.add(portrait);
        box.add(this.add.text(bx, by + 28, def.name.split(" ")[0], labelStyle(13)).setOrigin(0.5));
      });
      const owned = shop.ownsAccessory(item.id);
      box.add(new Button(this, 0, h / 2 - 30, {
        width: Math.min(220, w - 48), height: 44,
        label: owned ? "Equip" : `Buy · ${item.cost}`, fontSize: 19,
        variant: owned ? "gold" : "cream",
        onClick: () => {
          if (!owned) {
            const res = shop.buyAccessory(item.id);
            if (!res.ok) { this.toast(res.reason === "cannot afford" ? "Not enough coins yet." : "Couldn't buy that."); return; }
            audio.playSfx("shop_purchase");
            this.rebuild();
            this.openEquipPanel(item, selected.id); // reopen in place, now showing Equip
            return;
          }
          const res = shop.equip(selected.id, item.id);
          if (res.ok) { audio.playSfx("accessory_equip"); this.closeEquipPanel(); this.toast(`${selected.name} is wearing ${item.label}!`); }
        },
      }));
    }
    panel.add(box);
    this.root.add(panel);
    this.equipPanel = panel;
    this.scrollTo(this.scrollOffset);
    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 160 });
  }

  private closeEquipPanel(): void {
    this.equipPanel?.destroy();
    this.equipPanel = undefined;
    if (this.content) this.scrollTo(this.scrollOffset);
  }

  private canTapCatalog(): boolean {
    return !this.equipPanel && this.time.now > this.suppressTapUntil && !this.closing;
  }

  private scrollTo(offset: number): void {
    const max = Math.max(0, this.contentHeight - this.viewportHeight);
    this.scrollOffset = Phaser.Math.Clamp(offset, 0, max);
    this.content.y = this.viewportTop - this.scrollOffset;
    const clipTop = this.root.y + this.viewportTop, clipBottom = clipTop + this.viewportHeight;
    const visit = (node: Phaser.GameObjects.GameObject) => {
      if (node instanceof Button && node.input) {
        const bounds = node.getBounds();
        node.input.enabled = !this.equipPanel && bounds.top >= clipTop && bounds.bottom <= clipBottom;
      }
      if (node instanceof Phaser.GameObjects.Container) node.list.forEach(visit);
    };
    this.content.list.forEach(visit);
    this.scrollBar.clear();
    if (max > 0) {
      const h = Math.max(28, this.viewportHeight * this.viewportHeight / this.contentHeight);
      const y = this.viewportTop + (this.viewportHeight - h) * this.scrollOffset / max;
      this.scrollBar.fillStyle(0xb47b48, 0.7).fillRoundedRect(this.panelW / 2 - 19, y, 4, h, 2);
    }
  }

  /* ---------------- shared ---------------- */

  private toastNode?: Phaser.GameObjects.Container;
  private toast(msg: string): void {
    this.toastNode?.destroy();
    const t = this.add.container(0, this.panelH / 2 - 65);
    t.add(makePanel(this, Math.min(this.panelW - 48, 560), 72, { radius: 20, fill: 0x3a2c22, edge: 0x2a2018, shadow: false }));
    t.add(this.add.text(0, 0, msg, { fontFamily: FONT_FAMILY, fontStyle: "600", fontSize: "17px", color: "#fff3dc", align: "center", wordWrap: { width: this.panelW - 80 } }).setOrigin(0.5));
    this.root.add(t);
    this.toastNode = t;
    t.setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 150 });
    this.time.delayedCall(1800, () => {
      if (this.toastNode === t) {
        this.tweens.add({ targets: t, alpha: 0, duration: 200, onComplete: () => t.destroy() });
        this.toastNode = undefined;
      }
    });
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    bus.emit("shop:closed", {});
    if (this.scene.isPaused("Garden")) this.scene.resume("Garden");
    this.scene.stop();
  }
}
