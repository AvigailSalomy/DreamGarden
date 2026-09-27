import { economy, progression } from "../game/services";
import { ShopSaveService } from "./ShopSaveService";
import { ShopService } from "./ShopService";

/**
 * Mirrors `src/game/services.ts`'s singleton pattern. Only *reads* the main
 * game's `economy`/`progression` singletons through `ShopService`'s narrow
 * interfaces — this file never modifies `game/services.ts` or the classes it
 * wires up.
 */
export const shopSave = new ShopSaveService();
export const shop = new ShopService(shopSave, economy, progression);
