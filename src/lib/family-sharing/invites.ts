import "server-only";

import { createHash, randomBytes } from "crypto";
import { isSafeFamilyInviteToken } from "../auth/redirect";
import { createClient } from "../supabase/server";

const inviteUnavailableErrors = new Set([
  "invite_not_found",
  "invite_expired",
  "invite_revoked",
  "invite_already_used",
  "invalid_token_hash",
  "family_not_found",
]);

type InviteStatusRow = {
  valid?: boolean;
  expires_at?: string | null;
};

type CurrentInviteStatusRow = {
  has_active_invite?: boolean;
  expires_at?: string | null;
};

export function generateInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getInvitePath(token: string) {
  if (!isSafeFamilyInviteToken(token)) {
    throw new Error("invalid_invite_token");
  }

  return `/family/invite/${token}`;
}

export function getInviteActionError(errorMessage: string | undefined) {
  const message = errorMessage ?? "";

  if (message.includes("not_authenticated")) {
    return "not_authenticated";
  }

  if (message.includes("not_family_member")) {
    return "not_family_member";
  }

  if (message.includes("not_family_owner")) {
    return "not_family_owner";
  }

  if (message.includes("already_family_member")) {
    return "already_family_member";
  }

  if (message.includes("invalid_display_name")) {
    return "invalid_display_name";
  }

  for (const inviteError of inviteUnavailableErrors) {
    if (message.includes(inviteError)) {
      return "invite_unavailable";
    }
  }

  return "unknown";
}

export function getInviteActionMessage(error: string) {
  if (error === "not_authenticated") {
    return "ログイン状態を確認できませんでした。もう一度ログインしてください。";
  }

  if (error === "not_family_owner") {
    return "招待URLを発行できるのは家族のownerだけです。";
  }

  if (error === "not_family_member") {
    return "家族共有に参加していないため、この操作はできません。";
  }

  if (error === "already_family_member") {
    return "すでに家族共有に参加しています。";
  }

  if (error === "invalid_display_name") {
    return "表示名を確認できませんでした。もう一度ログインしてください。";
  }

  if (error === "invalid_token" || error === "invite_unavailable") {
    return "この招待は使用できません。";
  }

  return "処理を完了できませんでした。少し時間をおいてもう一度お試しください。";
}

export async function getCurrentFamilyInviteStatus() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_current_family_invite_status",
  );

  if (error) {
    return {
      ok: false as const,
      error: getInviteActionError(error.message),
    };
  }

  const row = Array.isArray(data)
    ? (data[0] as CurrentInviteStatusRow | undefined)
    : (data as CurrentInviteStatusRow | null);

  return {
    ok: true as const,
    hasActiveInvite: Boolean(row?.has_active_invite),
    expiresAt: row?.expires_at ?? null,
  };
}

export async function getFamilyInviteStatus(token: string) {
  if (!isSafeFamilyInviteToken(token)) {
    return {
      valid: false,
      expiresAt: null,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_family_invite_status", {
    token_hash: hashInviteToken(token),
  });

  if (error) {
    return {
      valid: false,
      expiresAt: null,
    };
  }

  const row = Array.isArray(data)
    ? (data[0] as InviteStatusRow | undefined)
    : (data as InviteStatusRow | null);

  return {
    valid: Boolean(row?.valid),
    expiresAt: row?.expires_at ?? null,
  };
}
