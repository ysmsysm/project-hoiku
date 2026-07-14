"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../src/lib/supabase/client";
import {
  prepareFamilySharingLocalDataFromStorage,
  type FamilySharingLocalDataPreparation,
} from "../../src/lib/family-sharing/local-data-payload";
import {
  currentFamilyMembershipSelect,
  mapCurrentFamilyMembershipRow,
  type CurrentFamilyMembershipRow,
} from "../../src/lib/family-sharing/membership-query";
import type { CurrentFamilyMembership } from "../../src/types/family";

type FamilyDataSharingStartProps = {
  initialMembership: CurrentFamilyMembership;
};

type StartSharingRpcRow = {
  sharing_started_at?: string | null;
};

const generalErrorMessage =
  "共有を開始できませんでした。少し時間をおいてもう一度お試しください。";
const invalidStorageMessage =
  "この端末の保存データを正しく読み込めませんでした。共有を開始する前に、設定内容を確認してください。";
const invalidPayloadMessage =
  "共有する設定に確認が必要な項目があります。設定内容を確認してから、もう一度お試しください。";

function getLocalDataErrorMessage(
  preparation: FamilySharingLocalDataPreparation,
) {
  if (preparation.ok === true) {
    return null;
  }

  return preparation.issues.some((issue) => "key" in issue)
    ? invalidStorageMessage
    : invalidPayloadMessage;
}

function formatStartedAt(value: string | null) {
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

function getRpcSharingStartedAt(data: unknown) {
  const row = Array.isArray(data)
    ? (data[0] as StartSharingRpcRow | undefined)
    : (data as StartSharingRpcRow | null);

  return row?.sharing_started_at ?? null;
}

export function FamilyDataSharingStart({
  initialMembership,
}: FamilyDataSharingStartProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [localDataPreparation, setLocalDataPreparation] =
    useState<FamilySharingLocalDataPreparation | null>(null);
  const [membership, setMembership] = useState(initialMembership);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const formattedStartedAt = formatStartedAt(membership.sharingStartedAt);
  const isLocalDataLoading = localDataPreparation === null;
  const childName = localDataPreparation?.childName ?? "確認できません";
  const hasMissingDefaults =
    (localDataPreparation?.missingDefaultLabels.length ?? 0) > 0;
  const canStartSharing =
    membership.isPreSharingOwner &&
    localDataPreparation?.ok === true &&
    !isStarting;
  const localDataErrorMessage = localDataPreparation
    ? getLocalDataErrorMessage(localDataPreparation)
    : null;

  useEffect(() => {
    const preparation = prepareFamilySharingLocalDataFromStorage();
    setLocalDataPreparation(preparation);

    if (preparation.ok === false) {
      console.error("Family sharing local data is not ready", preparation.issues);
    }
  }, []);

  const refreshMembership = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data, error } = await supabase
      .from("family_members")
      .select(currentFamilyMembershipSelect)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error("Failed to refresh family sharing status", error);
      }

      return null;
    }

    const nextMembership = mapCurrentFamilyMembershipRow(
      data as CurrentFamilyMembershipRow,
    );
    setMembership(nextMembership);

    return nextMembership;
  };

  const startSharing = async () => {
    if (inFlightRef.current || !membership.isPreSharingOwner || isStarting) {
      return;
    }

    if (localDataPreparation === null || localDataPreparation.ok === false) {
      return;
    }

    inFlightRef.current = true;
    setIsStarting(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc("start_family_data_sharing", {
        payload: localDataPreparation.payload,
      });

      if (error) {
        console.error("Failed to start family data sharing", error);
        const refreshedMembership = await refreshMembership();

        if (refreshedMembership?.isSharingStarted) {
          setIsConfirming(false);
          router.refresh();
          return;
        }

        setErrorMessage(generalErrorMessage);
        return;
      }

      const refreshedMembership = await refreshMembership();

      if (!refreshedMembership) {
        const sharingStartedAt = getRpcSharingStartedAt(data);
        setMembership((current) => ({
          ...current,
          sharingStartedAt,
          isSharingStarted: sharingStartedAt !== null,
          isPreSharingOwner: sharingStartedAt === null && current.role === "owner",
        }));
      }

      setIsConfirming(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to build family data sharing payload", error);
      setErrorMessage(generalErrorMessage);
    } finally {
      inFlightRef.current = false;
      setIsStarting(false);
    }
  };

  if (membership.role !== "owner") {
    return null;
  }

  if (membership.isSharingStarted) {
    return (
      <div className="space-y-2 rounded-section bg-card-stock px-4 py-3 ring-1 ring-border-soft">
        <p className="text-status font-semibold text-hoiku-deep">
          家族データの共有を開始しました
        </p>
        {formattedStartedAt ? (
          <p className="text-status font-normal text-text-secondary">
            開始日時：{formattedStartedAt}
          </p>
        ) : null}
      </div>
    );
  }

  if (!membership.isPreSharingOwner) {
    return null;
  }

  if (isLocalDataLoading) {
    return (
      <div className="space-y-3 rounded-section bg-card-stock px-4 py-3 ring-1 ring-border-soft">
        <p className="text-status font-semibold text-hoiku-deep">
          家族データの共有
        </p>
        <p className="rounded-section bg-surface px-4 py-3 text-status font-normal leading-relaxed text-text-secondary ring-1 ring-border-soft">
          共有するデータを確認しています...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-section bg-card-stock px-4 py-3 ring-1 ring-border-soft">
      <div className="space-y-2">
        <p className="text-status font-semibold text-hoiku-deep">
          家族データの共有
        </p>
        <div className="space-y-1 rounded-section bg-surface px-4 py-3 ring-1 ring-border-soft">
          <p className="text-status font-semibold text-text-primary">
            共有するデータ
          </p>
          <p className="text-status font-normal text-text-secondary">
            子どもの名前：{childName}
          </p>
        </div>
        <p className="text-status font-normal leading-relaxed text-text-secondary">
          この端末の子ども設定、持ち物設定、スポット追加、ざっくり管理を家族で共有します。
        </p>
      </div>

      {hasMissingDefaults ? (
        <p className="rounded-section bg-card-today px-4 py-3 text-status font-normal leading-relaxed text-text-secondary ring-1 ring-border-soft">
          この端末には保存されていない設定があるため、一部はアプリの初期設定を使用します。
          <br />
          表示されている子どもの名前を確認してから、共有を開始してください。
          <br />
          初期設定を使用：
          {localDataPreparation?.missingDefaultLabels.join("、")}
        </p>
      ) : null}

      {localDataErrorMessage ? (
        <p className="rounded-section bg-card-today px-4 py-3 text-status font-normal leading-relaxed text-danger ring-1 ring-danger/20">
          {localDataErrorMessage}
        </p>
      ) : null}

      <p className="rounded-section bg-card-today px-4 py-3 text-status font-normal leading-relaxed text-text-secondary ring-1 ring-border-soft">
        共有を開始すると、この端末の設定が家族の最初の共有データになります。
        <br />
        ほかの家族の端末にある既存データは自動では統合されません。
      </p>

      {isConfirming ? (
        <div className="space-y-3 rounded-section bg-surface px-4 py-3 ring-1 ring-border-soft">
          <p className="text-status font-normal leading-relaxed text-text-primary">
            子どもの名前：{childName}
            <br />
            <br />
            この端末の設定を家族の共有データとして登録します。
            <br />
            <br />
            ほかの端末の既存データは統合されません。
            <br />
            この操作は家族につき1回だけ実行できます。
          </p>
          {hasMissingDefaults ? (
            <p className="rounded-section bg-card-today px-4 py-3 text-status font-normal leading-relaxed text-text-secondary ring-1 ring-border-soft">
              この端末には保存されていない設定があるため、一部はアプリの初期設定を使用します。
              <br />
              初期設定を使用：
              {localDataPreparation?.missingDefaultLabels.join("、")}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isStarting}
              className="h-[48px] rounded-button border border-border-soft bg-surface px-4 text-button font-bold text-text-primary shadow-card transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={startSharing}
              disabled={!canStartSharing}
              className="h-[48px] rounded-button bg-primary px-4 text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 min-[420px]:whitespace-nowrap"
            >
              {isStarting ? "共有を開始しています..." : "共有を開始する"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsConfirming(true);
          }}
          disabled={isStarting || localDataPreparation.ok === false}
          className="h-[52px] w-full rounded-button bg-primary px-6 text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isStarting
            ? "共有を開始しています..."
            : "この端末のデータで共有を開始"}
        </button>
      )}

      {errorMessage ? (
        <p className="rounded-section bg-card-today px-4 py-3 text-status font-normal text-danger ring-1 ring-danger/20">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
