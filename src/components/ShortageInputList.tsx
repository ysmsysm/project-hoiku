"use client";

import { Shirt } from "lucide-react";
import type { LockerItem } from "../types/preparation";
import { ItemRow } from "./ui/ItemRow";
import { ProgressDots } from "./ui/ProgressDots";
import { SectionCard } from "./ui/SectionCard";

type ShortageInputListProps = {
  items: LockerItem[];
  onChange: (itemId: string, shortageCount: number) => void;
};

export function ShortageInputList({ items, onChange }: ShortageInputListProps) {
  const maxRequiredCount = Math.max(
    1,
    ...items.map((item) => item.requiredCount),
  );
  const dotAreaWidthRem =
    maxRequiredCount * 1.5 + Math.max(0, maxRequiredCount - 1) * 0.375;
  const dotAreaWidth = `${dotAreaWidthRem}rem`;
  const actionAreaWidth = `${dotAreaWidthRem + 3}rem`;

  return (
    <SectionCard tone="items" className="p-3">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-avatar bg-surface text-icon-items shadow-card">
          <Shirt size={22} strokeWidth={2.1} />
        </span>
        <h2 className="text-list-item font-bold tracking-normal text-icon-items">
          持ち物
        </h2>
      </div>

      <div className="overflow-hidden rounded-section bg-surface px-5 py-2 shadow-card">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            name={item.name}
            className="grid min-h-[39px] grid-cols-[minmax(0,1fr)_max-content] items-center gap-3 border-b border-divider py-1.5 last:border-b-0"
            contentClassName="flex min-w-0 items-baseline gap-2"
            textClassName="flex min-w-0 items-baseline gap-2"
            nameClassName="truncate text-[15px] font-bold text-text-primary"
            progress={
              <div
                className="grid shrink-0 items-center gap-4"
                style={{
                  gridTemplateColumns: `${dotAreaWidth} 2rem`,
                  width: actionAreaWidth,
                }}
              >
                <ProgressDots
                  total={item.requiredCount}
                  value={item.shortageCount}
                  label={item.name}
                  columns={maxRequiredCount}
                  onChange={(nextCount) => onChange(item.id, nextCount)}
                  className="shrink-0 justify-start"
                />
                <span
                  className={`text-right text-[13px] font-semibold ${
                    item.shortageCount === item.requiredCount
                      ? "text-text-tertiary"
                      : "text-primary"
                  }`}
                >
                  {item.shortageCount}/{item.requiredCount}
                </span>
              </div>
            }
          />
        ))}
      </div>
    </SectionCard>
  );
}
