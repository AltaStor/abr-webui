// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { ServerOptions as HttpsServerOptions } from "node:https";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The AltaStor console is a pure client of the Python
// FastAPI orchestrator. In dev it talks to it same-origin via this proxy, so
// `api.http.ts` can use relative `/api/v1/*` URLs and avoid CORS entirely.
const API_TARGET = process.env.VITE_API_PROXY ?? "https://127.0.0.1";
const apiverText = readFileSync(path.resolve(__dirname, "APIVER"), "utf-8");
const apiverValues = Object.fromEntries(
  apiverText
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => line.split("=").map((part) => part.trim())),
);

// The backend used to sit one directory up, back when this console lived at
// `BR/web/`. It is its own repository now, so the module is looked for instead
// of assumed: an explicit ABR_CORE_ROOT first, then a sibling `abr-core`
// checkout, then the old in-repo layout so a pre-split tree still works.
const CORE_MODULE = path.join("python", "srv", "core", "tls_bootstrap.py");

const CORE_ROOT_CANDIDATES = [
  process.env.ABR_CORE_ROOT,
  path.resolve(__dirname, "..", "abr-core"),
  path.resolve(__dirname, ".."),
].filter((candidate): candidate is string => Boolean(candidate));

function resolveCoreRoot(): string | undefined {
  return CORE_ROOT_CANDIDATES.find((root) => existsSync(path.join(root, CORE_MODULE)));
}

// Reuse the backend's self-signed certificate (python/srv/core/tls_bootstrap.py)
// instead of minting a separate one for the web UI: this generates it on first
// run / renews it when it's close to expiry, exactly like the API server does
// on startup, and prints the resulting cert/key paths.
function resolveDevTls(): HttpsServerOptions | undefined {
  const coreRoot = resolveCoreRoot();
  if (!coreRoot) {
    warnPlainHttp(
      `no AltaStor core checkout containing ${CORE_MODULE} was found (looked in ` +
        `${CORE_ROOT_CANDIDATES.join(", ")}); set ABR_CORE_ROOT to the abr-core checkout`,
    );
    return undefined;
  }

  try {
    const output = execFileSync(
      process.env.PYTHON_BIN ?? "python3",
      ["-m", "python.srv.core.tls_bootstrap"],
      { cwd: coreRoot, encoding: "utf-8" },
    );
    const [certPath, keyPath] = output.trim().split("\n");
    if (!certPath || !keyPath) {
      throw new Error("tls_bootstrap did not print both a cert and a key path");
    }
    return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
  } catch (err) {
    warnPlainHttp(
      `\`python -m python.srv.core.tls_bootstrap\` failed in ${coreRoot}: ` +
        (err instanceof Error ? err.message : String(err)),
    );
    return undefined;
  }
}

/** One loud, self-explaining line — the fallback silently halves the dev setup
 *  (http://, and a browser that then refuses the https API proxy), so it has to
 *  say what went wrong and where it looked. */
function warnPlainHttp(reason: string): void {
  console.warn(
    `[vite] Serving dev/preview over plain HTTP: could not load the backend's ` +
      `self-signed TLS certificate — ${reason}.`,
  );
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
      // orchestrator on 443 (override the target with VITE_API_PROXY; a
      // core that fell back to a high port needs https://127.0.0.1:8443).
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
