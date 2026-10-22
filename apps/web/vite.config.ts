import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Uploaded images are served at /assets/*, so built files live elsewhere.
  build: { assetsDir: "static" },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/assets": "http://localhost:3001",
    },
  },
});
