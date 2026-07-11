"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../src/lib/supabase/server";
import { getOwnerDisplayName } from "../../src/lib/family-sharing/membership";

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
