import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ["@tensorflow/tfjs", "@tensorflow-models/pose-detection"],
  },
  plugins: [react()],
});
