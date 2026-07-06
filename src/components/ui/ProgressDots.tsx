"use client";

type ProgressDotsProps = {
  total: number;
  value: number;
  label: string;
  onChange?: (nextValue: number) => void;
  className?: string;
};

export function ProgressDots({
  total,
  value,
  label,
  onChange,
  className = "",
}: ProgressDotsProps) {
  return (
    <div
      className={`flex items-center justify-start gap-1.5 ${className}`}
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
            className={`h-8 w-8 shrink-0 rounded-button border-2 transition active:scale-95 ${
              isChecked
                ? "border-success bg-success"
                : "border-border-soft bg-surface"
            }`}
          />
        );
      })}
    </div>
  );
}
