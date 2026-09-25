import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", ".claude/worktrees/**", ".worktrees/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
