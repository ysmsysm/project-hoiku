import { useEffect, useState } from "react";
import {
  clampSpotQuantity,
  parseSpotQuantityInput,
} from "../lib/spotQuantity";

type SpotQuantityControlProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
};

export function SpotQuantityControl({
  value,
  onChange,
  disabled = false,
  className = "",
}: SpotQuantityControlProps) {
  const quantity = clampSpotQuantity(value);
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  const saveDraft = () => {
    const parsed = parseSpotQuantityInput(draft);
    const nextQuantity = parsed ?? quantity;

    onChange(nextQuantity);
    setDraft(String(nextQuantity));
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      step={1}
      disabled={disabled}
      value={draft}
      aria-label="数量"
      onChange={(event) => {
        const nextValue = event.target.value;

        if (!/^\d{0,2}$/.test(nextValue)) {
          return;
        }

        setDraft(nextValue);

        if (nextValue !== "") {
          onChange(clampSpotQuantity(Number(nextValue)));
        }
      }}
      onBlur={saveDraft}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          saveDraft();
          event.currentTarget.blur();
        }
      }}
      className={`h-11 w-14 shrink-0 rounded-xl bg-surface px-2 text-center text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] [appearance:textfield] focus:ring-hoiku-green disabled:bg-transparent disabled:ring-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${className}`}
    />
  );
}
