import { splitHomeItemUnitLines } from "../../lib/home-item-template-constraints";

type HomeItemQuantityTextProps = {
  count: number;
  unit: string;
};

export function HomeItemQuantityText({
  count,
  unit,
}: HomeItemQuantityTextProps) {
  const unitLines = splitHomeItemUnitLines(unit);

  return (
    <span className="inline-flex max-w-full items-start justify-end gap-0.5 whitespace-normal text-right">
      <span className="shrink-0">{count}</span>
      <span
        className={`flex min-w-0 flex-col break-words leading-tight ${
          unitLines.length > 1 ? "text-[10px]" : ""
        }`}
      >
        {unitLines.map((line, index) => (
          <span key={`${index}-${line}`} className="block whitespace-normal">
            {line || "\u00a0"}
          </span>
        ))}
      </span>
    </span>
  );
}

export function HomeItemUnitText({ unit }: Pick<HomeItemQuantityTextProps, "unit">) {
  return (
    <span className="inline-flex min-w-0 flex-col whitespace-normal break-words text-[10px] leading-tight">
      {splitHomeItemUnitLines(unit).map((line, index) => (
        <span key={`${index}-${line}`} className="block whitespace-normal">
          {line || "\u00a0"}
        </span>
      ))}
    </span>
  );
}
