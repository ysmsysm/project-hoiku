"use client";

import { Shirt } from "lucide-react";
import type { LockerItem } from "../types/preparation";
import { CardListRow } from "./ui/CardListRow";
import { ProgressDots } from "./ui/ProgressDots";
import { ReusableCard } from "./ui/ReusableCard";

type ShortageInputListProps = {
  items: LockerItem[];
  onChange: (itemId: string, shortageCount: number) => void;
};

export function ShortageInputList({ items, onChange }: ShortageInputListProps) {
  const maxRequiredCount = Math.max(
    1,
    ...items.map((item) => item.requiredCount),
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
          left={item.name}
          center={
            <ProgressDots
              total={item.requiredCount}
              value={item.shortageCount}
              label={item.name}
              columns={maxRequiredCount}
              onChange={(nextCount) => onChange(item.id, nextCount)}
              className="w-36"
            />
          }
          right={`${item.shortageCount}/${item.requiredCount}`}
          statusColor={
            item.shortageCount === item.requiredCount
              ? "text-text-tertiary"
              : "text-primary"
          }
        />
      ))}
    </ReusableCard>
  );
}
