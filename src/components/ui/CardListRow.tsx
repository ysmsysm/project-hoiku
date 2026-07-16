import type { CSSProperties, ReactNode } from "react";

export const CARD_LIST_ROW_DOT_TOUCH_SIZE = 44;
export const CARD_LIST_ROW_DOT_COLUMN_SIZE = 34;
export const CARD_LIST_ROW_VALUE_COLUMN_WIDTH = "3rem";
export const CARD_LIST_ROW_NAME_MIN_WIDTH = "5.5em";
export const CARD_LIST_ROW_COLUMN_GAP = "0.25rem";

export function getCardListRowIndicatorWidth(
  columnCount: number,
  valueColumnWidth = CARD_LIST_ROW_VALUE_COLUMN_WIDTH,
) {
  const preferredWidth =
    Math.max(1, columnCount) * CARD_LIST_ROW_DOT_COLUMN_SIZE;

  return `min(${preferredWidth}px, calc(100% - ${CARD_LIST_ROW_NAME_MIN_WIDTH} - ${valueColumnWidth} - (${CARD_LIST_ROW_COLUMN_GAP} * 2)))`;
}

type CardListRowProps = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  as?: "div" | "button";
  onClick?: () => void;
  statusColor?: string;
  indicatorWidth?: string;
  valueColumnWidth?: string;
};

const rowClassName =
  "grid min-h-14 w-full items-center gap-1 border-b border-divider py-2 text-left last:border-b-0";

export function CardListRow({
  left,
  center,
  right,
  as = "div",
  onClick,
  statusColor = "",
  indicatorWidth = getCardListRowIndicatorWidth(1),
  valueColumnWidth = CARD_LIST_ROW_VALUE_COLUMN_WIDTH,
}: CardListRowProps) {
  const rowStyle: CSSProperties = {
    gridTemplateColumns: `minmax(${CARD_LIST_ROW_NAME_MIN_WIDTH}, 1fr) ${indicatorWidth} ${valueColumnWidth}`,
    columnGap: CARD_LIST_ROW_COLUMN_GAP,
  };

  const content = (
    <>
      <div className="min-w-0">
        <span className="block overflow-hidden text-list-item font-medium leading-snug text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
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
      <button
        type="button"
        onClick={onClick}
        className={rowClassName}
        style={rowStyle}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={rowClassName} style={rowStyle}>
      {content}
    </div>
  );
}
