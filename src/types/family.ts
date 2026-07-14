export type FamilyMemberRole = "owner" | "member";

export type FamilyMembership = {
  memberId: string;
  familyId: string;
  role: FamilyMemberRole;
  displayName: string;
  sharingStartedAt: string | null;
  isSharingStarted: boolean;
  isPreSharingOwner: boolean;
};

export type CurrentFamilyMembership = FamilyMembership;

export type InviteActionError =
  | "not_authenticated"
  | "not_family_member"
  | "not_family_owner"
  | "invalid_token"
  | "invite_unavailable"
  | "already_family_member"
  | "invalid_display_name"
  | "unknown";

export type CreateFamilyInviteActionResult =
  | {
      ok: true;
      invitePath: string;
      expiresAt: string;
    }
  | { ok: false; error: InviteActionError; message: string };

export type RevokeFamilyInviteActionResult =
  | { ok: true; revoked: boolean }
  | { ok: false; error: InviteActionError; message: string };

export type CurrentFamilyInviteStatus =
  | { ok: true; hasActiveInvite: boolean; expiresAt: string | null }
  | { ok: false; error: InviteActionError };

export type FamilyInvitePublicStatus = {
  valid: boolean;
  expiresAt: string | null;
};

export type AcceptFamilyInviteActionResult =
  | { ok: false; error: InviteActionError; message: string };
