import { mergeConfig } from "vite";
import base from "../vite.config";

/**
 * A dev server just for the e2e suite: DEV build (so the window.__dg* test
 * hooks exist) but with hot reload and file watching OFF, so edits made
 * while a test run is in progress can never reload the page mid-scenario.
 * Restart it to pick up code changes.
 *
 *   npx vite --config e2e/vite.e2e.config.ts
 *   URL=http://localhost:5199/ node e2e/frostedMazeInput.e2e.mjs
 */
export default mergeConfig(base, {
  server: { port: 5199, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } },
});
