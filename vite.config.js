import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// En desarrollo, /api va al servidor local (npm run dev:api).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://localhost:${process.env.API_PORT || 3001}`,
    },
  },
});
