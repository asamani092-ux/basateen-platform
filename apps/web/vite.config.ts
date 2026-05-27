import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * بروكسي Vite: يحاكي Pages Same-Origin (/api → Worker).
 * المسارات تُمرَّر كما هي (Worker يتوقع /api/health وليس /health).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const API_PROXY_TARGET =
    env.VITE_API_PROXY_TARGET?.trim() || "http://127.0.0.1:8787";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: API_PROXY_TARGET,
          changeOrigin: true,
          secure: API_PROXY_TARGET.startsWith("https:"),
        },
      },
    },
  };
});
