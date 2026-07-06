"use client";

import type { LockerItem } from "../types/preparation";
import { ItemRow } from "./ui/ItemRow";
import { ProgressDots } from "./ui/ProgressDots";
import { SectionCard } from "./ui/SectionCard";

type ShortageInputListProps = {
  items: LockerItem[];
  onChange: (itemId: string, shortageCount: number) => void;
};

export function ShortageInputList({ items, onChange }: ShortageInputListProps) {
  return (
    <SectionCard tone="items">
      <h2 className="text-card-title font-bold tracking-normal text-text-primary">
        持ち物
      </h2>

      <div className="mt-4 divide-y divide-divider">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            name={item.name}
            quantity={`${item.shortageCount}/${item.requiredCount}`}
            className="grid min-h-[43px] grid-cols-[minmax(0,1fr)_11.5rem] items-center gap-3 py-1.5"
            contentClassName="flex min-w-0 items-baseline gap-2"
            textClassName="flex min-w-0 items-baseline gap-2"
            nameClassName="truncate text-list-item font-semibold text-text-primary"
            quantityClassName={`shrink-0 text-[13px] font-semibold ${
              item.shortageCount === item.requiredCount
                ? "text-success"
                : item.requiredCount - item.shortageCount === 1
                  ? "text-warning"
                  : "text-danger"
            }`}
            progress={
              <ProgressDots
                total={item.requiredCount}
                value={item.shortageCount}
                label={item.name}
                onChange={(nextCount) => onChange(item.id, nextCount)}
                className="w-[11.5rem] shrink-0"
              />
            }
          />
        ))}
      </div>
    </SectionCard>
  );
}
