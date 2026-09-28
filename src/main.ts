import "@fontsource/baloo-2/400.css";
import "@fontsource/baloo-2/500.css";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/700.css";

import * as services from "./game/services";
import { startGame } from "./game/DreamGarden";

const game = startGame();
if (import.meta.env.DEV) {
  Object.assign(window, { __dgGame: game, __dgServices: services });
}
