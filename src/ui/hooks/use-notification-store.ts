import { create } from "zustand";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number; // ms, default 3000
}

export interface NotificationStore {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
}

let notificationId = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = `notification-${++notificationId}`;
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }));

    // Auto-dismiss after duration
    const duration = notification.duration ?? 3000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, duration);
    }
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));

// Helper functions for easy toast creation
export const toast = {
  success: (message: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: "success", message, duration }),
  error: (message: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: "error", message, duration }),
  info: (message: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: "info", message, duration }),
  warning: (message: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: "warning", message, duration }),
};
