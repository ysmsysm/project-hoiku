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
      <SectionCard appearance="current">
        <h2 className="text-xl font-bold tracking-normal text-hoiku-ink">
          持ち物
        </h2>
        <p className="mt-3 text-[15px] font-semibold text-[#7a867e]">
          追加で準備する持ち物はありません。
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard appearance="current">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-normal text-hoiku-ink">
          バッグに入れるもの
        </h2>
        <button
          type="button"
          onClick={onCheckAll}
          className="h-10 shrink-0 rounded-full bg-hoiku-mint px-4 text-[14px] font-bold text-hoiku-deep transition active:scale-95"
        >
          {allChecked ? "チェックを外す" : "一括チェック"}
        </button>
      </div>

      <div className="mt-4 divide-y divide-[#edf3ef]">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            as="button"
            onClick={() => onToggle(item.id)}
            className="flex min-h-[58px] w-full items-center justify-between gap-4 py-3 text-left"
            contentClassName="flex min-w-0 items-center gap-3"
            textClassName="contents"
            name={item.name}
            nameClassName="truncate text-[17px] font-bold text-hoiku-ink"
            icon={
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 text-[15px] font-bold ${
                  item.checked
                    ? "border-hoiku-green bg-hoiku-green text-white"
                    : "border-[#cfdcd4] bg-surface text-transparent"
                }`}
              >
                ✓
              </span>
            }
          >
            <p className="shrink-0 text-[16px] font-bold text-[#607066]">
              {item.count}{item.unit}
            </p>
          </ItemRow>
        ))}
      </div>
    </SectionCard>
  );
}
