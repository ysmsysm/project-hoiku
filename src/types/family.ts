export type FamilyMemberRole = "owner" | "member";

export type FamilyMembership = {
  memberId: string;
  familyId: string;
  role: FamilyMemberRole;
  displayName: string;
};

export type CurrentFamilyMembership = FamilyMembership;
