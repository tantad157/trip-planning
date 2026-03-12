import { defineConfig } from "vite";

export default defineConfig({
  base: "/trip-planning/",
  build: {
    outDir: "dist",
    minify: true,
    rollupOptions: {
      input: "index.html",
    },
  },
});
