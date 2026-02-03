interface ExportButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

/**
 * Reusable export/download button with consistent styling.
 * Used for chart PNG export and other download actions.
 */
export function ExportButton({
  onClick,
  disabled = false,
  title = "Export as PNG",
  className = "absolute top-0 right-0 z-10",
}: ExportButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${className} p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50`}
      title={title}
      aria-label={title}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
    </button>
  );
}
