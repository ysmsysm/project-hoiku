import Link from "next/link";
import { SectionCard } from "../../../../src/components/ui/SectionCard";
import { isSafeFamilyInviteToken } from "../../../../src/lib/auth/redirect";
import { getCurrentUser } from "../../../../src/lib/auth/session";
import { getCurrentFamilyMembership } from "../../../../src/lib/family-sharing/membership";
import { getFamilyInviteStatus } from "../../../../src/lib/family-sharing/invites";
import { AcceptInviteButton } from "./AcceptInviteButton";

type FamilyInvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-hoiku-ink">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[430px] items-center">
        <SectionCard className="w-full">{children}</SectionCard>
      </div>
    </main>
  );
}

function UnavailableInvite() {
  return (
    <InviteShell>
      <div className="space-y-3">
        <p className="text-status font-normal text-text-secondary">
          家族共有への招待
        </p>
        <h1 className="text-card-title font-semibold text-hoiku-ink">
          この招待は使用できません
        </h1>
        <p className="text-number font-normal leading-relaxed text-text-secondary">
          招待した家族に、新しい招待URLを発行してもらってください。
        </p>
      </div>
      <Link
        href="/family"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-button border border-border-soft bg-surface px-5 text-number font-semibold text-text-primary shadow-card transition active:scale-[0.99]"
      >
        家族共有へ戻る
      </Link>
    </InviteShell>
  );
}

function AlreadyJoined() {
  return (
    <InviteShell>
      <div className="space-y-3">
        <p className="text-status font-normal text-text-secondary">
          家族共有への招待
        </p>
        <h1 className="text-card-title font-semibold text-hoiku-ink">
          すでに家族共有に参加しています
        </h1>
        <p className="text-number font-normal leading-relaxed text-text-secondary">
          現在の家族から退出する機能は、まだ提供していません。
        </p>
      </div>
      <Link
        href="/family"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-button bg-primary px-6 text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99]"
      >
        家族共有へ戻る
      </Link>
    </InviteShell>
  );
}

function LoginPrompt({ token }: { token: string }) {
  const nextPath = `/family/invite/${token}`;
  const authHref = `/family/auth?next=${encodeURIComponent(nextPath)}`;

  return (
    <InviteShell>
      <div className="space-y-3">
        <p className="text-status font-normal text-text-secondary">
          家族共有への招待
        </p>
        <h1 className="text-card-title font-semibold text-hoiku-ink">
          家族共有への招待
        </h1>
        <p className="text-number font-normal leading-relaxed text-text-secondary">
          参加するにはGoogleログインが必要です。
        </p>
      </div>
      <Link
        href={authHref}
        className="mt-6 flex h-[52px] w-full items-center justify-center rounded-button bg-primary px-6 text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99]"
      >
        Googleログインへ進む
      </Link>
    </InviteShell>
  );
}

function JoinConfirmation({ token }: { token: string }) {
  return (
    <InviteShell>
      <div className="space-y-3">
        <p className="text-status font-normal text-text-secondary">
          家族共有への招待
        </p>
        <h1 className="text-card-title font-semibold text-hoiku-ink">
          家族共有への招待
        </h1>
        <p className="text-number font-normal leading-relaxed text-text-secondary">
          参加すると、家族と保育園準備の情報を共有できるようになります。
        </p>
      </div>
      <div className="mt-6">
        <AcceptInviteButton token={token} />
      </div>
    </InviteShell>
  );
}

export default async function FamilyInvitePage({
  params,
}: FamilyInvitePageProps) {
  const { token } = await params;

  if (!isSafeFamilyInviteToken(token)) {
    return <UnavailableInvite />;
  }

  const inviteStatus = await getFamilyInviteStatus(token);

  if (!inviteStatus.valid) {
    return <UnavailableInvite />;
  }

  const user = await getCurrentUser();

  if (!user) {
    return <LoginPrompt token={token} />;
  }

  const membership = await getCurrentFamilyMembership(user);

  if (membership) {
    return <AlreadyJoined />;
  }

  return <JoinConfirmation token={token} />;
}
