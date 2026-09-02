// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@/styles/globals.css";
// Side-effect import: initialises i18next (with the persisted language) before
// the first render, so the UI never flashes English on a non-English console.
import "@/i18n";
import { Providers } from "@/app/providers";
import { router } from "@/app/router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </Providers>
  </StrictMode>,
);
