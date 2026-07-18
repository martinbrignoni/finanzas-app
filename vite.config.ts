/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/finanzas-app/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    open: true,
  },
  test: {
    environment: "jsdom",
  },
});
