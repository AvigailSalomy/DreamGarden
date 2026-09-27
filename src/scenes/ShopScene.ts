import Phaser from "phaser";
import { COLORS, FONT_FAMILY, bodyStyle, labelStyle, titleStyle } from "../ui/theme";
import { makePanel, makePill } from "../ui/Panel";
import { Button } from "../ui/Button";
import { makeIconButton } from "../ui/hit";
import { safeInsets } from "../util/safeArea";
import { Sfx } from "../fx/Sfx";
import { sparkleBurst } from "../fx/Particles";
import { shop } from "../shop/shopServices";
import { ANIMAL_COLLECTIONS } from "../shop/data/animalCollections";
import { RARITY_COLORS, RARITY_LABELS } from "../shop/theme";
import type { AccessoryDef, GardenItemDef } from "../shop/types";

const SVG = (name: string) => `assets/svg/${name}.svg`;

type Tab = "animals" | "garden" | "special";
type PreviewEntry =
  | { kind: "accessory"; def: AccessoryDef; animalId: string; animalLabel: string; animalIcon?: string }
  | { kind: "garden"; def: GardenItemDef };

/**
 * The Shop: three tabs (Animals / Garden / Special), animal collections
 * derived live from `shop.collections()` (which reads real unlock state),
 * a product grid with a lightweight drag-scroll, and a preview-before-buy
 * overlay. Fully self-contained — loads its own assets in `preload()` so the
 * shared `PreloadScene.ts` never needs to change for the Shop to grow.
 */
export class ShopScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private bodyContent!: Phaser.GameObjects.Container;
  private bodyMask!: Phaser.GameObjects.Graphics;
  private coinText!: Phaser.GameObjects.Text;
  private tabBar!: Phaser.GameObjects.Container;
  private tabY = 0;
  private previewLayer?: Phaser.GameObjects.Container;

  private activeTab: Tab = "animals";
  private activeAnimalId: string | null = null;

  private scrollY = 0;
  private scrollMin = 0;
  private dragging = false;
  private dragStartY = 0;
  private scrollStartY = 0;

  private bodyTop = 0;
  private bodyH = 0;

  constructor() {
    super("Shop");
  }

  preload(): void {
    const svg = (key: string, w: number, h: number) => this.load.svg(key, SVG(key), { width: w, height: h });
    // accessories
    svg("acc_bow", 64, 64);
    svg("acc_glasses", 64, 64);
    svg("acc_scarf", 64, 64);
    svg("acc_headphones", 64, 64);
    svg("acc_crown", 64, 64);
    svg("acc_witch_hat", 64, 64);
    svg("acc_fairy_wings", 64, 64);
    svg("acc_magic_hat", 64, 64);
    svg("acc_carrot_backpack", 64, 64);
    // garden decorations
    svg("shop_bench", 180, 130);
    svg("shop_garden_lamp", 120, 200);
    svg("shop_birdhouse", 130, 190);
    svg("shop_swing", 180, 180);
    svg("shop_magic_mushroom", 140, 150);
    svg("shop_fountain", 180, 180);
    svg("shop_statue", 140, 190);
    svg("shop_small_pond", 200, 130);
    // animal homes
    svg("shop_tent", 170, 140);
    svg("shop_tiny_house", 180, 170);
    svg("shop_mushroom_house", 170, 180);
    svg("shop_treehouse", 190, 220);
    // special / prestige
    svg("shop_golden_statue", 140, 190);
    svg("shop_moon_tree", 180, 220);
    svg("shop_rainbow_fountain", 190, 190);
    svg("shop_magic_portal", 170, 190);
    // mystery seed
    svg("shop_mystery_seed_unplanted", 64, 64);
    svg("shop_mystery_seed_sprout", 64, 80);
    svg("shop_mystery_seed_bloom", 80, 90);
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();

    this.root = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.skyTop, COLORS.skyMid, COLORS.skyLow, COLORS.skyLow, 1);
    bg.fillRect(0, 0, W, H);
    this.root.add(bg);

    // header
    this.root.add(
      this.add.text(W / 2, inset.top + 34, "Shop", titleStyle(30)).setOrigin(0.5),
    );

    const pillW = 130;
    const pillH = 50;
    const pill = makePill(this, pillW, pillH).setPosition(W - inset.right - pillW / 2 - 14, inset.top + 34);
    pill.add(this.add.image(-pillW / 2 + 26, 0, "coin").setDisplaySize(30, 30));
    this.coinText = this.add.text(0, 0, `${shop.coins}`, labelStyle(20)).setOrigin(0, 0.5);
    pill.add(this.coinText);
    this.root.add(pill);

    this.root.add(
      makeIconButton(this, inset.left + 30, inset.top + 34, "‹", 30, () => this.close(), {
        hitW: 56,
        hitH: 56,
      }),
    );

    // tab bar
    this.tabY = inset.top + 78;
    this.tabBar = this.add.container(0, 0);
    this.root.add(this.tabBar);
    this.rebuildTabBar();

    this.bodyTop = this.tabY + 46;
    this.bodyH = H - inset.bottom - this.bodyTop - 10;

    this.bodyMask = this.make.graphics({}, false);
    this.redrawMask();

    this.bodyContent = this.add.container(0, this.bodyTop);
    const maskObj = this.bodyMask.createGeometryMask();
    this.bodyContent.setMask(maskObj);
    this.root.add(this.bodyContent);

    // drag-scroll zone (mirrors CarrotDashScene's hand-rolled pointer-delta idiom)
    const scrollZone = this.add
      .rectangle(0, this.bodyTop, W, this.bodyH, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive();
    this.root.add(scrollZone);
    scrollZone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragStartY = p.y;
      this.scrollStartY = this.scrollY;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const next = this.scrollStartY + (p.y - this.dragStartY);
      this.scrollY = Phaser.Math.Clamp(next, this.scrollMin, 0);
      this.bodyContent.y = this.bodyTop + this.scrollY;
    });
    this.input.on("pointerup", () => (this.dragging = false));
    this.input.on("pointerupoutside", () => (this.dragging = false));

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    this.cameras.main.fadeIn(200, 246, 224, 208);

    this.renderBody();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgShop = {
        coins: () => shop.coins,
        tab: (t: Tab) => this.setTab(t),
        buyFirstAffordable: () => {
          for (const a of [...shop.gardenItems(), ...ANIMAL_COLLECTIONS.flatMap((c) => shop.accessoriesFor(c.animalId))]) {
            if (!shop.isOwned(a.id) && shop.canAfford(a.id)) return shop.purchase(a.id);
          }
          return { ok: false, reason: "insufficient_coins" };
        },
      };
    }
  }

  private onResize(): void {
    const H = this.scale.height;
    const inset = safeInsets();
    this.bodyH = H - inset.bottom - this.bodyTop - 10;
    this.redrawMask();
    this.rebuildTabBar();
    this.renderBody();
  }

  private redrawMask(): void {
    this.bodyMask.clear();
    this.bodyMask.fillStyle(0xffffff, 1);
    this.bodyMask.fillRect(0, this.bodyTop, this.scale.width, this.bodyH);
  }

  private setTab(tab: Tab): void {
    if (this.activeTab === tab) return;
    Sfx.tap();
    this.activeTab = tab;
    this.activeAnimalId = null;
    this.rebuildTabBar();
    this.renderBody();
  }

  /** Button has no variant-swap API, so the active tab is reflected by rebuilding
   *  all three with the correct gold/cream variant, rather than patching one in place. */
  private rebuildTabBar(): void {
    this.tabBar.removeAll(true);
    const W = this.scale.width;
    const tabs: Array<{ id: Tab; label: string }> = [
      { id: "animals", label: "🐾 Animals" },
      { id: "garden", label: "🌸 Garden" },
      { id: "special", label: "✨ Special" },
    ];
    const tabW = Math.min(150, (W - 40) / 3 - 8);
    const totalW = tabs.length * tabW + (tabs.length - 1) * 8;
    let tx = W / 2 - totalW / 2 + tabW / 2;
    for (const t of tabs) {
      const btn = new Button(this, tx, this.tabY, {
        width: tabW,
        height: 52,
        label: t.label,
        variant: this.activeTab === t.id ? "gold" : "cream",
        fontSize: 15,
        onClick: () => this.setTab(t.id),
      });
      this.tabBar.add(btn);
      tx += tabW + 8;
    }
  }

  /* ---------------- body rendering ---------------- */

  private refreshCoins(): void {
    this.coinText.setText(`${shop.coins}`);
  }

  private renderBody(): void {
    this.bodyContent.removeAll(true);
    this.scrollY = 0;
    this.bodyContent.y = this.bodyTop;

    if (this.activeTab === "animals") this.renderAnimalsTab();
    else this.renderItemGrid(this.activeTab === "garden" ? this.gardenTabItems() : this.specialTabItems());
  }

  private gardenTabItems(): GardenItemDef[] {
    return [...shop.gardenItems("decoration"), ...shop.gardenItems("home")];
  }

  private specialTabItems(): GardenItemDef[] {
    return [...shop.gardenItems("special"), ...shop.gardenItems("seed")];
  }

  private renderAnimalsTab(): void {
    const W = this.scale.width;

    if (this.activeAnimalId) {
      const col = shop.collections().find((c) => c.def.animalId === this.activeAnimalId);
      if (!col) {
        this.activeAnimalId = null;
        this.renderBody();
        return;
      }
      const backRow = this.add.container(0, 8);
      backRow.add(
        this.add
          .text(20, 0, `‹ ${col.def.displayName}'s Collection`, labelStyle(18))
          .setOrigin(0, 0.5)
          .setInteractive({ useHandCursor: true })
          .on("pointerover", () => this.registry.set("pointerOnUI", true))
          .on("pointerout", () => this.registry.set("pointerOnUI", false))
          .on("pointerup", () => {
            this.registry.set("pointerOnUI", false);
            Sfx.tap();
            this.activeAnimalId = null;
            this.renderBody();
          }),
      );
      this.bodyContent.add(backRow);

      const accessories = shop.accessoriesFor(this.activeAnimalId);
      this.layoutAccessoryGrid(accessories, col.def.animalId, col.def.displayName, col.def.icon, 44);
      return;
    }

    // collection tiles
    const cols = shop.collections();
    const tileW = Math.min(150, (W - 56) / 2);
    const tileH = 150;
    const gap = 16;
    let y = 8;
    let col2 = 0;
    const startX = (W - (tileW * 2 + gap)) / 2;

    cols.forEach((vm) => {
      const cx = startX + tileW / 2 + col2 * (tileW + gap);
      const tile = this.add.container(cx, y + tileH / 2);
      tile.add(makePanel(this, tileW, tileH, { highlight: vm.unlocked }));

      if (vm.unlocked && vm.def.icon) {
        tile.add(this.add.image(0, -22, vm.def.icon).setDisplaySize(64, 64));
        tile.add(this.add.text(0, 36, vm.def.displayName, labelStyle(16)).setOrigin(0.5));
        tile.add(this.add.text(0, 58, `${shop.accessoriesFor(vm.def.animalId).length} items`, bodyStyle(12)).setOrigin(0.5));
      } else if (vm.def.comingSoon) {
        tile.add(this.add.text(0, -18, "???", { ...titleStyle(28), color: "#a89a86" }).setOrigin(0.5));
        tile.add(this.add.text(0, 14, "🔒", { fontFamily: FONT_FAMILY, fontSize: "22px" }).setOrigin(0.5));
        tile.add(this.add.text(0, 46, "Coming soon", bodyStyle(12)).setOrigin(0.5));
      } else {
        tile.add(this.add.text(0, -18, vm.def.displayName, { ...titleStyle(18), color: "#8a7c68" }).setOrigin(0.5));
        tile.add(this.add.text(0, 6, "🔒", { fontFamily: FONT_FAMILY, fontSize: "22px" }).setOrigin(0.5));
        tile.add(
          this.add
            .text(0, 40, "Complete its puzzle\nto unlock", { ...bodyStyle(11), align: "center" })
            .setOrigin(0.5),
        );
      }

      const zone = this.add.rectangle(0, 0, tileW, tileH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      zone.on("pointerover", () => this.registry.set("pointerOnUI", true));
      zone.on("pointerout", () => this.registry.set("pointerOnUI", false));
      zone.on("pointerup", () => {
        this.registry.set("pointerOnUI", false);
        Sfx.tap();
        if (vm.unlocked) {
          this.activeAnimalId = vm.def.animalId;
          this.renderBody();
        }
      });
      tile.add(zone);

      this.bodyContent.add(tile);
      col2 += 1;
      if (col2 >= 2) {
        col2 = 0;
        y += tileH + gap;
      }
    });

    this.updateScrollBounds(y + (col2 > 0 ? tileH + gap : 0) + 20);
  }

  private layoutAccessoryGrid(
    items: AccessoryDef[],
    animalId: string,
    animalLabel: string,
    animalIcon: string | undefined,
    topOffset: number,
  ): void {
    const W = this.scale.width;
    const cardW = Math.min(160, (W - 56) / 2);
    const cardH = 168;
    const gap = 16;
    const startX = (W - (cardW * 2 + gap)) / 2;
    let col = 0;
    let y = topOffset;

    if (items.length === 0) {
      this.bodyContent.add(
        this.add
          .text(W / 2, topOffset + 30, "No accessories yet for this collection.", bodyStyle(15))
          .setOrigin(0.5),
      );
      this.updateScrollBounds(topOffset + 80);
      return;
    }

    for (const acc of items) {
      const cx = startX + cardW / 2 + col * (cardW + gap);
      const card = this.buildAccessoryCard(acc, animalId, cx, y + cardH / 2, cardW, cardH, () =>
        this.openPreview({ kind: "accessory", def: acc, animalId, animalLabel, animalIcon }),
      );
      this.bodyContent.add(card);
      col += 1;
      if (col >= 2) {
        col = 0;
        y += cardH + gap;
      }
    }
    this.updateScrollBounds(y + cardH + gap + 20);
  }

  private renderItemGrid(items: GardenItemDef[]): void {
    const W = this.scale.width;
    const cardW = Math.min(160, (W - 56) / 2);
    const cardH = 180;
    const gap = 16;
    const startX = (W - (cardW * 2 + gap)) / 2;
    let col = 0;
    let y = 8;

    for (const item of items) {
      const cx = startX + cardW / 2 + col * (cardW + gap);
      const card = this.buildGardenCard(item, cx, y + cardH / 2, cardW, cardH, () =>
        this.openPreview({ kind: "garden", def: item }),
      );
      this.bodyContent.add(card);
      col += 1;
      if (col >= 2) {
        col = 0;
        y += cardH + gap;
      }
    }
    this.updateScrollBounds(y + cardH + gap + 20);
  }

  private updateScrollBounds(contentH: number): void {
    this.scrollMin = Math.min(0, this.bodyH - contentH);
  }

  /* ---------------- cards ---------------- */

  private cardChrome(w: number, h: number, rarity: AccessoryDef["rarity"]): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    c.add(makePanel(this, w, h, { edge: RARITY_COLORS[rarity] }));
    return c;
  }

  private buildAccessoryCard(
    acc: AccessoryDef,
    animalId: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    onTap: () => void,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    c.add(this.cardChrome(w, h, acc.rarity));
    c.add(this.add.image(0, -h / 2 + 46, acc.icon).setDisplaySize(56, 56));
    c.add(this.add.text(0, -h / 2 + 84, acc.label, { ...labelStyle(14), align: "center", wordWrap: { width: w - 16 } }).setOrigin(0.5));
    c.add(this.add.text(0, -h / 2 + 106, RARITY_LABELS[acc.rarity], bodyStyle(11, this.rarityCss(acc.rarity))).setOrigin(0.5));

    const owned = shop.isOwned(acc.id);
    const equipped = shop.equippedFor(animalId) === acc.id;
    let stateLabel = `${acc.price}`;
    if (equipped) stateLabel = "★ Equipped";
    else if (owned) stateLabel = "✓ Owned";
    c.add(this.badgeRow(0, h / 2 - 22, stateLabel, owned));

    this.attachCardTap(c, w, h, onTap);
    return c;
  }

  private buildGardenCard(
    item: GardenItemDef,
    cx: number,
    cy: number,
    w: number,
    h: number,
    onTap: () => void,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    c.add(this.cardChrome(w, h, item.rarity));
    c.add(this.add.image(0, -h / 2 + 58, item.icon).setDisplaySize(80, 68));
    c.add(this.add.text(0, -h / 2 + 100, item.label, { ...labelStyle(14), align: "center", wordWrap: { width: w - 16 } }).setOrigin(0.5));
    c.add(this.add.text(0, -h / 2 + 122, RARITY_LABELS[item.rarity], bodyStyle(11, this.rarityCss(item.rarity))).setOrigin(0.5));

    const owned = shop.isOwned(item.id);
    c.add(this.badgeRow(0, h / 2 - 22, owned ? "✓ Owned" : `${item.price}`, owned));

    this.attachCardTap(c, w, h, onTap);
    return c;
  }

  private badgeRow(x: number, y: number, text: string, owned: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    if (owned) {
      c.add(this.add.text(0, 0, text, labelStyle(15, "#5f9a56")).setOrigin(0.5));
    } else {
      c.add(this.add.image(-16, 0, "coin").setDisplaySize(18, 18));
      c.add(this.add.text(-4, 0, text, labelStyle(15)).setOrigin(0, 0.5));
    }
    return c;
  }

  private attachCardTap(c: Phaser.GameObjects.Container, w: number, h: number, onTap: () => void): void {
    const zone = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => this.registry.set("pointerOnUI", true));
    zone.on("pointerout", () => this.registry.set("pointerOnUI", false));
    zone.on("pointerup", () => {
      this.registry.set("pointerOnUI", false);
      Sfx.tap();
      onTap();
    });
    c.add(zone);
  }

  private rarityCss(rarity: AccessoryDef["rarity"]): string {
    return { common: "#7a6350", rare: "#4d78a8", epic: "#8a5cc2", legendary: "#b8842a" }[rarity];
  }

  /* ---------------- preview overlay ---------------- */

  private openPreview(entry: PreviewEntry): void {
    this.closePreview();
    const W = this.scale.width;
    const H = this.scale.height;

    const layer = this.add.container(0, 0).setDepth(9000);
    const scrim = this.add.rectangle(0, 0, W, H, 0x2a2036, 0.6).setOrigin(0, 0).setInteractive();
    scrim.on("pointerup", () => this.closePreview());
    layer.add(scrim);

    const panelW = Math.min(W - 48, 360);
    const panelH = 420;
    const panel = makePanel(this, panelW, panelH, { edge: RARITY_COLORS[entry.def.rarity] }).setPosition(W / 2, H / 2);
    layer.add(panel);

    const cx = W / 2;
    let y = H / 2 - panelH / 2 + 30;

    layer.add(this.add.text(cx, y, entry.def.label, titleStyle(22)).setOrigin(0.5));
    y += 30;
    layer.add(this.add.text(cx, y, RARITY_LABELS[entry.def.rarity], bodyStyle(14, this.rarityCss(entry.def.rarity))).setOrigin(0.5));
    y += 46;

    if (entry.kind === "accessory") {
      // illustrative composite — the animal's own sprite with the accessory icon
      // overlaid at its configured anchor. No real sprite-layering pipeline exists
      // on the live garden animal yet (see final report) — this is Shop-local only.
      if (entry.animalIcon) {
        layer.add(this.add.image(cx, y + 60, entry.animalIcon).setDisplaySize(120, 120));
      }
      layer.add(
        this.add
          .image(cx + entry.def.previewOffset.x, y + 60 + entry.def.previewOffset.y, entry.def.icon)
          .setDisplaySize(46, 46),
      );
      layer.add(this.add.text(cx, y + 128, `on ${entry.animalLabel}`, bodyStyle(13)).setOrigin(0.5));
      y += 158;
    } else {
      const swatch = this.add.graphics();
      swatch.fillGradientStyle(COLORS.hillNear, COLORS.hillNear, COLORS.grassDull, COLORS.grassDull, 1);
      swatch.fillRoundedRect(cx - 90, y, 180, 120, 16);
      layer.add(swatch);
      layer.add(this.add.image(cx, y + 60, entry.def.icon).setDisplaySize(100, 90));
      y += 150;
    }

    const owned = shop.isOwned(entry.def.id);
    const affordable = shop.canAfford(entry.def.id);

    if (entry.kind === "accessory" && owned) {
      const equipped = shop.equippedFor(entry.animalId) === entry.def.id;
      layer.add(
        new Button(this, cx, y + 20, {
          width: panelW - 60,
          height: 58,
          label: equipped ? "Unequip" : "Equip",
          variant: equipped ? "cream" : "gold",
          fontSize: 20,
          onClick: () => {
            if (equipped) shop.unequip(entry.animalId);
            else shop.equip(entry.animalId, entry.def.id);
            Sfx.tap();
            this.closePreview();
            this.renderBody();
          },
        }),
      );
    } else if (owned) {
      layer.add(this.add.text(cx, y + 20, "✓ Owned", { ...labelStyle(20, "#5f9a56") }).setOrigin(0.5));
    } else {
      layer.add(
        new Button(this, cx, y + 20, {
          width: panelW - 60,
          height: 58,
          label: affordable ? `Buy · ${entry.def.price} coins` : `Need ${entry.def.price - shop.coins} more coins`,
          variant: affordable ? "gold" : "cream",
          fontSize: 17,
          onClick: () => this.buy(entry),
        }),
      );
    }

    layer.add(
      makeIconButton(this, W / 2 + panelW / 2 - 30, H / 2 - panelH / 2 + 28, "✕", 18, () => this.closePreview(), {
        hitW: 48,
        hitH: 48,
      }),
    );

    layer.setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: layer, alpha: 1, scale: 1, duration: 200, ease: "Back.easeOut" });
    this.previewLayer = layer;
  }

  private buy(entry: PreviewEntry): void {
    const res = shop.purchase(entry.def.id);
    if (!res.ok) return;
    Sfx.coin();
    sparkleBurst(this, this.scale.width / 2, this.scale.height / 2, 14, 50);
    this.refreshCoins();
    this.closePreview();
    this.renderBody();
  }

  private closePreview(): void {
    this.previewLayer?.destroy();
    this.previewLayer = undefined;
  }

  private close(): void {
    Sfx.tap();
    this.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 180,
      onComplete: () => this.scene.stop(),
    });
  }
}
