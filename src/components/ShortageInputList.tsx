"use client";

import { CheckCircle2, Shirt } from "lucide-react";
import type { LockerItem } from "../types/preparation";
import {
  CardListRow,
  getCardListRowIndicatorWidth,
} from "./ui/CardListRow";
import { ProgressDots } from "./ui/ProgressDots";
import { ReusableCard } from "./ui/ReusableCard";

type ShortageInputListProps = {
  items: LockerItem[];
  onChange: (itemId: string, shortageCount: number) => void;
  disabled?: boolean;
  disabledItemIds?: ReadonlySet<string>;
};

export function ShortageInputList({
  items,
  onChange,
  disabled = false,
  disabledItemIds,
}: ShortageInputListProps) {
  const maxRequiredCount = Math.max(
    1,
    ...items.map((item) => item.requiredCount),
  );
  const indicatorColumnWidth = getCardListRowIndicatorWidth(
    maxRequiredCount + 1,
  );

  return (
    <ReusableCard
      title="持ち物"
      icon={<Shirt size={22} strokeWidth={2.1} />}
      tone="blue"
    >
      {items.map((item) => (
        <CardListRow
          key={item.id}
          left={
            <span className="flex items-center gap-1.5">
              {item.isChecked ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="shrink-0 text-[#3b9de9]"
                  size={16}
                  strokeWidth={2.2}
                />
              ) : null}
              <span>{item.name}</span>
            </span>
          }
          center={
            <ProgressDots
              total={item.requiredCount}
              value={item.shortageCount}
              label={item.name}
              columns={maxRequiredCount}
              onChange={(nextCount) => onChange(item.id, nextCount)}
              disabled={
                disabled ||
                disabledItemIds?.has(item.dailyItemId ?? item.id)
              }
              className="w-full"
            />
          }
          right={`${item.shortageCount}/${item.requiredCount}`}
          indicatorWidth={indicatorColumnWidth}
          statusColor={
            item.isChecked
              ? "text-[#3b9de9]"
              : item.shortageCount === item.requiredCount
              ? "text-text-tertiary"
              : "text-primary"
          }
        />
      ))}
    </ReusableCard>
  );
}
