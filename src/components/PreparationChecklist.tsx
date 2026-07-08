import { Briefcase } from "lucide-react";
import { useState } from "react";
import type { PreparationItem } from "../types/preparation";
import { ItemRow } from "./ui/ItemRow";
import { SectionCard } from "./ui/SectionCard";

type PreparationChecklistProps = {
  items: PreparationItem[];
  onToggle: (itemId: string) => void;
  onCheckAll: () => void;
  onToggleLater: (itemId: string) => void;
  onComplete: () => void;
};

export function PreparationChecklist({
  items,
  onToggle,
  onCheckAll,
  onToggleLater,
  onComplete,
}: PreparationChecklistProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const allChecked = items.length > 0 && items.every((item) => item.checked);
  const laterCount = items.filter((item) => item.later && !item.checked).length;

  const completePreparation = () => {
    if (laterCount > 0) {
      setIsConfirmOpen(true);
      return;
    }

    onComplete();
  };

  const confirmCompletion = () => {
    setIsConfirmOpen(false);
    onComplete();
  };

  if (items.length === 0) {
    return (
      <SectionCard tone="today" className="p-3">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-avatar bg-surface text-icon-today shadow-card">
            <Briefcase size={22} strokeWidth={2.1} />
          </span>
          <h2 className="text-card-title font-semibold tracking-normal text-text-primary">
            準備するもの
          </h2>
        </div>
        <div className="rounded-section bg-surface px-5 py-5 shadow-card">
          <p className="text-number font-normal text-text-secondary">
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
          <h2 className="truncate text-card-title font-semibold tracking-normal text-text-primary">
            準備するもの
          </h2>
        </div>
        <button
          type="button"
          onClick={onCheckAll}
          className="h-10 shrink-0 rounded-button bg-surface px-5 text-number font-normal text-danger ring-1 ring-danger/30 transition active:scale-95"
        >
          {allChecked ? "チェックを外す" : "一括チェック"}
        </button>
      </div>

      <div className="overflow-hidden rounded-section bg-surface px-5 py-3 shadow-card">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            as="div"
            className="flex min-h-[50px] w-full items-center justify-between gap-4 border-b border-divider py-2 text-left last:border-b-0"
            contentClassName="flex min-w-0 items-center gap-3"
            textClassName="contents"
            name={item.name}
            nameClassName="truncate text-list-item font-medium text-text-primary"
            icon={
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                aria-label={`${item.name}をチェック`}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-status font-normal ${
                  item.checked
                    ? "border-danger bg-danger text-surface"
                    : "border-text-secondary bg-surface text-transparent"
                }`}
              >
                ✓
              </button>
            }
          >
            <div className="flex shrink-0 items-center gap-3">
              <p className="w-12 shrink-0 text-right text-number font-normal text-text-primary">
                {item.count}{item.unit}
              </p>
              <button
                type="button"
                onClick={() => onToggleLater(item.id)}
                disabled={item.checked}
                className={`h-8 w-16 shrink-0 rounded-button text-status font-normal transition active:scale-95 disabled:pointer-events-none ${
                  item.later && !item.checked
                    ? "bg-warning/35 text-text-primary ring-1 ring-warning/40"
                    : "bg-warning/15 text-text-secondary ring-1 ring-warning/20"
                } ${item.checked ? "opacity-35" : ""}`}
              >
                あとで
              </button>
            </div>
          </ItemRow>
        ))}
      </div>

      <button
        type="button"
        onClick={completePreparation}
        className="mt-4 h-[52px] w-full rounded-button bg-primary text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99]"
      >
        準備完了
      </button>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-6">
          <div className="w-full max-w-[340px] rounded-card bg-surface p-5 shadow-floating ring-1 ring-border-soft">
            <p className="text-list-item font-medium leading-relaxed text-text-primary">
              『あとで』の持ち物がありますが、準備完了にしますか？
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="h-11 rounded-button bg-card-today text-number font-normal text-text-secondary ring-1 ring-border-soft transition active:scale-95"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmCompletion}
                className="h-11 rounded-button bg-primary text-number font-normal text-surface shadow-button transition active:scale-95"
              >
                準備完了
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
