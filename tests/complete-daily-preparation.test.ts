import assert from "node:assert/strict";
import test from "node:test";
import {
  completeDailyPreparation,
  mapCompleteDailyPreparationResponse,
  validateCompleteDailyPreparationInput,
} from "../src/lib/family-sharing/complete-daily-preparation";
import type {
  CompleteDailyPreparationInput,
  DailyDataClient,
} from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const memberId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const sessionDate = "2026-08-03";
const input: CompleteDailyPreparationInput = {
  familyId,
  childId,
  sessionDate,
  expectedSessionVersion: 4,
};

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    session_id: sessionId,
    family_id: familyId,
    child_id: childId,
    session_date: sessionDate,
    version: 5,
    is_checked: true,
    checked_by_member_id: memberId,
    checked_by_user_id: userId,
    checked_by_display_name: "パパ",
    checked_at: "2026-08-03T00:05:00.000Z",
    is_prepared: true,
    prepared_by_member_id: memberId,
    prepared_by_user_id: userId,
    prepared_by_display_name: "ママ",
    prepared_at: "2026-08-03T00:10:00.000Z",
    thanks_sent_at: null,
    thanks_sent_by_member_id: null,
    thanks_sent_by_user_id: null,
    thanks_sent_by_display_name: null,
    thanks_received_by_member_id: null,
    thanks_received_by_user_id: null,
    thanks_received_by_display_name: null,
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-03T00:10:00.000Z",
    ...overrides,
  };
}

function clientReturning(
  data: unknown,
  error: unknown = null,
  calls: Array<{ name: string; args: unknown }> = [],
): DailyDataClient {
  return {
    async rpc(functionName, args) {
      calls.push({ name: functionName, args });
      return { data, error };
    },
  };
}

test("calls complete_daily_preparation with exactly the four session arguments", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const result = await completeDailyPreparation(
    clientReturning(
      { status: "success", changed: true, session: metadata() },
      null,
      calls,
    ),
    input,
  );
  assert.equal(result.status, "success");
  assert.deepEqual(calls, [
    {
      name: "complete_daily_preparation",
      args: {
        p_family_id: familyId,
        p_child_id: childId,
        p_session_date: sessionDate,
        p_expected_version: 4,
      },
    },
  ]);
  assert.equal(JSON.stringify(calls).includes("item"), false);
  assert.equal(JSON.stringify(calls).includes("session_id"), false);
});

test("validates UUIDs, calendar dates, and positive PostgreSQL session versions", () => {
  assert.equal(validateCompleteDailyPreparationInput(input), null);
  for (const invalid of [
    { ...input, familyId: "bad" },
    { ...input, childId: "bad" },
    { ...input, sessionDate: "2026-02-30" },
    { ...input, expectedSessionVersion: 0 },
    { ...input, expectedSessionVersion: -1 },
    { ...input, expectedSessionVersion: 1.5 },
    { ...input, expectedSessionVersion: 2_147_483_648 },
  ]) {
    assert.equal(
      validateCompleteDailyPreparationInput(invalid)?.kind,
      "invalid_input",
    );
  }
  // @ts-expect-error Runtime validation must reject an untyped string version.
  assert.equal(validateCompleteDailyPreparationInput({ ...input, expectedSessionVersion: "1" })?.kind, "invalid_input");
  assert.equal(validateCompleteDailyPreparationInput(null)?.kind, "invalid_input");
});

test("rejects hostile input without calling the RPC or throwing", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const hostileInput = new Proxy(input, {
    get() {
      throw new Error("hostile input getter");
    },
  });
  assert.equal(
    validateCompleteDailyPreparationInput(hostileInput)?.kind,
    "invalid_input",
  );
  const result = await completeDailyPreparation(
    clientReturning(null, null, calls),
    hostileInput,
  );
  assert.equal(result.status, "client_error");
  assert.deepEqual(calls, []);
});

test("maps changed success metadata including actors and nullable thanks fields", async () => {
  const result = await completeDailyPreparation(
    clientReturning({ status: "success", changed: true, session: metadata() }),
    input,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.changed, true);
  assert.equal(result.session.version, 5);
  assert.equal(result.session.checkedAt, "2026-08-03T00:05:00.000Z");
  assert.equal(result.session.completedAt, "2026-08-03T00:10:00.000Z");
  assert.equal(result.session.completedByDisplayName, "ママ");
  assert.equal(result.session.thanksSentAt, null);
  assert.equal("items" in result.session, false);
});

test("accepts prepared success no-op with a current version unrelated to expected+1", async () => {
  const result = await completeDailyPreparation(
    clientReturning({
      status: "success",
      changed: false,
      session: metadata({ version: 12 }),
    }),
    input,
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.changed, false);
    assert.equal(result.session.version, 12);
  }
});

test("rejects malformed changed success state and version contracts", () => {
  for (const session of [
    metadata({ version: 4 }),
    metadata({ is_checked: false, checked_at: null }),
    metadata({ is_prepared: false, prepared_at: null }),
  ]) {
    const result = mapCompleteDailyPreparationResponse(
      { status: "success", changed: true, session },
      input,
    );
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "invalid_response");
    }
  }
});

test("maps conflict without applying its partial session", async () => {
  const result = await completeDailyPreparation(
    clientReturning({
      status: "conflict",
      changed: false,
      session: metadata({
        version: 7,
        is_prepared: false,
        prepared_at: null,
        prepared_by_member_id: null,
        prepared_by_user_id: null,
        prepared_by_display_name: null,
      }),
    }),
    input,
  );
  assert.equal(result.status, "conflict");
  if (result.status === "conflict") assert.equal(result.session.version, 7);
});

test("maps all business statuses and known or absent invalid-state reasons", async () => {
  for (const status of ["forbidden", "not_found"] as const) {
    const result = await completeDailyPreparation(
      clientReturning({ status, changed: false, session: null }),
      input,
    );
    assert.equal(result.status, status);
  }
  for (const reason of [
    "daily_check_incomplete",
    "preparation_items_incomplete",
  ] as const) {
    const result = await completeDailyPreparation(
      clientReturning({
        status: "invalid_state",
        reason,
        changed: false,
        session: metadata({
          is_prepared: false,
          prepared_at: null,
          prepared_by_member_id: null,
          prepared_by_user_id: null,
          prepared_by_display_name: null,
        }),
      }),
      input,
    );
    assert.equal(result.status, "invalid_state");
    if (result.status === "invalid_state") assert.equal(result.reason, reason);
  }
  assert.deepEqual(
    await completeDailyPreparation(
      clientReturning({ status: "invalid_state", changed: false, session: null }),
      input,
    ),
    { status: "invalid_state", changed: false },
  );
});

test("rejects unknown statuses, reasons, scope mismatches, and hostile responses", async () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("hostile getter");
      },
    },
  );
  for (const data of [
    {},
    { status: "unknown", changed: false, session: null },
    {
      status: "invalid_state",
      reason: "internal_secret",
      changed: false,
      session: metadata({ is_prepared: false, prepared_at: null }),
    },
    {
      status: "success",
      changed: true,
      session: metadata({ family_id: childId }),
    },
    hostile,
  ]) {
    const result = await completeDailyPreparation(clientReturning(data), input);
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "invalid_response");
    }
  }
});

test("distinguishes RPC rejection and response errors from invalid responses", async () => {
  const rejected: DailyDataClient = {
    async rpc() {
      throw new Error("network secret");
    },
  };
  const first = await completeDailyPreparation(rejected, input);
  const second = await completeDailyPreparation(
    clientReturning(null, { message: "database secret", code: "XX000" }),
    input,
  );
  for (const result of [first, second]) {
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "rpc_error");
    }
  }
});
