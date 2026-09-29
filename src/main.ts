import "@fontsource/baloo-2/400.css";
import "@fontsource/baloo-2/500.css";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/700.css";

import { startGame } from "./game/DreamGarden";

const __dgGame = startGame();
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__dgGame = __dgGame;
