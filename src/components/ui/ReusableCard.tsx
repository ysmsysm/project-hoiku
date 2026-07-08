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
    background: string;
    icon: string;
    title: string;
  }
> = {
  blue: {
    background: "bg-card-items",
    icon: "text-icon-items",
    title: "text-icon-items",
  },
  pink: {
    background: "bg-card-today",
    icon: "text-icon-today",
    title: "text-icon-today",
  },
  green: {
    background: "bg-card-stock",
    icon: "text-icon-stock",
    title: "text-icon-stock",
  },
};

export function ReusableCard({
  title,
  icon,
  tone,
  action,
  children,
  className = "",
  contentClassName = "overflow-hidden rounded-section bg-surface px-5 py-2 shadow-card",
  titleClassName = "",
}: ReusableCardProps) {
  const classes = toneClasses[tone];

  return (
    <section
      className={`rounded-card p-3 shadow-card ring-1 ring-border-soft ${classes.background} ${className}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-avatar bg-surface shadow-card ${classes.icon}`}
          >
            {icon}
          </span>
          <h2
            className={`truncate text-card-title font-semibold tracking-normal ${classes.title} ${titleClassName}`}
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
