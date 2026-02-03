import { useRef, useState, useCallback } from "react";
import { exportChartAsPng } from "@ui/helpers/export-chart";
import { toast } from "@ui/hooks/use-notification-store";

/**
 * Hook to handle chart PNG export with loading state and toast notifications.
 * Eliminates duplicated export logic across chart components.
 *
 * @param filename - Base filename for the exported PNG (without extension)
 * @returns Object with ref to attach to chart container, export handler, and loading state
 *
 * @example
 * ```tsx
 * const { chartRef, handleExport, isExporting } = useChartExport("my-chart");
 * return (
 *   <div ref={chartRef}>
 *     <button onClick={handleExport} disabled={isExporting}>Export</button>
 *     <Chart />
 *   </div>
 * );
 * ```
 */
export function useChartExport(filename: string) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!chartRef.current || isExporting) return;

    setIsExporting(true);
    try {
      await exportChartAsPng(chartRef.current, filename);
      toast.success("Chart exported");
    } catch {
      toast.error("Failed to export chart");
    } finally {
      setIsExporting(false);
    }
  }, [filename, isExporting]);

  return { chartRef, handleExport, isExporting };
}
