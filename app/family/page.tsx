import { redirect } from "next/navigation";
import { SectionCard } from "../../src/components/ui/SectionCard";
import { getCurrentUser } from "../../src/lib/auth/session";
import { LogoutButton } from "./LogoutButton";

export default async function FamilyPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/family/auth?next=/family");
  }

  const displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : user.email;

  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-hoiku-ink">
      <div className="mx-auto w-full max-w-[430px] space-y-5">
        <header className="pt-2">
          <p className="text-status font-normal text-text-secondary">
            Googleログイン済み
          </p>
          <h1 className="mt-1 text-app-title font-bold tracking-normal text-hoiku-ink">
            家族共有
          </h1>
        </header>

        <SectionCard>
          <div className="space-y-4">
            <div>
              <p className="text-status font-normal text-text-secondary">
                Googleアカウント
              </p>
              <p className="mt-1 break-words text-list-item font-semibold text-text-primary">
                {displayName}
              </p>
              {user.email && user.email !== displayName ? (
                <p className="mt-1 break-words text-status font-normal text-text-secondary">
                  {user.email}
                </p>
              ) : null}
            </div>

            <div className="rounded-section bg-card-stock px-4 py-3 ring-1 ring-border-soft">
              <p className="text-status font-semibold text-hoiku-deep">
                まだ家族には参加していません
              </p>
              <p className="mt-1 text-status font-normal leading-relaxed text-text-secondary">
                現在確認できるのはGoogle認証のみです。家族作成や招待参加はまだ行いません。
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard appearance="current">
          <LogoutButton />
        </SectionCard>
      </div>
    </main>
  );
}
