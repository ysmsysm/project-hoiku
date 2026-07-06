"use client";

type ProgressDotsProps = {
  total: number;
  value: number;
  label: string;
  columns?: number;
  onChange?: (nextValue: number) => void;
  className?: string;
};

export function ProgressDots({
  total,
  value,
  label,
  columns = total,
  onChange,
  className = "",
}: ProgressDotsProps) {
  const columnCount = Math.max(total, columns);

  return (
    <div
      className={`grid justify-start gap-1.5 ${className}`}
      style={{
        gridTemplateColumns: `repeat(${columnCount}, 1.5rem)`,
      }}
      aria-label={`${label} ${value} / ${total}`}
    >
      {Array.from({ length: total }).map((_, index) => {
        const isChecked = index < value;
        const nextValue = value === index + 1 ? index : index + 1;

        return (
          <button
            key={index}
            type="button"
            aria-label={`${label} ${index + 1}個目`}
            onClick={() => onChange?.(nextValue)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-button transition active:scale-95"
          >
            <span
              className={`h-4 w-4 rounded-button border-2 ${
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
