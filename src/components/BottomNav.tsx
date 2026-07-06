"use client";

import { Briefcase, CheckCircle2, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppTab } from "../types/preparation";

type BottomNavProps = {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
};

const tabs: Array<{
  id: AppTab;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: "check", label: "確認", Icon: CheckCircle2 },
  { id: "items", label: "持ち物", Icon: Briefcase },
  { id: "settings", label: "設定", Icon: Settings },
];

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
      <div className="grid grid-cols-3 gap-1 rounded-card bg-surface p-2 text-center text-[12px] font-bold shadow-card ring-1 ring-border-soft">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-tab transition active:scale-95 ${
                isActive
                  ? "bg-tab-active text-danger"
                  : "text-tab-inactive"
              }`}
            >
              <Icon size={18} strokeWidth={2.3} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
