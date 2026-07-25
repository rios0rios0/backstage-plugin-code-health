/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Everything a Backstage app already provides is kept out of the bundle. */
const EXTERNAL = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^react\/jsx-runtime$/,
  /^react-router-dom($|\/)/,
  /^@backstage\//,
  /^@material-ui\//,
  /^@tanstack\//,
];

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: EXTERNAL,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    reporters: ["default", "junit"],
    outputFile: {
      junit: "junit-report.xml",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Type-only files (interfaces, type aliases, no executable code)
        "src/**/*.d.ts",
        "src/domain/entities/repository.ts",
        "src/domain/entities/contributor.ts",
        "src/domain/entities/release.ts",
        "src/domain/entities/tag.ts",
        "src/domain/entities/workflow_status.ts",
        "src/domain/entities/sonar_metrics.ts",
        "src/domain/repositories/**",
        "src/domain/services/**",
        "src/service/mappers/*_node.ts",
        // Public surface: re-exports and Backstage extension/DI wiring, exercised
        // once the plugin is mounted in a real app
        "src/index.ts",
        "src/plugin.ts",
        "src/routes.ts",
        "src/main/api_refs.ts",
        "src/main/apis.ts",
        // Root orchestrator; needs a full Backstage app context (router, theme, config)
        "src/main/router.tsx",
        // Uses IndexedDB (unavailable in jsdom); 46 lines with in-memory fallback
        "src/infrastructure/crypto/crypto_key_store.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 77,
        statements: 90,
      },
    },
  },
});
