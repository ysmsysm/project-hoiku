import { Briefcase } from "lucide-react";
import type { PreparationItem } from "../types/preparation";
import { ItemRow } from "./ui/ItemRow";
import { SectionCard } from "./ui/SectionCard";

type PreparationChecklistProps = {
  items: PreparationItem[];
  onToggle: (itemId: string) => void;
  onCheckAll: () => void;
};

export function PreparationChecklist({
  items,
  onToggle,
  onCheckAll,
}: PreparationChecklistProps) {
  const allChecked = items.length > 0 && items.every((item) => item.checked);

  if (items.length === 0) {
    return (
      <SectionCard tone="today" className="p-3">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-avatar bg-surface text-icon-today shadow-card">
            <Briefcase size={22} strokeWidth={2.1} />
          </span>
          <h2 className="text-list-item font-bold tracking-normal text-text-primary">
            バッグに入れるもの
          </h2>
        </div>
        <div className="rounded-section bg-surface px-5 py-5 shadow-card">
          <p className="text-status font-semibold text-text-secondary">
            追加で準備する持ち物はありません。
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard tone="today" className="p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-avatar bg-surface text-icon-today shadow-card">
            <Briefcase size={22} strokeWidth={2.1} />
          </span>
          <h2 className="truncate text-list-item font-bold tracking-normal text-text-primary">
            バッグに入れるもの
          </h2>
        </div>
        <button
          type="button"
          onClick={onCheckAll}
          className="h-10 shrink-0 rounded-button bg-surface px-5 text-status font-bold text-danger ring-1 ring-danger/30 transition active:scale-95"
        >
          {allChecked ? "チェックを外す" : "一括チェック"}
        </button>
      </div>

      <div className="overflow-hidden rounded-section bg-surface px-5 py-3 shadow-card">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            as="button"
            onClick={() => onToggle(item.id)}
            className="flex min-h-[50px] w-full items-center justify-between gap-4 border-b border-divider py-2 text-left last:border-b-0"
            contentClassName="flex min-w-0 items-center gap-3"
            textClassName="contents"
            name={item.name}
            nameClassName="truncate text-list-item font-bold text-text-primary"
            icon={
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-[13px] font-bold ${
                  item.checked
                    ? "border-danger bg-danger text-surface"
                    : "border-text-secondary bg-surface text-transparent"
                }`}
              >
                ✓
              </span>
            }
          >
            <p className="shrink-0 text-number font-bold text-text-primary">
              {item.count}{item.unit}
            </p>
          </ItemRow>
        ))}
      </div>
    </SectionCard>
  );
}
