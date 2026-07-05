"use client";

import { CheckCircle2, Settings, Shirt } from "lucide-react";
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
  { id: "items", label: "持ち物", Icon: Shirt },
  { id: "settings", label: "設定", Icon: Settings },
];

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-[#edf3ef] bg-white/95 px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <div className="grid grid-cols-3 gap-1 text-center text-[12px] font-bold">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-2xl transition active:scale-95 ${
                isActive
                  ? "bg-hoiku-mint text-hoiku-deep"
                  : "text-[#9aa49e]"
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
