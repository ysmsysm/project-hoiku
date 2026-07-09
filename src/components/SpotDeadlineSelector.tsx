import { ChevronRight } from "lucide-react";
import { getTomorrowDateKey } from "../lib/deadline";

type SpotDeadlineSelectorProps = {
  itemName: string;
  dueDate: string;
  onChange: (dueDate: string) => void;
  onBack: () => void;
  onAdd: () => void;
};

export function SpotDeadlineSelector({
  itemName,
  dueDate,
  onChange,
  onBack,
  onAdd,
}: SpotDeadlineSelectorProps) {
  const tomorrow = getTomorrowDateKey();

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
        <p className="mt-1 text-status font-normal text-text-secondary">
          期限は任意です。準備完了するまで表示されます。
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onChange(tomorrow)}
          className={`flex h-12 w-full items-center justify-between rounded-section px-4 text-number font-normal ring-1 transition active:scale-[0.99] ${
            dueDate === tomorrow
              ? "bg-primary/15 text-primary ring-primary/30"
              : "bg-surface text-text-primary ring-border-soft"
          }`}
        >
          <span>明日</span>
          <span className="text-status text-text-secondary">{tomorrow}</span>
        </button>

        <label className="block rounded-section bg-surface px-4 py-3 ring-1 ring-border-soft">
          <span className="mb-2 block text-status font-normal text-text-secondary">
            日付指定
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full bg-transparent text-number font-normal text-text-primary outline-none"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="h-11 w-full rounded-button bg-primary text-button font-bold text-surface shadow-button transition active:scale-[0.99]"
      >
        追加
      </button>
    </div>
  );
}
