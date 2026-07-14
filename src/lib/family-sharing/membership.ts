import type { User } from "@supabase/supabase-js";
import type { CurrentFamilyMembership } from "../../types/family";
import { createClient } from "../supabase/server";
import {
  currentFamilyMembershipSelect,
  mapCurrentFamilyMembershipRow,
  mapCurrentFamilyMembershipRowWithSharingStartedAt,
  type CurrentFamilyMembershipRow,
} from "./membership-query";

export function getUserDisplayName(user: User) {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;
  const fallbackName = user.email?.split("@")[0] ?? "自分";
  const normalizedName = (metadataName ?? fallbackName).trim() || "自分";

  return Array.from(normalizedName).slice(0, 3).join("");
}

export function getOwnerDisplayName(user: User) {
  return getUserDisplayName(user);
}

export async function getCurrentFamilyMembership(
  user: User,
): Promise<CurrentFamilyMembership | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_members")
    .select(currentFamilyMembershipSelect)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch current family membership", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error("家族所属状態を取得できませんでした。");
  }

  if (!data) {
    return null;
  }

  const membershipRow = data as CurrentFamilyMembershipRow;
  const membership = mapCurrentFamilyMembershipRow(membershipRow);

  const { data: familyData, error: familyError } = await supabase
    .from("families")
    .select("sharing_started_at")
    .eq("id", membership.familyId)
    .maybeSingle();

  if (familyError) {
    console.error("Failed to fetch current family sharing status", {
      code: familyError.code,
      message: familyError.message,
      details: familyError.details,
      hint: familyError.hint,
    });
    throw new Error("家族共有状態を取得できませんでした。");
  }

  if (!familyData) {
    throw new Error("家族共有状態を取得できませんでした。");
  }

  return mapCurrentFamilyMembershipRowWithSharingStartedAt(
    membershipRow,
    familyData.sharing_started_at,
  );
}
