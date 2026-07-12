"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { acceptFamilyInviteAction } from "./actions";

type AcceptInviteButtonProps = {
  token: string;
};

export function AcceptInviteButton({ token }: AcceptInviteButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const acceptInvite = () => {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setErrorMessage(null);

    startTransition(async () => {
      const result = await acceptFamilyInviteAction(token);

      if (result?.ok === false) {
        setErrorMessage(result.message);
        isSubmittingRef.current = false;
      }
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
        onClick={acceptInvite}
        disabled={isPending}
        className="h-[52px] w-full rounded-button bg-primary px-6 text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "参加中..." : "参加する"}
      </button>

      <Link
        href="/family"
        className="flex h-12 w-full items-center justify-center rounded-button border border-border-soft bg-surface px-5 text-number font-semibold text-text-primary shadow-card transition active:scale-[0.99]"
      >
        キャンセル
      </Link>
    </div>
  );
}
