import { Minus, Plus } from "lucide-react";
import { useRef, useState } from "react";
import {
  clampSpotQuantity,
  parseSpotQuantityInput,
  spotQuantityMax,
  spotQuantityMin,
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
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const quantity = clampSpotQuantity(value);

  const updateQuantity = (nextValue: number) => {
    const nextQuantity = clampSpotQuantity(nextValue);
    onChange(nextQuantity);
    setDraft(String(nextQuantity));
  };

  const startEditing = () => {
    if (disabled) {
      return;
    }

    setDraft(String(quantity));
    setIsEditing(true);
    window.setTimeout(() => inputRef.current?.select(), 0);
  };

  const finishEditing = () => {
    const parsed = parseSpotQuantityInput(draft);
    updateQuantity(parsed ?? quantity);
    setIsEditing(false);
  };

  return (
    <div
      className={`grid h-9 grid-cols-[1.75rem_minmax(1.75rem,1fr)_1.75rem] items-center rounded-xl bg-surface text-number font-normal text-hoiku-ink ring-1 ring-[#edf3ef] ${className}`}
    >
      <button
        type="button"
        aria-label="数量を減らす"
        onClick={() => updateQuantity(quantity - 1)}
        disabled={disabled || quantity <= spotQuantityMin}
        className="grid h-9 place-items-center rounded-l-xl text-text-secondary transition active:scale-95 disabled:pointer-events-none disabled:text-text-tertiary"
      >
        <Minus size={15} strokeWidth={2.4} />
      </button>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(event) => {
            const nextValue = event.target.value;

            if (!/^\d*$/.test(nextValue)) {
              return;
            }

            setDraft(nextValue);
          }}
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              finishEditing();
            }

            if (event.key === "Escape") {
              setDraft(String(quantity));
              setIsEditing(false);
            }
          }}
          className="h-9 min-w-0 bg-transparent text-center outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          disabled={disabled}
          className="h-9 min-w-0 text-center transition active:scale-95 disabled:pointer-events-none"
        >
          {quantity}
        </button>
      )}

      <button
        type="button"
        aria-label="数量を増やす"
        onClick={() => updateQuantity(quantity + 1)}
        disabled={disabled || quantity >= spotQuantityMax}
        className="grid h-9 place-items-center rounded-r-xl text-text-secondary transition active:scale-95 disabled:pointer-events-none disabled:text-text-tertiary"
      >
        <Plus size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}
