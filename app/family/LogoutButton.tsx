"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../src/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const signOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage("ログアウトできませんでした。");
      setIsSigningOut(false);
      return;
    }

    router.replace("/family/auth");
    router.refresh();
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
        onClick={signOut}
        disabled={isSigningOut}
        className="h-12 w-full rounded-button border border-border-soft bg-surface px-5 text-number font-semibold text-text-primary shadow-card transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSigningOut ? "ログアウト中..." : "ログアウト"}
      </button>
    </div>
  );
}
