import { STANDARD_PERCENTILES } from "@domain/models/types";

interface PercentileTableProps {
  percentiles: Record<number, number>;
  probabilityTarget: number;
}

export function PercentileTable({
  percentiles,
  probabilityTarget,
}: PercentileTableProps) {
  const targetPct = Math.round(probabilityTarget * 100);

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-gray-300">
          <th className="py-2 px-3 text-left font-medium text-gray-600">
            Percentile
          </th>
          <th className="py-2 px-3 text-right font-medium text-gray-600">
            Duration (days)
          </th>
        </tr>
      </thead>
      <tbody>
        {STANDARD_PERCENTILES.map((p) => {
          const isTarget = p === targetPct;
          return (
            <tr
              key={p}
              className={`border-b border-gray-100 ${
                isTarget ? "bg-green-50 font-semibold" : ""
              }`}
            >
              <td className="py-1.5 px-3">
                P{p}
                {isTarget && (
                  <span className="ml-2 text-xs text-green-700">Target</span>
                )}
              </td>
              <td className="py-1.5 px-3 text-right tabular-nums">
                {percentiles[p] != null
                  ? percentiles[p]!.toFixed(1)
                  : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
