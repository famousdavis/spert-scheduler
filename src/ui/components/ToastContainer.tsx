import { createPortal } from "react-dom";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { Toast } from "./Toast";

export function ToastContainer() {
  const { notifications, removeNotification } = useNotificationStore();

  if (notifications.length === 0) return null;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2"
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
