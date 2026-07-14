import type { CurrentFamilyMembership } from "../../types/family";

export const currentFamilyMembershipSelect =
  "id, family_id, role, display_name, families!family_members_family_id_fkey(sharing_started_at)";

type FamilyRow = {
  sharing_started_at: string | null;
};

export type CurrentFamilyMembershipRow = {
  id: string;
  family_id: string;
  role: CurrentFamilyMembership["role"];
  display_name: string;
  families: FamilyRow | FamilyRow[] | null;
};

const getFamilyRow = (families: CurrentFamilyMembershipRow["families"]) =>
  Array.isArray(families) ? (families[0] ?? null) : families;

export function mapCurrentFamilyMembershipRow(
  row: CurrentFamilyMembershipRow,
): CurrentFamilyMembership {
  const family = getFamilyRow(row.families);
  const sharingStartedAt = family?.sharing_started_at ?? null;

  return {
    familyId: row.family_id,
    memberId: row.id,
    role: row.role,
    displayName: row.display_name,
    sharingStartedAt,
    isSharingStarted: sharingStartedAt !== null,
    isPreSharingOwner: row.role === "owner" && sharingStartedAt === null,
  };
}
