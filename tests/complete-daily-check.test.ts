import assert from "node:assert/strict";
import test from "node:test";
import {
  completeDailyCheck,
  mapCompleteDailyCheckResponse,
  validateCompleteDailyCheckInput,
} from "../src/lib/family-sharing/complete-daily-check";
import type {
  CompleteDailyCheckClient,
  CompleteDailyCheckInput,
} from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const checkerMemberId = "44444444-4444-4444-8444-444444444444";
const checkerUserId = "55555555-5555-4555-8555-555555555555";
const preparerMemberId = "66666666-6666-4666-8666-666666666666";
const preparerUserId = "77777777-7777-4777-8777-777777777777";
const senderMemberId = "88888888-8888-4888-8888-888888888888";
const senderUserId = "99999999-9999-4999-8999-999999999999";

const input: CompleteDailyCheckInput = {
  familyId,
  childId,
  sessionDate: "2026-08-05",
  expectedSessionVersion: 4,
};

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    session_id: sessionId,
    family_id: familyId,
    child_id: childId,
    session_date: input.sessionDate,
    version: 5,
    is_checked: true,
    checked_by_member_id: checkerMemberId,
    checked_by_user_id: checkerUserId,
    checked_by_display_name: "Checker",
    checked_at: "2026-08-05T00:05:00.000Z",
    is_prepared: false,
    prepared_by_member_id: null,
    prepared_by_user_id: null,
    prepared_by_display_name: null,
    prepared_at: null,
    thanks_sent_at: null,
    thanks_sent_by_member_id: null,
    thanks_sent_by_user_id: null,
    thanks_sent_by_display_name: null,
    thanks_received_by_member_id: null,
    thanks_received_by_user_id: null,
    thanks_received_by_display_name: null,
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:05:00.000Z",
    ...overrides,
  };
}

function uncheckedMetadata(overrides: Record<string, unknown> = {}) {
  return metadata({
    version: 6,
    is_checked: false,
    checked_by_member_id: null,
    checked_by_user_id: null,
    checked_by_display_name: null,
    checked_at: null,
    ...overrides,
  });
}

function preparedMetadata(overrides: Record<string, unknown> = {}) {
  return metadata({
    is_prepared: true,
    prepared_by_member_id: preparerMemberId,
    prepared_by_user_id: preparerUserId,
    prepared_by_display_name: "Preparer",
    prepared_at: "2026-08-05T00:10:00.000Z",
    ...overrides,
  });
}

function sentMetadata(overrides: Record<string, unknown> = {}) {
  return preparedMetadata({
    thanks_sent_at: "2026-08-05T00:15:00.000Z",
    thanks_sent_by_member_id: senderMemberId,
    thanks_sent_by_user_id: senderUserId,
    thanks_sent_by_display_name: "Sender",
    thanks_received_by_member_id: preparerMemberId,
    thanks_received_by_user_id: preparerUserId,
    thanks_received_by_display_name: "Preparer",
    ...overrides,
  });
}

function clientReturning(
  data: unknown,
  error: unknown = null,
  calls: Array<{ name: string; args: unknown }> = [],
): CompleteDailyCheckClient {
  return {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data, error });
    },
  };
}

test("calls complete_daily_check with exactly the four client-owned scope arguments", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const result = await completeDailyCheck(
    clientReturning({ status: "success", session: metadata() }, null, calls),
    input,
  );
  assert.equal(result.status, "success");
  assert.deepEqual(calls, [
    {
      name: "complete_daily_check",
      args: {
        p_family_id: familyId,
        p_child_id: childId,
        p_session_date: input.sessionDate,
        p_expected_version: 4,
      },
    },
  ]);
});

test("validates UUIDs, calendar dates, incrementable PostgreSQL versions, and hostile input", async () => {
  for (const invalid of [
    { ...input, familyId: "bad" },
    { ...input, childId: "bad" },
    { ...input, sessionDate: "2026-02-30" },
    { ...input, expectedSessionVersion: 0 },
    { ...input, expectedSessionVersion: 1.5 },
    { ...input, expectedSessionVersion: 2_147_483_647 },
    { ...input, expectedSessionVersion: 2_147_483_648 },
  ]) {
    assert.equal(validateCompleteDailyCheckInput(invalid)?.kind, "invalid_input");
  }
  const hostile = new Proxy(input, {
    get() {
      throw new Error("hostile input");
    },
  });
  const calls: Array<{ name: string; args: unknown }> = [];
  assert.equal(validateCompleteDailyCheckInput(hostile)?.kind, "invalid_input");
  assert.equal(
    (await completeDailyCheck(clientReturning(null, null, calls), hostile)).status,
    "client_error",
  );
  assert.deepEqual(calls, []);
});

test("derives first success and checked no-op from the returned session version", () => {
  const changed = mapCompleteDailyCheckResponse(
    { status: "success", session: metadata() },
    input,
  );
  assert.equal(changed.status, "success");
  if (changed.status === "success") {
    assert.equal(changed.changed, true);
    assert.equal(changed.session.checkedByMemberId, checkerMemberId);
  }

  const noOp = mapCompleteDailyCheckResponse(
    { status: "success", session: metadata({ version: 4 }) },
    input,
  );
  assert.equal(noOp.status, "success");
  if (noOp.status === "success") assert.equal(noOp.changed, false);

  for (const version of [3, 6, 12]) {
    assert.equal(
      mapCompleteDailyCheckResponse(
        { status: "success", session: metadata({ version }) },
        input,
      ).status,
      "transport_error",
    );
  }
});

test("accepts a changed recheck while preserving preparation metadata", () => {
  const result = mapCompleteDailyCheckResponse(
    {
      status: "success",
      session: preparedMetadata({
        version: 5,
        checked_by_member_id: childId,
        checked_by_user_id: familyId,
        checked_by_display_name: "Latest",
        checked_at: "2026-08-05T00:20:00.000Z",
      }),
    },
    input,
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.changed, true);
    assert.equal(result.session.checkedByDisplayName, "Latest");
    assert.equal(result.session.completedByDisplayName, "Preparer");
    assert.equal(result.session.completedAt, "2026-08-05T00:10:00.000Z");
  }
});

test("requires complete checked actors and coherent prepared and thanks actor tuples", () => {
  assert.equal(
    mapCompleteDailyCheckResponse(
      { status: "success", session: preparedMetadata() },
      input,
    ).status,
    "success",
  );
  assert.equal(
    mapCompleteDailyCheckResponse(
      { status: "success", session: sentMetadata() },
      input,
    ).status,
    "success",
  );
  for (const session of [
    metadata({ is_checked: false, checked_at: null }),
    metadata({ checked_by_member_id: null }),
    metadata({ checked_by_user_id: null }),
    metadata({ checked_by_display_name: null }),
    metadata({ prepared_by_member_id: preparerMemberId }),
    preparedMetadata({ prepared_by_user_id: null }),
    metadata({ thanks_sent_by_member_id: senderMemberId }),
    sentMetadata({ thanks_received_by_user_id: null }),
    sentMetadata({ thanks_received_by_member_id: senderMemberId }),
    sentMetadata({ thanks_sent_by_member_id: preparerMemberId }),
    sentMetadata({
      is_prepared: false,
      prepared_at: null,
      prepared_by_member_id: null,
      prepared_by_user_id: null,
      prepared_by_display_name: null,
    }),
  ]) {
    assert.equal(
      mapCompleteDailyCheckResponse({ status: "success", session }, input).status,
      "transport_error",
    );
  }
});

test("maps validated conflicts without applying their metadata", () => {
  for (const session of [uncheckedMetadata(), metadata({ version: 6 })]) {
    const result = mapCompleteDailyCheckResponse(
      { status: "conflict", session },
      input,
    );
    assert.equal(result.status, "conflict");
    if (result.status === "conflict") assert.equal(result.changed, false);
  }
  assert.equal(
    mapCompleteDailyCheckResponse(
      { status: "conflict", session: uncheckedMetadata({ version: 4 }) },
      input,
    ).status,
    "transport_error",
  );
});

test("maps exact non-success envelopes and rejects unexpected reasons or sessions", () => {
  for (const status of ["forbidden", "not_found", "invalid_state"] as const) {
    assert.deepEqual(
      mapCompleteDailyCheckResponse({ status, session: null }, input),
      { status, changed: false },
    );
  }
  for (const response of [
    { status: "invalid_state", reason: "secret", session: null },
    { status: "forbidden", session: metadata() },
    { status: "not_found", session: undefined },
  ]) {
    assert.equal(
      mapCompleteDailyCheckResponse(response, input).status,
      "transport_error",
    );
  }
});

test("rejects malformed, unknown, out-of-scope, and hostile responses", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("hostile response");
      },
    },
  );
  for (const response of [
    null,
    {},
    { status: "unknown", session: null },
    { status: "success", session: metadata({ family_id: childId }) },
    { status: "success", session: metadata({ child_id: familyId }) },
    { status: "success", session: metadata({ session_date: "2026-08-06" }) },
    { status: "success", session: metadata({ created_at: "not-a-date" }) },
    hostile,
  ]) {
    const result = mapCompleteDailyCheckResponse(response, input);
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "invalid_response");
    }
  }
});

test("maps thrown calls, response errors, and hostile response envelopes as transport failures", async () => {
  const rejected = await completeDailyCheck(
    { rpc: () => Promise.reject(new Error("offline")) },
    input,
  );
  assert.equal(rejected.status, "transport_error");

  const responseError = await completeDailyCheck(
    clientReturning(null, { message: "database unavailable", code: "PGRST000" }),
    input,
  );
  assert.equal(responseError.status, "transport_error");

  const hostileEnvelope = await completeDailyCheck(
    {
      rpc() {
        const response: { data: unknown; error: unknown } = new Proxy(
          { data: null, error: null },
          {
            get(_target, property) {
              if (property === "then") return undefined;
              throw new Error("hostile envelope");
            },
          },
        );
        return Promise.resolve(response);
      },
    },
    input,
  );
  assert.equal(hostileEnvelope.status, "transport_error");
});
