"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSafeFamilyInviteToken } from "../../../../src/lib/auth/redirect";
import {
  getUserDisplayName,
} from "../../../../src/lib/family-sharing/membership";
import {
  getInviteActionError,
  getInviteActionMessage,
  hashInviteToken,
} from "../../../../src/lib/family-sharing/invites";
import { createClient } from "../../../../src/lib/supabase/server";
import type { AcceptFamilyInviteActionResult } from "../../../../src/types/family";

export async function acceptFamilyInviteAction(
  token: string,
): Promise<AcceptFamilyInviteActionResult> {
  if (!isSafeFamilyInviteToken(token)) {
    return {
      ok: false,
      error: "invalid_token",
      message: getInviteActionMessage("invalid_token"),
    };
  }

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

  const { data, error } = await supabase.rpc("accept_family_invite", {
    token_hash: hashInviteToken(token),
    display_name: getUserDisplayName(user),
  });

  if (error || data !== true) {
    const actionError = getInviteActionError(error?.message);

    return {
      ok: false,
      error: actionError,
      message: getInviteActionMessage(actionError),
    };
  }

  revalidatePath("/family");
  redirect("/family");
}
