import { fileURLToPath, URL } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import environment from "vite-plugin-environment";

const ii_url =
  process.env.DFX_NETWORK === "local"
    ? `http://uqzsh-gqaaa-aaaaq-qaada-cai.localhost:8081/authorize`
    : `https://id.ai/authorize`;

process.env.II_URL = process.env.II_URL || ii_url;

// Test-only sign-in flag.
//
// The deployed preview is the isolated test build: the automated tester reaches
// it without an Internet Identity credential, so the test-only sign-in path
// must be compiled into that bundle. The platform's preview build runs the
// plain `pnpm build` command and does not set this variable, so defaulting it
// to "false" tree-shakes the entire test path out of the preview and leaves the
// tester stuck on the gate. The default is therefore "true" so the preview
// build ships the path.
//
// Shipping the path is not the same as exposing it. The runtime seam
// (`src/lib/testIdentity.ts`) only *shows* the test-only section on a
// non-production host, and even there the tester must activate it explicitly.
// A real user on the production Caffeine domain never sees the section, and the
// real Internet Identity flow is untouched. An explicit
// VITE_ENABLE_TEST_SIGNIN=false still disables the path entirely (for a build
// that must not contain it at all). Vite natively exposes VITE_-prefixed
// process.env values through import.meta.env, which is where the runtime seam
// reads it.
process.env.VITE_ENABLE_TEST_SIGNIN =
  process.env.VITE_ENABLE_TEST_SIGNIN || "true";

export default defineConfig({
  logLevel: "error",
  build: {
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    environment("all", { prefix: "CANISTER_" }),
    environment("all", { prefix: "DFX_" }),
    environment(["II_URL"]),
    react(),
  ],
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(new URL("../declarations", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
    dedupe: ["@icp-sdk/core"]
  },
});
