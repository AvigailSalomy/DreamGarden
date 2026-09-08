import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: { host: true, port: 5173, strictPort: false },
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1800,
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
