import type { ReactNode } from "react";

type ReusableCardTone = "blue" | "pink" | "green";

type ReusableCardProps = {
  title: string;
  icon: ReactNode;
  tone: ReusableCardTone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
};

const toneClasses: Record<
  ReusableCardTone,
  {
    header: string;
    border: string;
    icon: string;
    title: string;
  }
> = {
  blue: {
    header: "bg-card-items",
    border: "border-icon-items/20",
    icon: "text-icon-items",
    title: "text-icon-items",
  },
  pink: {
    header: "bg-card-today",
    border: "border-icon-today/20",
    icon: "text-icon-today",
    title: "text-icon-today",
  },
  green: {
    header: "bg-card-stock",
    border: "border-icon-stock/20",
    icon: "text-icon-stock",
    title: "text-icon-stock",
  },
};

const reusableCardShellClassName =
  "overflow-hidden rounded-panel border bg-surface shadow-none";
const reusableCardHeaderClassName =
  "flex h-14 items-center justify-between gap-4 px-4";
const reusableCardContentClassName = "px-4 py-2";

export function ReusableCard({
  title,
  icon,
  tone,
  action,
  children,
  className = "",
  contentClassName = reusableCardContentClassName,
  titleClassName = "",
}: ReusableCardProps) {
  const classes = toneClasses[tone];

  return (
    <section
      className={`${reusableCardShellClassName} ${classes.border} ${className}`}
    >
      <div
        className={`${reusableCardHeaderClassName} ${classes.header}`}
      >
        <div className="flex min-w-[6em] flex-1 items-center gap-2">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-avatar bg-surface ${classes.icon}`}
          >
            {icon}
          </span>
          <h2
            className={`min-w-0 truncate text-[20px] font-semibold tracking-normal ${classes.title} ${titleClassName}`}
          >
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className={contentClassName}>{children}</div>
    </section>
  );
}
