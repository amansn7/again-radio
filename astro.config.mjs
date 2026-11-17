import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
  devToolbar: { enabled: false },
  server: { port: 4321, allowedHosts: [".trycloudflare.com"] },
  preview: { port: 4321 },
});
