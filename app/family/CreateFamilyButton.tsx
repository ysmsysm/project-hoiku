"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFamilyAction } from "./actions";

export function CreateFamilyButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const createFamily = () => {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setErrorMessage(null);

    startTransition(async () => {
      const result = await createFamilyAction();

      if (result.ok === false) {
        setErrorMessage(result.message);
        isSubmittingRef.current = false;
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <p className="rounded-section bg-card-today px-4 py-3 text-status font-normal text-danger ring-1 ring-danger/20">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={createFamily}
        disabled={isPending}
        className="h-[52px] w-full rounded-button bg-primary px-6 text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "作成中..." : "家族を作成"}
      </button>
    </div>
  );
}
