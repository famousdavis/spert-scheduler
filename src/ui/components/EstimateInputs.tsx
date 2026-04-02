// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type React from "react";

interface EstimateField {
  dataField: string;
  activityKey: string;
  defaultValue: number;
  error?: string;
  title: string;
}

interface EstimateInputsProps {
  activityId: string;
  fields: EstimateField[];
  onBlur: (field: string, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, field: string) => void;
  disabled?: boolean;
}

const INPUT_CLASS_BASE =
  "w-full px-1 py-1 border rounded text-sm tabular-nums text-right dark:bg-gray-700 dark:text-gray-100 focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

const INPUT_CLASS_ERROR = "border-red-400 bg-red-50 dark:bg-red-900/30";
const INPUT_CLASS_NORMAL = "border-gray-200 dark:border-gray-600";

export function EstimateInputs({
  activityId,
  fields,
  onBlur,
  onKeyDown,
  disabled,
}: EstimateInputsProps) {
  return (
    <>
      {fields.map((f) => (
        <div key={f.dataField}>
          <input
            data-row-id={activityId}
            data-field={f.dataField}
            type="number"
            defaultValue={Math.round(f.defaultValue)}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              const rounded = Math.round(parseFloat(e.target.value));
              if (!isNaN(rounded)) e.target.value = String(rounded);
              onBlur(f.activityKey, e.target.value);
            }}
            onKeyDown={(e) => onKeyDown(e, f.dataField)}
            disabled={disabled}
            className={`${INPUT_CLASS_BASE} ${f.error ? INPUT_CLASS_ERROR : INPUT_CLASS_NORMAL}`}
            step="1"
            min="0"
            title={f.error ?? f.title}
          />
        </div>
      ))}
    </>
  );
}
