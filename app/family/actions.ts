"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../src/lib/supabase/server";
import { getOwnerDisplayName } from "../../src/lib/family-sharing/membership";
import {
  generateInviteToken,
  getInviteActionError,
  getInviteActionMessage,
  getInvitePath,
  hashInviteToken,
} from "../../src/lib/family-sharing/invites";
import type {
  CreateFamilyInviteActionResult,
  RevokeFamilyInviteActionResult,
} from "../../src/types/family";

export type CreateFamilyActionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function createFamilyAction(): Promise<CreateFamilyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      message: "ログイン状態を確認できませんでした。もう一度ログインしてください。",
    };
  }

  const { error } = await supabase.rpc("create_family_for_current_user", {
    owner_display_name: getOwnerDisplayName(user),
  });

  if (error) {
    if (
      error.message.includes("already_family_member") ||
      error.message.includes("already belongs to a family")
    ) {
      return {
        ok: false,
        message: "すでに家族共有中です。画面を更新して状態を確認してください。",
      };
    }

    return {
      ok: false,
      message: "家族を作成できませんでした。少し時間をおいてもう一度お試しください。",
    };
  }

  revalidatePath("/family");
  return { ok: true };
}

type CreateFamilyInviteRpcRow = {
  expires_at?: string;
};

export async function createFamilyInviteAction(): Promise<CreateFamilyInviteActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: "not_authenticated",
      message: getInviteActionMessage("not_authenticated"),
    };
  }

  const token = generateInviteToken();
  const invitePath = getInvitePath(token);
  const { data, error } = await supabase.rpc("create_family_invite", {
    token_hash: hashInviteToken(token),
  });

  if (error) {
    const actionError = getInviteActionError(error.message);

    return {
      ok: false,
      error: actionError,
      message: getInviteActionMessage(actionError),
    };
  }

  const row = Array.isArray(data)
    ? (data[0] as CreateFamilyInviteRpcRow | undefined)
    : (data as CreateFamilyInviteRpcRow | null);
  const expiresAt = row?.expires_at;

  if (!expiresAt) {
    return {
      ok: false,
      error: "unknown",
      message: getInviteActionMessage("unknown"),
    };
  }

  revalidatePath("/family");

  return {
    ok: true,
    invitePath,
    expiresAt,
  };
}

export async function revokeFamilyInviteAction(): Promise<RevokeFamilyInviteActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: "not_authenticated",
      message: getInviteActionMessage("not_authenticated"),
    };
  }

  const { data, error } = await supabase.rpc("revoke_family_invite");

  if (error) {
    const actionError = getInviteActionError(error.message);

    return {
      ok: false,
      error: actionError,
      message: getInviteActionMessage(actionError),
    };
  }

  revalidatePath("/family");

  return {
    ok: true,
    revoked: Boolean(data),
  };
}
