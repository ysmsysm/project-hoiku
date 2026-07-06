"use client";

import type { LockerItem } from "../types/preparation";
import { ItemRow } from "./ui/ItemRow";
import { SectionCard } from "./ui/SectionCard";

type ShortageInputListProps = {
  items: LockerItem[];
  onChange: (itemId: string, shortageCount: number) => void;
};

export function ShortageInputList({ items, onChange }: ShortageInputListProps) {
  return (
    <SectionCard appearance="current">
      <h2 className="text-xl font-bold tracking-normal text-hoiku-ink">
        持ち物
      </h2>

      <div className="mt-4 divide-y divide-[#edf3ef]">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            name={item.name}
            quantity={`${item.shortageCount}/${item.requiredCount}`}
            className="grid min-h-[43px] grid-cols-[minmax(0,1fr)_11.5rem] items-center gap-3 py-1.5"
            contentClassName="flex min-w-0 items-baseline gap-2"
            textClassName="flex min-w-0 items-baseline gap-2"
            nameClassName="truncate text-[17px] font-semibold text-[#1f1f1f]"
            quantityClassName={`shrink-0 text-[13px] font-semibold ${
              item.shortageCount === item.requiredCount
                ? "text-hoiku-green"
                : item.requiredCount - item.shortageCount === 1
                  ? "text-[#d98128]"
                  : "text-[#d85b4a]"
            }`}
            progress={
              <div
                className="flex w-[11.5rem] shrink-0 items-center justify-start gap-1.5"
                aria-label={`${item.name} ${item.shortageCount} / ${item.requiredCount}`}
              >
                {Array.from({ length: item.requiredCount }).map((_, index) => {
                  const isChecked = index < item.shortageCount;
                  const nextCount =
                    item.shortageCount === index + 1 ? index : index + 1;

                  return (
                    <button
                      key={index}
                      type="button"
                      aria-label={`${item.name} ${index + 1}個目`}
                      onClick={() => onChange(item.id, nextCount)}
                      className={`h-8 w-8 shrink-0 rounded-full border-2 transition active:scale-95 ${
                        isChecked
                          ? "border-hoiku-green bg-hoiku-green"
                          : "border-[#cfdcd4] bg-surface"
                      }`}
                    />
                  );
                })}
              </div>
            }
          />
        ))}
      </div>
    </SectionCard>
  );
}
