import { Briefcase } from "lucide-react";
import { useState } from "react";
import type { PreparationItem } from "../types/preparation";
import { getDeadlineDisplay } from "../lib/deadline";
import { getSpotQuantityLabel } from "../lib/spotQuantity";
import { ItemRow } from "./ui/ItemRow";
import { ReusableCard } from "./ui/ReusableCard";

type PreparationChecklistProps = {
  items: PreparationItem[];
  completedAt: string | null;
  onToggle: (itemId: string) => void;
  onCheckAll: () => void;
  onToggleLater: (itemId: string) => void;
  onComplete: () => void;
};

export function PreparationChecklist({
  items,
  completedAt,
  onToggle,
  onCheckAll,
  onToggleLater,
  onComplete,
}: PreparationChecklistProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const isCompleted = Boolean(completedAt);
  const hasIncompleteItems = items.some((item) => !item.checked && !item.later);
  const hasDeferredItems = items.some((item) => item.later && !item.checked);
  const canCompletePreparation = !hasIncompleteItems;
  const isCompleteButtonDisabled = isCompleted || !canCompletePreparation;

  const completePreparation = () => {
    if (isCompleted || !canCompletePreparation) {
      return;
    }

    if (hasDeferredItems) {
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
      <ReusableCard
        title="準備するもの"
        icon={<Briefcase size={22} strokeWidth={2.1} />}
        tone="pink"
        contentClassName="grid min-h-20 place-items-center px-4 py-4"
      >
        <p className="text-number font-normal text-text-secondary">
          追加で準備する持ち物はありません。
        </p>
      </ReusableCard>
    );
  }

  return (
    <ReusableCard
      title="準備するもの"
      icon={<Briefcase size={22} strokeWidth={2.1} />}
      tone="pink"
      contentClassName={`px-4 py-2 transition-colors duration-300 ease-out ${
        isCompleted ? "bg-[#F7F7F7]" : "bg-surface"
      }`}
      action={
        <button
          type="button"
          onClick={onCheckAll}
          className="h-9 shrink-0 rounded-button bg-transparent px-3 text-status font-normal text-danger ring-1 ring-danger/15 transition hover:bg-surface/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          ✓全て
        </button>
      }
    >
      {items.map((item) => {
        const isLater = Boolean(item.later && !item.checked);
        const deadline = getDeadlineDisplay(item.dueDate);
        const quantityText =
          item.source === "spot"
            ? getSpotQuantityLabel(item.count).trim()
            : `${item.count}${item.unit}`;
        const mutedTextClass = isLater
          ? "text-text-tertiary"
          : "text-text-primary";
        const deadlineClassName =
          deadline?.tone === "danger"
            ? "text-danger"
            : deadline?.tone === "coral"
              ? "text-primary"
              : "text-text-secondary";

        return (
          <ItemRow
            key={item.id}
            as="div"
            className="flex min-h-14 w-full items-center justify-between gap-2 border-b border-divider py-2 text-left last:border-b-0"
            contentClassName="flex min-w-[6.5em] flex-1 items-center gap-3"
            textClassName="min-w-0"
            name={
              <span className="block min-w-0">
                <span className="block overflow-hidden text-ellipsis">
                  {item.name}
                </span>
                {deadline ? (
                  <span
                    className={`mt-0.5 block text-[12px] font-normal leading-tight ${deadlineClassName}`}
                  >
                    {deadline.label}
                  </span>
                ) : null}
              </span>
            }
            nameClassName={`block overflow-hidden text-list-item font-medium leading-snug ${mutedTextClass} [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]`}
            icon={
              <button
                type="button"
                onClick={() => {
                  onToggle(item.id);
                }}
                aria-label={`${item.name}をチェック`}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-status font-normal ${
                  item.checked
                    ? "border-danger bg-danger text-surface"
                    : isLater
                      ? "border-divider bg-[#eeeeee] text-transparent"
                      : "border-text-secondary bg-surface text-transparent"
                }`}
              >
                ✓
              </button>
            }
          >
            <div className="flex shrink-0 items-center gap-3">
              <p
                className={`w-[4.75rem] shrink-0 whitespace-nowrap text-left text-number font-normal ${mutedTextClass}`}
              >
                {quantityText}
              </p>
              <button
                type="button"
                onClick={() => onToggleLater(item.id)}
                disabled={item.checked}
                className={`h-8 w-16 shrink-0 whitespace-nowrap rounded-button px-2 text-[13px] font-normal leading-none transition active:scale-95 disabled:pointer-events-none ${
                  isLater
                    ? "bg-warning/45 text-text-primary ring-1 ring-warning/50"
                    : "bg-warning/15 text-text-secondary ring-1 ring-warning/20"
                } ${item.checked ? "opacity-35" : ""}`}
              >
                あとで
              </button>
            </div>
          </ItemRow>
        );
      })}

      <div className="py-4">
        <button
          type="button"
          onClick={completePreparation}
          disabled={isCompleteButtonDisabled}
          className={`h-[52px] w-full rounded-button text-button font-bold transition disabled:pointer-events-none disabled:cursor-not-allowed ${
            isCompleted
              ? "bg-primary/35 text-primary shadow-none"
              : !canCompletePreparation
                ? "bg-primary/45 text-surface/80 shadow-none"
              : "bg-primary text-surface shadow-button hover:bg-primary-hover active:scale-[0.99]"
          }`}
        >
          {isCompleted ? "✓ 準備完了" : "準備完了"}
        </button>
      </div>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-6">
          <div className="w-full max-w-[340px] rounded-card bg-surface p-5 shadow-floating ring-1 ring-border-soft">
            <p className="text-list-item font-medium leading-relaxed text-text-primary">
              あとでがありますが準備完了にしますか？
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
    </ReusableCard>
  );
}
