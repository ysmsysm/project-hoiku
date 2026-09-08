"use client";

import { useEffect, useState } from "react";
import {
  loadSharedSettingsPreview,
  type SharedSettingsPreviewItem,
} from "../src/lib/family-sharing/shared-settings-preview-cache";

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

const getPreviewItemDetail = (item: SharedSettingsPreviewItem) => {
  const quantity = `設定 ${item.count}${item.unit}`;
  if (item.category === "スポット追加" && item.weekdays.length > 0) {
    return `${item.weekdays.map((weekday) => weekdayLabels[weekday]).join("・")} / ${quantity}`;
  }
  if (item.category === "ざっくり管理" && item.roughState) {
    return `${item.roughState} / ${quantity}`;
  }
  return quantity;
};

export default function HomeLoading() {
  const [preview, setPreview] = useState<
    ReturnType<typeof loadSharedSettingsPreview>
  >(null);

  useEffect(() => {
    setPreview(loadSharedSettingsPreview());
  }, []);

  const previewItems = preview?.items.slice(0, 6) ?? null;

  return (
    <main
      aria-busy="true"
      className="pointer-events-none min-h-dvh select-none bg-[#FFFBF2] text-hoiku-ink"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-[calc(98px_+_env(safe-area-inset-bottom))] pt-5">
        <header className="mb-4 w-full rounded-card bg-surface p-4 shadow-card ring-1 ring-border-soft">
          <div className="grid grid-cols-1 items-start gap-3 min-[400px]:grid-cols-[minmax(0,10.75rem)_1px_minmax(0,1fr)]">
            <div className="grid h-16 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3">
              <div className="h-12 w-12 rounded-avatar bg-[#e9e8e4]" />
              <div className="space-y-2">
                {preview ? (
                  <p className="truncate text-[22px] font-bold text-text-primary">
                    {preview.childName}
                  </p>
                ) : (
                  <div className="h-5 w-24 max-w-full rounded-full bg-[#e9e8e4]" />
                )}
                <div className="h-3 w-16 rounded-full bg-[#f0efec]" />
              </div>
            </div>
            <div className="h-px w-full bg-divider min-[400px]:h-auto min-[400px]:min-h-16 min-[400px]:w-px min-[400px]:self-stretch" />
            <div className="flex min-h-16 min-w-0 flex-col justify-center gap-2 text-[13px] text-text-tertiary">
              {[
                { label: "確認", badgeWidth: "w-10" },
                { label: "準備", badgeWidth: "w-12" },
              ].map(({ label, badgeWidth }) => (
                <div
                  key={label}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <div className="h-4 w-4 shrink-0 rounded-full bg-[#e5e4e0]" />
                  <span className="shrink-0">{label}</span>
                  <div
                    className={`h-5 shrink-0 rounded-full bg-[#ecebe7] ${badgeWidth}`}
                  />
                  <div className="ml-auto h-3 w-16 min-w-0 rounded-full bg-[#ecebe7]" />
                </div>
              ))}
            </div>
          </div>
        </header>

        <p className="mb-3 text-center text-[13px] text-text-tertiary">
          {preview
            ? "最新の確認状況を読み込んでいます"
            : "今日の持ち物を確認しています"}
        </p>

        <section className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-border-soft">
          <div className="flex h-14 items-center gap-3 border-b border-divider px-5">
            <div className="h-8 w-8 rounded-full bg-[#e7e6e2]" />
            <span className="text-card-title font-semibold text-text-tertiary">
              {preview ? "持ち物設定" : "持ち物"}
            </span>
          </div>
          <div className="divide-y divide-divider px-5">
            {previewItems ? (
              previewItems.length > 0 ? (
                previewItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex min-h-[58px] items-center gap-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-number font-medium text-text-primary">
                      {item.name}
                    </span>
                    <span className="max-w-[48%] shrink-0 text-right text-caption leading-tight text-text-secondary">
                      {getPreviewItemDetail(item)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-5 text-center text-status text-text-tertiary">
                  設定済みの持ち物はありません
                </p>
              )
            ) : (
              ["item-1", "item-2", "item-3", "item-4"].map((item) => (
                <div key={item} className="flex h-[68px] items-center gap-3">
                  <div className="h-4 min-w-0 flex-1 rounded-full bg-[#ecebe7]" />
                  <div className="flex shrink-0 gap-2">
                    <div className="h-7 w-7 rounded-full bg-[#e5e4e0]" />
                    <div className="h-7 w-7 rounded-full bg-[#e5e4e0]" />
                    <div className="h-7 w-7 rounded-full bg-[#e5e4e0]" />
                  </div>
                  <div className="h-4 w-9 shrink-0 rounded-full bg-[#ecebe7]" />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-border-soft">
          <div className="flex h-14 items-center gap-3 border-b border-divider px-5">
            <div className="h-8 w-8 rounded-full bg-[#e7e6e2]" />
            <span className="text-card-title font-semibold text-text-tertiary">
              準備
            </span>
          </div>
          <div className="p-3">
            <div className="h-12 rounded-button bg-[#ecebe7]" />
          </div>
        </section>
      </div>

      <nav
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2"
      >
        <div className="grid grid-cols-3 gap-1 rounded-card bg-surface p-2 shadow-card ring-1 ring-border-soft">
          {["確認", "持ち物", "設定"].map((label) => (
            <div
              key={label}
              className="flex h-12 flex-col items-center justify-center gap-1 text-[12px] font-bold text-text-tertiary"
            >
              <div className="h-[18px] w-[18px] rounded-full bg-[#e5e4e0]" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </nav>
    </main>
  );
}
