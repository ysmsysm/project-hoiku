import type { ReactNode } from "react";
import { BabyAvatar } from "./BabyAvatar";

type BabyHeaderProps = {
  childName: string;
  rightContent?: ReactNode;
};

export function BabyHeader({ childName, rightContent }: BabyHeaderProps) {
  const nameLength = Array.from(childName).length;
  const childNameFontSize =
    nameLength <= 4 ? 24 : nameLength <= 7 ? 18 : nameLength <= 10 ? 16 : 14;

  return (
    <header className="mb-4 w-full rounded-card bg-surface p-4 shadow-card ring-1 ring-border-soft">
      <p className="sr-only">Project Hoiku</p>
      <div className="grid grid-cols-[minmax(0,11rem)_1px_minmax(0,1fr)] items-center gap-4">
        <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-4">
          <BabyAvatar />
          <div className="min-w-0">
            <h1
              className="overflow-hidden text-ellipsis whitespace-nowrap font-bold leading-none tracking-normal text-text-primary"
              style={{ fontSize: `${childNameFontSize}px` }}
              title={childName}
            >
              {childName}
            </h1>
          </div>
        </div>
        <div
          className={`h-16 w-px shrink-0 ${
            rightContent ? "bg-divider" : "bg-transparent"
          }`}
        />
        <div className="flex min-h-16 min-w-0 flex-col justify-center gap-2 text-status font-normal text-text-primary">
          {rightContent}
        </div>
      </div>
    </header>
  );
}
