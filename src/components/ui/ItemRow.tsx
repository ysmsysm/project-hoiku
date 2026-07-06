import type { ReactNode } from "react";

type ItemRowProps = {
  as?: "div" | "button";
  icon?: ReactNode;
  name: ReactNode;
  quantity?: ReactNode;
  progress?: ReactNode;
  status?: ReactNode;
  children?: ReactNode;
  renderAction?: () => ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  contentClassName?: string;
  textClassName?: string;
  nameClassName?: string;
  quantityClassName?: string;
  statusClassName?: string;
};

const defaultRowClassName =
  "flex min-h-[58px] w-full items-center justify-between gap-4 rounded-section border border-border-soft bg-surface px-4 py-3 text-left text-text-primary shadow-card transition disabled:text-text-tertiary disabled:opacity-60";

export function ItemRow({
  as = "div",
  icon,
  name,
  quantity,
  progress,
  status,
  children,
  renderAction,
  disabled = false,
  onClick,
  className = defaultRowClassName,
  contentClassName = "flex min-w-0 items-center gap-3",
  textClassName = "flex min-w-0 items-baseline gap-2",
  nameClassName = "truncate font-semibold text-text-primary",
  quantityClassName = "shrink-0 text-status font-medium text-text-secondary",
  statusClassName = "shrink-0 text-status font-medium text-text-secondary",
}: ItemRowProps) {
  const action = renderAction ? renderAction() : children;
  const content = (
    <>
      <div className={contentClassName}>
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <div className={textClassName}>
          <span className={nameClassName}>{name}</span>
          {quantity ? (
            <span className={quantityClassName}>{quantity}</span>
          ) : null}
          {status ? <span className={statusClassName}>{status}</span> : null}
        </div>
      </div>
      {progress}
      {action}
    </>
  );

  if (as === "button") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <div aria-disabled={disabled || undefined} className={className}>
      {content}
    </div>
  );
}
