/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { validateBuildEnvironment } from "./build-config";

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "build") validateBuildEnvironment(loadEnv(mode, process.cwd(), "VITE_"));
  return {
    plugins: [react()],
    server: { host: "127.0.0.1" },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      globals: false,
      exclude: ["**/node_modules/**", "e2e/**", "dist/**"],
    },
  };
});
