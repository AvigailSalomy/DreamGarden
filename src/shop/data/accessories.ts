import type { AccessoryDef } from "../types";

/** Fit any unlocked animal — the baseline every collection can draw from. */
export const UNIVERSAL_ACCESSORIES: AccessoryDef[] = [
  { id: "bow", label: "Bow", icon: "acc_bow", rarity: "common", price: 40, compatibleAnimalIds: "universal", previewOffset: { x: 26, y: -30 } },
  { id: "glasses", label: "Glasses", icon: "acc_glasses", rarity: "common", price: 45, compatibleAnimalIds: "universal", previewOffset: { x: 0, y: -18 } },
  { id: "scarf", label: "Scarf", icon: "acc_scarf", rarity: "common", price: 50, compatibleAnimalIds: "universal", previewOffset: { x: 0, y: 18 } },
  { id: "headphones", label: "Headphones", icon: "acc_headphones", rarity: "rare", price: 70, compatibleAnimalIds: "universal", previewOffset: { x: 0, y: -46 } },
  { id: "crown", label: "Tiny Crown", icon: "acc_crown", rarity: "rare", price: 90, compatibleAnimalIds: "universal", previewOffset: { x: 0, y: -62 } },
  { id: "witch_hat", label: "Witch Hat", icon: "acc_witch_hat", rarity: "epic", price: 130, compatibleAnimalIds: "universal", previewOffset: { x: 0, y: -68 } },
  { id: "fairy_wings", label: "Fairy Wings", icon: "acc_fairy_wings", rarity: "epic", price: 150, compatibleAnimalIds: "universal", previewOffset: { x: 0, y: 6 } },
  { id: "magic_hat", label: "Magic Hat", icon: "acc_magic_hat", rarity: "legendary", price: 220, compatibleAnimalIds: "universal", previewOffset: { x: 0, y: -68 } },
];

/** Designed around a specific animal's body/theme — only ever offered inside its own collection. */
export const ANIMAL_SPECIFIC_ACCESSORIES: AccessoryDef[] = [
  {
    id: "carrot_backpack",
    label: "Carrot Backpack",
    icon: "acc_carrot_backpack",
    rarity: "rare",
    price: 80,
    compatibleAnimalIds: ["rabbit"],
    previewOffset: { x: -8, y: 20 },
  },
];

export const ALL_ACCESSORIES: AccessoryDef[] = [...UNIVERSAL_ACCESSORIES, ...ANIMAL_SPECIFIC_ACCESSORIES];
