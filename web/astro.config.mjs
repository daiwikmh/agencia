import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

// Local .env reaches the server through process.env at runtime. It is never read
// via import.meta.env, so no secret is ever inlined into the build output.
// On Vercel this finds nothing and the platform's env vars are used instead.
Object.assign(process.env, loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""));
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

export default defineConfig({
  output: "server",
  adapter: vercel(),
  integrations: [react()],
  server: { port: 4321 },
});
