// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { createPortal } from "react-dom";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { Toast } from "./Toast";

export function ToastContainer() {
  const { notifications, removeNotification } = useNotificationStore();

  if (notifications.length === 0) return null;

  // `no-print`: a `fixed` element repeats on every printed page, so a toast still on
  // screen when the user prints landed on every page of the report. The class works
  // because the portal target is <body>, outside #root: the print stylesheet's
  // ancestor rules are ID selectors with !important, and they outrank `.no-print` for
  // anything they match.
  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 no-print"
      aria-label="Notifications"
    >
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          type={notification.type}
          message={notification.message}
          onDismiss={() => removeNotification(notification.id)}
        />
      ))}
    </div>,
    document.body
  );
}
