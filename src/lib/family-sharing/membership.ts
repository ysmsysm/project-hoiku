import type { User } from "@supabase/supabase-js";
import type { CurrentFamilyMembership } from "../../types/family";
import { createClient } from "../supabase/server";

type FamilyMemberRow = {
  id: string;
  family_id: string;
  role: CurrentFamilyMembership["role"];
  display_name: string;
};

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
    .select("id, family_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("家族所属状態を取得できませんでした。");
  }

  if (!data) {
    return null;
  }

  const row = data as FamilyMemberRow;

  return {
    familyId: row.family_id,
    memberId: row.id,
    role: row.role,
    displayName: row.display_name,
  };
}
