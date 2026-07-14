import assert from "node:assert/strict";
import test from "node:test";
import {
  mapCurrentFamilyMembershipRow,
  mapCurrentFamilyMembershipRowWithSharingStartedAt,
  type CurrentFamilyMembershipRow,
} from "../src/lib/family-sharing/membership-query";

const sharingStartedAt = "2026-07-14T09:00:00.000Z";

const membershipRow = (
  role: CurrentFamilyMembershipRow["role"],
  families: CurrentFamilyMembershipRow["families"] = {
    sharing_started_at: sharingStartedAt,
  },
): CurrentFamilyMembershipRow => ({
  id: `${role}-member-id`,
  family_id: "family-id",
  role,
  display_name: role === "owner" ? "親" : "家",
  families,
});

test("maps owner membership as shared when sharing has started", () => {
  const membership = mapCurrentFamilyMembershipRow(membershipRow("owner"));

  assert.equal(membership.role, "owner");
  assert.equal(membership.familyId, "family-id");
  assert.equal(membership.sharingStartedAt, sharingStartedAt);
  assert.equal(membership.isSharingStarted, true);
  assert.equal(membership.isPreSharingOwner, false);
});

test("maps member membership as shared when sharing has started", () => {
  const membership = mapCurrentFamilyMembershipRow(membershipRow("member"));

  assert.equal(membership.role, "member");
  assert.equal(membership.familyId, "family-id");
  assert.equal(membership.sharingStartedAt, sharingStartedAt);
  assert.equal(membership.isSharingStarted, true);
  assert.equal(membership.isPreSharingOwner, false);
});

test("maps only pre-sharing memberships as not shared", () => {
  const ownerMembership = mapCurrentFamilyMembershipRow(
    membershipRow("owner", { sharing_started_at: null }),
  );
  const memberMembership = mapCurrentFamilyMembershipRow(
    membershipRow("member", { sharing_started_at: null }),
  );

  assert.equal(ownerMembership.isSharingStarted, false);
  assert.equal(ownerMembership.isPreSharingOwner, true);
  assert.equal(memberMembership.isSharingStarted, false);
  assert.equal(memberMembership.isPreSharingOwner, false);
});

test("uses explicit family sharing status when embedded family data is missing", () => {
  const row = membershipRow("member", null);
  const embeddedMembership = mapCurrentFamilyMembershipRow(row);
  const explicitMembership = mapCurrentFamilyMembershipRowWithSharingStartedAt(
    row,
    sharingStartedAt,
  );

  assert.equal(embeddedMembership.isSharingStarted, false);
  assert.equal(explicitMembership.role, "member");
  assert.equal(explicitMembership.familyId, "family-id");
  assert.equal(explicitMembership.sharingStartedAt, sharingStartedAt);
  assert.equal(explicitMembership.isSharingStarted, true);
});
