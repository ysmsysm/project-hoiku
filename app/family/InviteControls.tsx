"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createFamilyInviteAction,
  revokeFamilyInviteAction,
} from "./actions";

type InviteControlsProps = {
  initialStatus: {
    hasActiveInvite: boolean;
    expiresAt: string | null;
    errorMessage: string | null;
  };
};

type PendingAction = "create" | "revoke" | null;

const createConfirmMessage =
  "新しい招待URLを発行すると、現在の招待URLは使用できなくなります。発行しますか？";
const revokeConfirmMessage =
  "現在の招待URLを無効にしますか？\n無効にしたURLは使用できなくなります。";

function formatExpiresAt(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function InviteControls({ initialStatus }: InviteControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [hasActiveInvite, setHasActiveInvite] = useState(
    initialStatus.hasActiveInvite,
  );
  const [expiresAt, setExpiresAt] = useState(initialStatus.expiresAt);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState(
    initialStatus.errorMessage,
  );

  const formattedExpiresAt = formatExpiresAt(expiresAt);
  const isBusy = isPending || pendingAction !== null;

  const createInvite = () => {
    if (isBusy) {
      return;
    }

    if (hasActiveInvite && !window.confirm(createConfirmMessage)) {
      return;
    }

    setPendingAction("create");
    setNoticeMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      const result = await createFamilyInviteAction();

      if (result.ok === false) {
        setErrorMessage(result.message);
        setPendingAction(null);
        return;
      }

      setInviteUrl(`${window.location.origin}${result.invitePath}`);
      setExpiresAt(result.expiresAt);
      setHasActiveInvite(true);
      setNoticeMessage("招待URLを発行しました");
      setPendingAction(null);
      router.refresh();
    });
  };

  const revokeInvite = () => {
    if (isBusy) {
      return;
    }

    if (!window.confirm(revokeConfirmMessage)) {
      return;
    }

    setPendingAction("revoke");
    setNoticeMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      const result = await revokeFamilyInviteAction();

      if (result.ok === false) {
        setErrorMessage(result.message);
        setPendingAction(null);
        return;
      }

      setInviteUrl(null);
      setExpiresAt(null);
      setHasActiveInvite(false);
      setNoticeMessage(
        result.revoked ? "招待を無効にしました" : "有効な招待はありません",
      );
      setPendingAction(null);
      router.refresh();
    });
  };

  const copyInviteUrl = async () => {
    if (!inviteUrl) {
      return;
    }

    setNoticeMessage(null);
    setErrorMessage(null);

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNoticeMessage("コピーしました");
    } catch {
      setErrorMessage(
        "URLをコピーできませんでした。URLを選択してコピーしてください。",
      );
    }
  };

  return (
    <div className="space-y-4 rounded-section bg-card-stock px-4 py-3 ring-1 ring-border-soft">
      <div className="space-y-2">
        <p className="text-status font-semibold text-hoiku-deep">
          {inviteUrl
            ? "招待URLを発行しました"
            : hasActiveInvite
              ? "有効な招待があります"
              : "家族を招待"}
        </p>

        {formattedExpiresAt ? (
          <p className="text-status font-normal text-text-secondary">
            有効期限：{formattedExpiresAt}
          </p>
        ) : null}

        {inviteUrl ? (
          <p className="select-all break-all rounded-section bg-surface px-3 py-2 text-status font-normal text-text-primary ring-1 ring-border-soft">
            {inviteUrl}
          </p>
        ) : hasActiveInvite ? (
          <div className="space-y-1 text-status font-normal leading-relaxed text-text-secondary">
            <p>招待URLを紛失した場合は、新しいURLを発行してください。</p>
            <p>
              新しいURLを発行すると、現在のURLは使用できなくなります。
            </p>
          </div>
        ) : (
          <div className="space-y-1 text-status font-normal leading-relaxed text-text-secondary">
            <p>家族に送る招待URLを発行できます。</p>
            <p>招待URLの有効期限は72時間です。</p>
          </div>
        )}
      </div>

      {noticeMessage ? (
        <p className="rounded-section bg-card-today px-3 py-2 text-status font-normal text-hoiku-deep ring-1 ring-border-soft">
          {noticeMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-section bg-card-today px-3 py-2 text-status font-normal text-danger ring-1 ring-danger/20">
          {errorMessage}
        </p>
      ) : null}

      <div className="space-y-3">
        {inviteUrl ? (
          <button
            type="button"
            onClick={copyInviteUrl}
            disabled={isBusy}
            className="h-11 w-full rounded-button border border-border-soft bg-surface px-5 text-number font-semibold text-text-primary shadow-card transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            URLをコピー
          </button>
        ) : null}

        <button
          type="button"
          onClick={createInvite}
          disabled={isBusy}
          className="h-11 w-full rounded-button bg-primary px-6 text-number font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingAction === "create"
            ? "発行中..."
            : hasActiveInvite
              ? "新しいURLを発行"
              : "招待URLを発行"}
        </button>

        {hasActiveInvite ? (
          <button
            type="button"
            onClick={revokeInvite}
            disabled={isBusy}
            className="h-11 w-full rounded-button border border-border-soft bg-surface px-5 text-number font-semibold text-text-primary shadow-card transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingAction === "revoke" ? "無効化中..." : "招待を無効にする"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
