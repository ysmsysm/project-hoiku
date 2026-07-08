import type { ReactNode } from "react";

type CardListRowProps = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  as?: "div" | "button";
  onClick?: () => void;
  statusColor?: string;
};

const rowClassName =
  "grid min-h-[50px] w-full grid-cols-[minmax(0,1fr)_9rem_3.5rem] items-center gap-3 border-b border-divider py-2 text-left last:border-b-0";

export function CardListRow({
  left,
  center,
  right,
  as = "div",
  onClick,
  statusColor = "",
}: CardListRowProps) {
  const content = (
    <>
      <div className="min-w-0">
        <span className="block truncate text-list-item font-medium text-text-primary">
          {left}
        </span>
      </div>
      <div className="min-w-0 text-number font-normal text-text-primary">
        {center}
      </div>
      <div
        className={`whitespace-nowrap text-right text-number font-normal ${
          statusColor || "text-text-tertiary"
        }`}
      >
        {right}
      </div>
    </>
  );

  if (as === "button") {
    return (
      <button type="button" onClick={onClick} className={rowClassName}>
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}
