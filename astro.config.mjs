import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  devOptions: {
    hmr: false,
    liveReload: false,
  },
  vite: {
    plugins: [tailwindcss()],
    server: { proxy: { "/presence": { target: "http://127.0.0.1:8787", ws: true } } },
  },
  devToolbar: { enabled: false },
  server: { port: 4321, allowedHosts: [".trycloudflare.com"] },
  preview: { port: 4321 },
});
