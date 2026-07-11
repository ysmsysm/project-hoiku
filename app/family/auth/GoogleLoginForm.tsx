"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../../src/lib/supabase/client";
import { getSafeFamilyRedirectPath } from "../../../src/lib/auth/redirect";

type GoogleLoginFormProps = {
  initialError?: string | null;
};

export function GoogleLoginForm({ initialError = null }: GoogleLoginFormProps) {
  const searchParams = useSearchParams();
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);
  const supabase = useMemo(() => createClient(), []);
  const nextPath = getSafeFamilyRedirectPath(searchParams.get("next"));

  const startGoogleLogin = async () => {
    if (isStartingLogin) {
      return;
    }

    setIsStartingLogin(true);
    setErrorMessage(null);

    const callbackUrl = new URL(
      "/family/auth/callback",
      window.location.origin,
    );
    callbackUrl.searchParams.set("next", nextPath);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      setErrorMessage("Googleログインを開始できませんでした。");
      setIsStartingLogin(false);
    }
  };

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <p className="rounded-section bg-card-today px-4 py-3 text-status font-normal text-danger ring-1 ring-danger/20">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={startGoogleLogin}
        disabled={isStartingLogin}
        className="h-[52px] w-full rounded-button bg-primary px-6 text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStartingLogin ? "ログインを開始中..." : "Googleでログイン"}
      </button>
    </div>
  );
}
