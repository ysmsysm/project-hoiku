import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SectionCard } from "../../../src/components/ui/SectionCard";
import { getSafeFamilyRedirectPath } from "../../../src/lib/auth/redirect";
import { getCurrentUser } from "../../../src/lib/auth/session";
import { GoogleLoginForm } from "./GoogleLoginForm";

type FamilyAuthPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  callback_failed: "Googleログインを完了できませんでした。",
  missing_code: "Googleログインの確認コードが見つかりませんでした。",
};

export default async function FamilyAuthPage({
  searchParams,
}: FamilyAuthPageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (user) {
    redirect(getSafeFamilyRedirectPath(params.next));
  }

  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-hoiku-ink">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[430px] items-center">
        <SectionCard className="w-full">
          <div className="space-y-3">
            <p className="text-status font-normal text-text-secondary">
              家族共有
            </p>
            <h1 className="text-card-title font-semibold text-hoiku-ink">
              Googleログイン
            </h1>
            <p className="text-number font-normal leading-relaxed text-text-secondary">
              家族共有を使うための認証だけを行います。ログインしても、まだ家族への参加やデータ移行は行われません。
            </p>
          </div>

          <div className="mt-6">
            <Suspense
              fallback={
                <div className="h-[52px] rounded-button bg-card-today" />
              }
            >
              <GoogleLoginForm
                initialError={
                  params.error ? errorMessages[params.error] : null
                }
              />
            </Suspense>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
