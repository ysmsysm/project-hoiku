import type { ChildProfile } from "../../types/child";

export type SaveSharedChildProfileInput = {
  familyId: string;
  childId: string;
  childProfile: ChildProfile;
};

type ChildrenUpdate = {
  name: string;
  icon_type: ChildProfile["iconType"];
  icon_id: ChildProfile["iconId"];
  icon_url: string | null;
};

type ChildrenUpdateQuery = {
  eq: (
    column: string,
    value: string,
  ) => ChildrenUpdateQuery;
  select: (columns: "id") => {
    maybeSingle: () => PromiseLike<{
      data: { id: string } | null;
      error: unknown;
    }>;
  };
};

export type SharedChildProfileClient = {
  from: (table: "children") => {
    update: (value: ChildrenUpdate) => ChildrenUpdateQuery;
  };
};

export function toChildrenUpdate(profile: ChildProfile): ChildrenUpdate {
  const iconUrl = profile.iconType === "image" ? profile.iconUrl : null;

  return {
    name: profile.name,
    icon_type: profile.iconType,
    icon_id: profile.iconId,
    icon_url: iconUrl,
  };
}

export async function saveSharedChildProfile(
  supabase: SharedChildProfileClient,
  input: SaveSharedChildProfileInput,
) {
  assertNonEmptyId(input.familyId, "familyId");
  assertNonEmptyId(input.childId, "childId");

  const { data, error } = await supabase
    .from("children")
    .update(toChildrenUpdate(input.childProfile))
    .eq("id", input.childId)
    .eq("family_id", input.familyId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("shared_child_profile_not_found");
  }
}

function assertNonEmptyId(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`missing_${label}`);
  }
}
