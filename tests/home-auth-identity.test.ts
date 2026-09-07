import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUserIdentityResultWithClient } from "../src/lib/auth/session";

const createClient = (
  getClaims: () => Promise<unknown>,
): Pick<SupabaseClient, "auth"> =>
  ({
    auth: { getClaims },
  }) as unknown as Pick<SupabaseClient, "auth">;

test("home auth identity uses one verified claims lookup", async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    return {
      data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    };
  });

  assert.deepEqual(await getCurrentUserIdentityResultWithClient(client), {
    status: "authenticated",
    user: { id: "11111111-1111-4111-8111-111111111111" },
  });
  assert.equal(calls, 1);
});

test("home auth identity keeps missing sessions local", async () => {
  const client = createClient(async () => ({ data: null, error: null }));

  assert.deepEqual(await getCurrentUserIdentityResultWithClient(client), {
    status: "unauthenticated",
  });
});

test("home auth identity fails closed when claims verification fails", async () => {
  const authError = {
    name: "AuthInvalidJwtError",
    message: "invalid JWT",
  };
  const client = createClient(async () => ({ data: null, error: authError }));

  const result = await getCurrentUserIdentityResultWithClient(client);

  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.error, authError);
  }
});
