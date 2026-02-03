import type { NotificationType } from "@ui/hooks/use-notification-store";

interface ToastProps {
  type: NotificationType;
  message: string;
  onDismiss: () => void;
}

const TYPE_STYLES: Record<NotificationType, string> = {
  success:
    "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200",
  error:
    "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200",
  info:
    "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200",
  warning:
    "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200",
};

const TYPE_ICONS: Record<NotificationType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

export function Toast({ type, message, onDismiss }: ToastProps) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border rounded-lg shadow-lg max-w-sm animate-slide-in ${TYPE_STYLES[type]}`}
      role="alert"
      aria-live="polite"
    >
      <span className="text-lg leading-none flex-shrink-0">{TYPE_ICONS[type]}</span>
      <p className="text-sm flex-1">{message}</p>
      <button
        onClick={onDismiss}
        className="text-current opacity-60 hover:opacity-100 text-lg leading-none flex-shrink-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
