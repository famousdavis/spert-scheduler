// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "@app/router";
import { ErrorBoundary } from "@ui/components/ErrorBoundary";
import { AuthProvider } from "@ui/providers/AuthProvider";
import { StorageProvider } from "@ui/providers/StorageProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <StorageProvider>
          <RouterProvider router={router} />
        </StorageProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
