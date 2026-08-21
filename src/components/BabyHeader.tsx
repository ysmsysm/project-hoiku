import type { ReactNode } from "react";
import { BabyAvatar } from "./BabyAvatar";

type BabyHeaderProps = {
  childName: string;
  rightContent?: ReactNode;
  rightFooterContent?: ReactNode;
};

export function BabyHeader({
  childName,
  rightContent,
  rightFooterContent,
}: BabyHeaderProps) {
  const nameLength = Array.from(childName).length;
  const childNameFontSize =
    nameLength <= 4 ? 24 : nameLength <= 6 ? 18 : nameLength <= 7 ? 16 : 14;

  return (
    <header className="mb-4 w-full rounded-card bg-surface p-4 shadow-card ring-1 ring-border-soft">
      <p className="sr-only">Project Hoiku</p>
      <div className="grid grid-cols-1 items-start gap-3 min-[400px]:grid-cols-[minmax(0,10.75rem)_1px_minmax(0,1fr)]">
        <div className="grid h-16 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3">
          <BabyAvatar />
          <div className="min-w-0">
            <h1
              className="whitespace-nowrap font-bold leading-none tracking-normal text-text-primary"
              style={{ fontSize: `${childNameFontSize}px` }}
              title={childName}
            >
              {childName}
            </h1>
          </div>
        </div>
        <div
          className={`h-px w-full shrink-0 min-[400px]:h-auto min-[400px]:min-h-16 min-[400px]:w-px min-[400px]:self-stretch ${
            rightContent || rightFooterContent ? "bg-divider" : "bg-transparent"
          }`}
        />
        <div className="min-w-0 text-status font-normal text-text-primary">
          <div className="flex min-h-16 min-w-0 flex-col justify-center gap-1.5">
            {rightContent}
          </div>
          {rightFooterContent ? (
            <div className="mt-2 flex justify-center">{rightFooterContent}</div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
