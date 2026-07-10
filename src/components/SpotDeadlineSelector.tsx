import { ChevronRight } from "lucide-react";
import { getTomorrowDateKey } from "../lib/deadline";

type SpotDeadlineSelectorProps = {
  itemName: string;
  dueDate: string;
  onChange: (dueDate: string) => void;
  onBack: () => void;
  onAdd: () => void;
  onClear?: () => void;
  actionLabel?: string;
};

export function SpotDeadlineSelector({
  itemName,
  dueDate,
  onChange,
  onBack,
  onAdd,
  onClear,
  actionLabel = "追加",
}: SpotDeadlineSelectorProps) {
  const tomorrow = getTomorrowDateKey();
  const isTomorrow = dueDate === tomorrow;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-number font-normal text-text-secondary"
      >
        <ChevronRight
          size={18}
          strokeWidth={2.2}
          className="rotate-180 text-text-tertiary"
        />
        戻る
      </button>

      <div className="rounded-section bg-card-today p-4 ring-1 ring-border-soft">
        <p className="truncate text-list-item font-medium text-text-primary">
          {itemName}
        </p>
      </div>

      <div className="rounded-section bg-surface px-4 py-3 ring-1 ring-border-soft">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-status font-normal text-text-secondary">期限</span>
          {isTomorrow ? (
            <span className="rounded-button bg-primary/15 px-3 py-1 text-status font-normal text-primary">
              明日
            </span>
          ) : null}
        </div>
        <label className="block">
          <input
            type="date"
            value={dueDate}
            onChange={(event) => onChange(event.target.value)}
            className="h-12 w-full bg-transparent text-list-item font-medium text-text-primary outline-none"
          />
        </label>
      </div>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="h-11 w-full rounded-button bg-card-today text-number font-normal text-text-secondary ring-1 ring-border-soft transition active:scale-95"
        >
          期限を解除
        </button>
      ) : null}

      <button
        type="button"
        onClick={onAdd}
        className="h-11 w-full rounded-button bg-primary text-button font-bold text-surface shadow-button transition active:scale-[0.99]"
      >
        {actionLabel}
      </button>
    </div>
  );
}
