"use client";

import type { CSSProperties } from "react";

type ProgressDotsProps = {
  total: number;
  value: number;
  label: string;
  columns?: number;
  onChange?: (nextValue: number) => void;
  className?: string;
  style?: CSSProperties;
};

export function ProgressDots({
  total,
  value,
  label,
  columns = total,
  onChange,
  className = "",
  style,
}: ProgressDotsProps) {
  const columnCount = Math.max(total, columns) + 1;

  return (
    <div
      className={`grid items-center ${className}`}
      style={{
        ...style,
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      }}
      aria-label={`${label} ${value} / ${total}`}
    >
      <button
        type="button"
        data-testid="progress-zero-button"
        aria-label={`${label} 0個に設定`}
        onClick={() => onChange?.(0)}
        className="grid h-11 w-11 shrink-0 place-items-center justify-self-center rounded-button transition active:scale-95"
      >
        <span className="grid h-5 w-5 place-items-center rounded-button border border-divider bg-[#f7f7f7] text-[11px] font-bold leading-none text-text-tertiary">
          0
        </span>
      </button>
      {Array.from({ length: total }).map((_, index) => {
        const isChecked = index < value;
        const nextValue = index + 1;

        return (
          <button
            key={index}
            type="button"
            aria-label={`${label} ${index + 1}個目`}
            onClick={() => onChange?.(nextValue)}
            className="grid h-11 w-11 shrink-0 place-items-center justify-self-center rounded-button transition active:scale-95"
          >
            <span
              className={`h-5 w-5 rounded-button border-2 ${
                isChecked
                  ? "border-icon-items bg-icon-items"
                  : "border-text-tertiary bg-surface"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
