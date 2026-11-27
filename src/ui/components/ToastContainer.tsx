// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { createPortal } from "react-dom";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { Toast } from "./Toast";

export function ToastContainer() {
  const { notifications, removeNotification } = useNotificationStore();

  // One live region, always present (FRAME26 H2, v0.90.0): the container is rendered, empty, from the first paint,
  // so a screen reader is already watching it when a message is inserted, and each toast is spoken once, alone
  // (`aria-atomic="false"`). It is the only role: a toast carries none of its own. Empty, it has no size.
  //
  // `no-print`: a `fixed` element repeats on every printed page, so a toast still on
  // screen when the user prints landed on every page of the report. The class works
  // because the portal target is <body>, outside #root: the print stylesheet's
  // ancestor rules are ID selectors with !important, and they outrank `.no-print` for
  // anything they match.
  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 no-print"
      role="status"
      aria-atomic="false"
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
