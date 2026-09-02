// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ServerOptions as HttpsServerOptions } from "node:https";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The AltaStor console is a pure client of the Python
// FastAPI orchestrator. In dev it talks to it same-origin via this proxy, so
// `api.http.ts` can use relative `/api/v1/*` URLs and avoid CORS entirely.
const API_TARGET = process.env.VITE_API_PROXY ?? "https://127.0.0.1:8443";
const apiverText = readFileSync(path.resolve(__dirname, "APIVER"), "utf-8");
const apiverValues = Object.fromEntries(
  apiverText
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => line.split("=").map((part) => part.trim())),
);

const REPO_ROOT = path.resolve(__dirname, "..");

// Reuse the backend's self-signed certificate (python/srv/core/tls_bootstrap.py)
// instead of minting a separate one for the web UI: this generates it on first
// run / renews it when it's close to expiry, exactly like the API server does
// on startup, and prints the resulting cert/key paths.
function resolveDevTls(): HttpsServerOptions | undefined {
  try {
    const output = execFileSync(
      process.env.PYTHON_BIN ?? "python3",
      ["-m", "python.srv.core.tls_bootstrap"],
      { cwd: REPO_ROOT, encoding: "utf-8" },
    );
    const [certPath, keyPath] = output.trim().split("\n");
    if (!certPath || !keyPath) {
      throw new Error("tls_bootstrap did not print both a cert and a key path");
    }
    return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
  } catch (err) {
    console.warn(
      "[vite] Could not generate/load the backend's self-signed TLS certificate via " +
        "`python -m python.srv.core.tls_bootstrap`; serving dev/preview over plain HTTP instead.",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

export default defineConfig(({ command }) => {
  // Only dev (`vite`) and preview (`vite preview`) run a server; `vite build`
  // has no use for a certificate and shouldn't need Python available to run.
  const https = command === "serve" ? resolveDevTls() : undefined;

  return {
    plugins: [react()],
    define: {
      __ABR_API_MAJOR__: JSON.stringify(Number(apiverValues.ABR_API_MAJOR)),
      __ABR_API_MINOR__: JSON.stringify(Number(apiverValues.ABR_API_MINOR)),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // Bind to 0.0.0.0 so the dev server is reachable from other devices on the LAN.
      host: true,
      // Project convention: dev server on 3000, proxying the API to the
      // orchestrator on 8443 (override the target with VITE_API_PROXY).
      port: process.env.PORT ? Number(process.env.PORT) : 3000,
      strictPort: false,
      https,
      proxy: {
        "/api": {
          target: API_TARGET,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: true,
      port: process.env.PORT ? Number(process.env.PORT) : 3000,
      strictPort: false,
      https,
      proxy: {
        "/api": {
          target: API_TARGET,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router-dom"],
            charts: ["recharts"],
            motion: ["framer-motion"],
            query: ["@tanstack/react-query", "@tanstack/react-table"],
          },
        },
      },
    },
  };
});
