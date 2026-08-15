import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import {
  getOwnerDisplayName,
  getUserDisplayName,
} from "../src/lib/family-sharing/membership";

const user = (metadata: Record<string, unknown>, email = "fallback@example.com") =>
  ({ user_metadata: metadata, email }) as User;

test("shared member display names preserve miri and allow up to eight characters", () => {
  assert.equal(getUserDisplayName(user({ full_name: "miri" })), "miri");
  assert.equal(
    getOwnerDisplayName(user({ name: "12345678" })),
    "12345678",
  );
  assert.equal(
    getUserDisplayName(user({ full_name: "123456789" })),
    "12345678",
  );
});

test("shared member display name fallback follows the same eight-character limit", () => {
  assert.equal(getUserDisplayName(user({}, "abcdefghij@example.com")), "abcdefgh");
});
