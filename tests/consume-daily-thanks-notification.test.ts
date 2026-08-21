import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeDailyThanksNotification,
  mapConsumeDailyThanksNotificationResponse,
  validateConsumeDailyThanksNotificationInput,
} from "../src/lib/family-sharing/consume-daily-thanks-notification";
import type {
  ConsumeDailyThanksNotificationClient,
  ConsumeDailyThanksNotificationInput,
} from "../src/types/daily";

const input: ConsumeDailyThanksNotificationInput = {
  familyId: "11111111-1111-4111-8111-111111111111",
  childId: "22222222-2222-4222-8222-222222222222",
  sessionDate: "2026-08-21",
  dailySessionId: "33333333-3333-4333-8333-333333333333",
  thanksSentAt: "2026-08-21T03:00:00.000Z",
};

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    status: "success",
    consumed: true,
    should_display: true,
    daily_session_id: input.dailySessionId,
    thanks_sent_at: input.thanksSentAt,
    ...overrides,
  };
}

test("calls the receiver consume RPC with the exact event scope", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client: ConsumeDailyThanksNotificationClient = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: envelope(), error: null });
    },
  };

  const result = await consumeDailyThanksNotification(client, input);

  assert.equal(result.status, "success");
  assert.deepEqual(calls, [
    {
      name: "consume_daily_thanks_notification",
      args: {
        p_family_id: input.familyId,
        p_child_id: input.childId,
        p_session_date: input.sessionDate,
        p_daily_session_id: input.dailySessionId,
        p_thanks_sent_at: input.thanksSentAt,
      },
    },
  ]);
});

test("one database receipt suppresses reload and another-device retries", async () => {
  const consumedEvents = new Set<string>();
  const client: ConsumeDailyThanksNotificationClient = {
    rpc(_name, args) {
      const key = `${args.p_daily_session_id}:${args.p_thanks_sent_at}`;
      const consumed = !consumedEvents.has(key);
      consumedEvents.add(key);
      return Promise.resolve({
        error: null,
        data: envelope({ consumed, should_display: consumed }),
      });
    },
  };

  const firstDevice = await consumeDailyThanksNotification(client, input);
  const reload = await consumeDailyThanksNotification(client, input);
  const secondDevice = await consumeDailyThanksNotification(client, input);

  assert.deepEqual(
    [firstDevice, reload, secondDevice].map((result) =>
      result.status === "success" ? result.shouldDisplay : null,
    ),
    [true, false, false],
  );
});

test("a new thanks timestamp is a new displayable event", async () => {
  const nextInput = {
    ...input,
    thanksSentAt: "2026-08-21T04:00:00.000Z",
  };
  const result = mapConsumeDailyThanksNotificationResponse(
    envelope({ thanks_sent_at: nextInput.thanksSentAt }),
    nextInput,
  );

  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.consumed, true);
    assert.equal(result.shouldDisplay, true);
  }
});

test("sender, no-thanks and non-first outcomes never request display", () => {
  for (const response of [
    {
      status: "forbidden",
      consumed: false,
      should_display: false,
      daily_session_id: null,
      thanks_sent_at: null,
    },
    envelope({ consumed: false, should_display: false }),
    envelope({
      consumed: false,
      should_display: false,
      thanks_sent_at: null,
    }),
  ]) {
    const result = mapConsumeDailyThanksNotificationResponse(response, input);
    assert.notEqual(result.status, "transport_error");
    if (result.status !== "transport_error" && result.status !== "client_error") {
      assert.equal(result.shouldDisplay, false);
    }
  }
});

test("rejects invalid input, stale envelopes and transport failures", async () => {
  assert.equal(
    validateConsumeDailyThanksNotificationInput({
      ...input,
      dailySessionId: "bad",
    })?.kind,
    "invalid_input",
  );
  assert.equal(
    validateConsumeDailyThanksNotificationInput({
      ...input,
      thanksSentAt: "not-a-date",
    })?.kind,
    "invalid_input",
  );
  assert.equal(
    mapConsumeDailyThanksNotificationResponse(
      envelope({ daily_session_id: input.childId }),
      input,
    ).status,
    "transport_error",
  );
  assert.equal(
    mapConsumeDailyThanksNotificationResponse(
      envelope({ thanks_sent_at: "2026-08-21T02:00:00.000Z" }),
      input,
    ).status,
    "transport_error",
  );

  const result = await consumeDailyThanksNotification(
    {
      rpc() {
        return Promise.reject(new Error("offline"));
      },
    },
    input,
  );
  assert.equal(result.status, "transport_error");
});
