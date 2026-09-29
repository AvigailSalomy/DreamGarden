/** Shared tuning: collectible value is separate from the existing success leaf bonus. */
export const MAZE_ECONOMY = {
  easy: { count: 12, value: 2 },   // 24 coins available
  medium: { count: 18, value: 2 }, // 36 coins available
  hard: { count: 24, value: 2 },   // 48 coins available
} as const;
export const MAZE_LEAF_SUCCESS_VALUE = 1;
/** puzzleHint: a consumable — about one medium maze run of coins (36) plus
 *  leaves, and well under the cheapest permanent decor (basicMinimum). */
export const SHOP_ECONOMY = { basicMinimum: 150, mysteryGift: 500, puzzleHint: 40 } as const;
