import assert from "node:assert/strict";
import test from "node:test";
import {
  mapSendDailyThanksResponse,
  sendDailyThanks,
  validateSendDailyThanksInput,
} from "../src/lib/family-sharing/send-daily-thanks";
import type {
  SendDailyThanksClient,
  SendDailyThanksInput,
} from "../src/types/daily";

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const preparerMemberId = "44444444-4444-4444-8444-444444444444";
const preparerUserId = "55555555-5555-4555-8555-555555555555";
const senderMemberId = "66666666-6666-4666-8666-666666666666";
const senderUserId = "77777777-7777-4777-8777-777777777777";

const input: SendDailyThanksInput = {
  familyId,
  childId,
  sessionDate: "2026-08-03",
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
    checked_by_member_id: senderMemberId,
    checked_by_user_id: senderUserId,
    checked_by_display_name: "Checker",
    checked_at: "2026-08-03T00:05:00.000Z",
    is_prepared: true,
    prepared_by_member_id: preparerMemberId,
    prepared_by_user_id: preparerUserId,
    prepared_by_display_name: "Preparer",
    prepared_at: "2026-08-03T00:10:00.000Z",
    thanks_sent_at: "2026-08-03T00:15:00.000Z",
    thanks_sent_by_member_id: senderMemberId,
    thanks_sent_by_user_id: senderUserId,
    thanks_sent_by_display_name: "Sender",
    thanks_received_by_member_id: preparerMemberId,
    thanks_received_by_user_id: preparerUserId,
    thanks_received_by_display_name: "Preparer",
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-03T00:15:00.000Z",
    ...overrides,
  };
}

function unsentMetadata(overrides: Record<string, unknown> = {}) {
  return metadata({
    thanks_sent_at: null,
    thanks_sent_by_member_id: null,
    thanks_sent_by_user_id: null,
    thanks_sent_by_display_name: null,
    thanks_received_by_member_id: null,
    thanks_received_by_user_id: null,
    thanks_received_by_display_name: null,
    ...overrides,
  });
}

function clientReturning(
  data: unknown,
  error: unknown = null,
  calls: Array<{ name: string; args: unknown }> = [],
): SendDailyThanksClient {
  return {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data, error });
    },
  };
}

test("calls send_daily_thanks with exactly the four server-owned contract arguments", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const result = await sendDailyThanks(
    clientReturning(
      { status: "success", changed: true, reason: null, session: metadata() },
      null,
      calls,
    ),
    input,
  );
  assert.equal(result.status, "success");
  assert.deepEqual(calls, [
    {
      name: "send_daily_thanks",
      args: {
        p_family_id: familyId,
        p_child_id: childId,
        p_session_date: input.sessionDate,
        p_expected_version: 4,
      },
    },
  ]);
});

test("validates UUIDs, real dates, PostgreSQL integers, and hostile input", async () => {
  for (const invalid of [
    { ...input, familyId: "bad" },
    { ...input, childId: "bad" },
    { ...input, sessionDate: "2026-02-30" },
    { ...input, expectedSessionVersion: 0 },
    { ...input, expectedSessionVersion: 1.5 },
    { ...input, expectedSessionVersion: 2_147_483_648 },
  ]) {
    assert.equal(validateSendDailyThanksInput(invalid)?.kind, "invalid_input");
  }
  const hostile = new Proxy(input, {
    get() {
      throw new Error("hostile input");
    },
  });
  const calls: Array<{ name: string; args: unknown }> = [];
  assert.equal(validateSendDailyThanksInput(hostile)?.kind, "invalid_input");
  assert.equal(
    (await sendDailyThanks(clientReturning(null, null, calls), hostile)).status,
    "client_error",
  );
  assert.deepEqual(calls, []);
});

test("maps changed success and rejects changed version or actor contract violations", async () => {
  const success = await sendDailyThanks(
    clientReturning({
      status: "success",
      changed: true,
      reason: null,
      session: metadata(),
    }),
    input,
  );
  assert.equal(success.status, "success");
  if (success.status === "success") {
    assert.equal(success.changed, true);
    assert.equal(success.session.version, 5);
    assert.equal(success.session.thanksReceivedByMemberId, preparerMemberId);
  }

  for (const session of [
    metadata({ version: 4 }),
    metadata({ is_checked: false, checked_at: null }),
    metadata({ checked_by_member_id: null }),
    metadata({ checked_by_user_id: null }),
    metadata({ checked_by_display_name: null }),
    metadata({ is_prepared: false, prepared_at: null }),
    metadata({ prepared_by_member_id: null }),
    metadata({ thanks_sent_at: null }),
    metadata({ thanks_sent_by_user_id: null }),
    metadata({ thanks_received_by_user_id: null }),
    metadata({ thanks_received_by_member_id: senderMemberId }),
    metadata({ thanks_sent_by_member_id: preparerMemberId }),
  ]) {
    const result = mapSendDailyThanksResponse(
      { status: "success", changed: true, reason: null, session },
      input,
    );
    assert.equal(result.status, "transport_error");
  }

  assert.equal(
    mapSendDailyThanksResponse(
      {
        status: "success",
        changed: true,
        reason: null,
        session: metadata({ version: 2_147_483_647 }),
      },
      { ...input, expectedSessionVersion: 2_147_483_647 },
    ).status,
    "transport_error",
  );
});

test("accepts idempotent success with an arbitrary current version and still validates sent state", () => {
  const result = mapSendDailyThanksResponse(
    {
      status: "success",
      changed: false,
      reason: null,
      session: metadata({ version: 12 }),
    },
    input,
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.changed, false);
    assert.equal(result.session.version, 12);
  }
  assert.equal(
    mapSendDailyThanksResponse(
      {
        status: "success",
        changed: false,
        reason: null,
        session: unsentMetadata({ version: 12 }),
      },
      input,
    ).status,
    "transport_error",
  );
});

test("maps conflict and every known business result without exposing raw payloads", () => {
  const conflict = mapSendDailyThanksResponse(
    {
      status: "conflict",
      changed: false,
      reason: null,
      session: unsentMetadata({ version: 7 }),
    },
    input,
  );
  assert.equal(conflict.status, "conflict");
  assert.equal(
    mapSendDailyThanksResponse(
      {
        status: "conflict",
        changed: false,
        reason: null,
        session: unsentMetadata({ version: input.expectedSessionVersion }),
      },
      input,
    ).status,
    "transport_error",
  );
  assert.equal(
    mapSendDailyThanksResponse(
      {
        status: "conflict",
        changed: false,
        reason: null,
        session: unsentMetadata({ version: 7, family_id: childId }),
      },
      input,
    ).status,
    "transport_error",
  );
  assert.equal(
    mapSendDailyThanksResponse(
      {
        status: "conflict",
        changed: false,
        reason: null,
        session: unsentMetadata({
          version: 7,
          is_prepared: false,
          prepared_at: null,
          prepared_by_member_id: null,
          prepared_by_user_id: null,
          prepared_by_display_name: null,
        }),
      },
      input,
    ).status,
    "transport_error",
  );

  for (const status of ["forbidden", "not_found"] as const) {
    assert.deepEqual(
      mapSendDailyThanksResponse(
        { status, changed: false, reason: null, session: null },
        input,
      ),
      { status, changed: false },
    );
  }
  for (const reason of [
    "invalid_input",
    "preparation_incomplete",
    "recipient_missing",
    "self_recipient",
  ] as const) {
    const session =
      reason === "invalid_input" ? null : unsentMetadata({ version: 4 });
    const result = mapSendDailyThanksResponse(
      { status: "invalid_state", changed: false, reason, session },
      input,
    );
    assert.equal(result.status, "invalid_state");
    if (result.status === "invalid_state") assert.equal(result.reason, reason);
  }
  const integerLimit = mapSendDailyThanksResponse(
    {
      status: "invalid_state",
      changed: false,
      reason: "invalid_input",
      session: unsentMetadata({ version: 2_147_483_647 }),
    },
    { ...input, expectedSessionVersion: 2_147_483_647 },
  );
  assert.equal(integerLimit.status, "invalid_state");
  if (integerLimit.status === "invalid_state") {
    assert.equal(integerLimit.reason, "invalid_input");
    assert.equal(integerLimit.session?.version, 2_147_483_647);
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
    { status: "unknown", changed: false, reason: null, session: null },
    {
      status: "invalid_state",
      changed: false,
      reason: "secret_reason",
      session: null,
    },
    {
      status: "success",
      changed: true,
      reason: null,
      session: metadata({ family_id: childId }),
    },
    {
      status: "success",
      changed: true,
      reason: null,
      session: metadata({ child_id: familyId }),
    },
    {
      status: "success",
      changed: true,
      reason: null,
      session: metadata({ session_date: "2026-08-04" }),
    },
    hostile,
  ]) {
    const result = mapSendDailyThanksResponse(response, input);
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "invalid_response");
    }
  }
});

test("maps thrown RPC calls and response errors as transport failures", async () => {
  const rejected = await sendDailyThanks(
    {
      rpc() {
        return Promise.reject(new Error("offline"));
      },
    },
    input,
  );
  assert.equal(rejected.status, "transport_error");

  const responseError = await sendDailyThanks(
    clientReturning(null, { message: "database unavailable", code: "PGRST000" }),
    input,
  );
  assert.equal(responseError.status, "transport_error");

  const hostileEnvelope = await sendDailyThanks(
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
  if (hostileEnvelope.status === "transport_error") {
    assert.equal(hostileEnvelope.error.kind, "invalid_response");
  }
});
