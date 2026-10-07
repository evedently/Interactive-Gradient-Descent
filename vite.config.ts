import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; the deploy workflow sets
  // this. Local dev, preview, and tests keep the root path.
  base: process.env.GITHUB_PAGES_BASE ?? "/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
