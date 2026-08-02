import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { before } from "node:test";
import type {
  DailyDataClient,
  DailyItem,
  DailySession,
  LoadDailyDataInput,
} from "../src/types/daily";
import type { SharedDailyState } from "../src/types/shared-daily";

const serverOnlyStubDirectory = join(
  process.cwd(),
  ".tmp-tests",
  "node_modules",
  "server-only",
);
mkdirSync(serverOnlyStubDirectory, { recursive: true });
writeFileSync(join(serverOnlyStubDirectory, "index.js"), "module.exports = {};\n");

let loadSharedDailyDataForFamilyWithDependencies: typeof import(
  "../src/lib/family-sharing/shared-daily-data-server"
)["loadSharedDailyDataForFamilyWithDependencies"];

before(async () => {
  const serverModule = await import(
    "../src/lib/family-sharing/shared-daily-data-server"
  );
  loadSharedDailyDataForFamilyWithDependencies =
    serverModule.loadSharedDailyDataForFamilyWithDependencies;
});

const familyId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const sessionDate = "2026-08-01";
const sessionId = "33333333-3333-4333-8333-333333333333";
const dailyItemId = "44444444-4444-4444-8444-444444444444";
const itemTemplateId = "55555555-5555-4555-8555-555555555555";
const input: LoadDailyDataInput = { familyId, childId, sessionDate };

const client: DailyDataClient = {
  rpc() {
    throw new Error("The injected loader owns RPC execution in this test");
  },
};

function dailyItem(): DailyItem {
  return {
    dailyItemId,
    dailySessionId: sessionId,
    familyId,
    itemTemplateId,
    kind: "regular",
    isAdHoc: false,
    name: "着替え",
    requiredQuantity: 3,
    observedQuantity: 1,
    shortageCount: 2,
    quantity: 3,
    unit: "枚",
    roughState: null,
    isChecked: true,
    isPrepared: false,
    isDeferred: false,
    isCarryover: false,
    carryoverPendingShortageCount: null,
    carriedFromDailyItemId: null,
    carryoverProcessedAt: null,
    carryoverResolvedAt: null,
    dueDate: null,
    sortOrder: 0,
    version: 4,
    deletedAt: null,
    updatedByMemberId: null,
    updatedByUserId: null,
    updatedByDisplayName: "パパ",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:05:00.000Z",
  };
}

function dailySession(): DailySession {
  return {
    dailySessionId: sessionId,
    familyId,
    childId,
    sessionDate,
    version: 2,
    isChecked: true,
    checkedAt: "2026-08-01T00:05:00.000Z",
    checkedByMemberId: null,
    checkedByUserId: null,
    checkedByDisplayName: "パパ",
    isCompleted: false,
    completedAt: null,
    completedByMemberId: null,
    completedByUserId: null,
    completedByDisplayName: null,
    thanksSent: false,
    thanksSentAt: null,
    thanksSentByMemberId: null,
    thanksSentByUserId: null,
    thanksSentByDisplayName: null,
    thanksReceivedByMemberId: null,
    thanksReceivedByUserId: null,
    thanksReceivedByDisplayName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:05:00.000Z",
    items: [dailyItem()],
  };
}

function successState(): SharedDailyState {
  const session = dailySession();

  return {
    status: "success",
    sessionDate,
    session,
    preparationSession: {
      date: sessionDate,
      checkedBy: "パパ",
      confirmedAt: "2026-08-01T00:05:00.000Z",
      completedAt: null,
      items: [
        {
          id: itemTemplateId,
          dailyItemId,
          itemTemplateId,
          dailyItemVersion: 4,
          dailyKind: "regular",
          name: "着替え",
          count: 2,
          unit: "枚",
          checked: false,
          later: false,
          carryover: false,
          source: "locker",
          dueDate: null,
        },
      ],
      thanksSent: false,
    },
    checkView: {
      items: [
        {
          id: itemTemplateId,
          dailyItemId,
          itemTemplateId,
          version: 4,
          name: "着替え",
          unit: "枚",
          requiredQuantity: 3,
          observedQuantity: 1,
          isChecked: true,
        },
      ],
    },
  };
}

function roundTrip(state: SharedDailyState) {
  return JSON.parse(JSON.stringify(state)) as unknown;
}

test("executes the production dependency boundary once with the original input", async () => {
  let createClientCalls = 0;
  const loaderCalls: Array<{
    client: DailyDataClient;
    input: LoadDailyDataInput;
  }> = [];
  const originalInput = structuredClone(input);
  const expected = { status: "not_found", sessionDate } as const;

  const result = await loadSharedDailyDataForFamilyWithDependencies(input, {
    createClient: async () => {
      createClientCalls += 1;
      return client;
    },
    loadDailyDataForDate: async (receivedClient, receivedInput) => {
      loaderCalls.push({ client: receivedClient, input: receivedInput });
      return expected;
    },
  });

  assert.equal(createClientCalls, 1);
  assert.equal(loaderCalls.length, 1);
  assert.equal(loaderCalls[0].client, client);
  assert.equal(loaderCalls[0].input, input);
  assert.deepEqual(loaderCalls[0].input, { familyId, childId, sessionDate });
  assert.deepEqual(input, originalInput);
  assert.equal(result, expected);
});

test("preserves a complete success state and its JSON round-trip", async () => {
  const expected = successState();
  const result = await loadSharedDailyDataForFamilyWithDependencies(input, {
    createClient: async () => client,
    loadDailyDataForDate: async () => expected,
  });

  assert.equal(result, expected);
  assert.deepEqual(roundTrip(result), result);
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.session.dailySessionId, sessionId);
    assert.equal(result.session.sessionDate, sessionDate);
    assert.equal(result.session.items[0].dailyItemId, dailyItemId);
    assert.equal(result.preparationSession.items[0].dailyItemId, dailyItemId);
    assert.equal(result.checkView.items[0].dailyItemId, dailyItemId);
  }
});

test("preserves not_found without creating a session or falling back", async () => {
  const expected: SharedDailyState = { status: "not_found", sessionDate };
  const result = await loadSharedDailyDataForFamilyWithDependencies(input, {
    createClient: async () => client,
    loadDailyDataForDate: async () => expected,
  });

  assert.equal(result, expected);
  assert.deepEqual(roundTrip(result), expected);
  assert.equal("session" in result, false);
});

test("preserves business, transport, and validation states unchanged", async () => {
  const states: SharedDailyState[] = [
    { status: "forbidden", sessionDate },
    { status: "invalid_state", sessionDate },
    {
      status: "transport_error",
      sessionDate,
      error: { kind: "rpc_error", code: "PGRST000", message: "fetch failed" },
    },
    {
      status: "invalid_response",
      sessionDate,
      error: {
        kind: "invalid_response",
        message: "invalid payload",
        issues: [{ path: "response", code: "unexpected_status" }],
      },
    },
    {
      status: "invalid_input",
      sessionDate,
      error: {
        kind: "invalid_input",
        message: "invalid input",
        issues: [{ path: "familyId", code: "invalid_uuid" }],
      },
    },
  ];

  for (const expected of states) {
    const result = await loadSharedDailyDataForFamilyWithDependencies(input, {
      createClient: async () => client,
      loadDailyDataForDate: async () => expected,
    });

    assert.equal(result, expected);
    assert.deepEqual(roundTrip(result), expected);
  }
});

test("normalizes every client creation failure without calling the loader", async () => {
  const failures: Array<() => Promise<DailyDataClient>> = [
    () => {
      throw new Error("sync create failure");
    },
    () => Promise.reject(new Error("async create failure")),
    () => Promise.reject("string create failure"),
    () => Promise.reject({ reason: "object create failure" }),
  ];

  for (const createClient of failures) {
    let loaderCalls = 0;
    const result = await loadSharedDailyDataForFamilyWithDependencies(input, {
      createClient,
      loadDailyDataForDate: async () => {
        loaderCalls += 1;
        return { status: "not_found", sessionDate };
      },
    });

    assert.equal(loaderCalls, 0);
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "rpc_error");
      assert.notEqual(result.error.message.trim(), "");
    }
    assert.deepEqual(roundTrip(result), result);
  }
});

test("normalizes unexpected loader failures without retrying", async () => {
  const failures: Array<() => Promise<SharedDailyState>> = [
    () => {
      throw new Error("sync loader failure");
    },
    () => Promise.reject(new Error("async loader failure")),
    () => Promise.reject("string loader failure"),
    () => Promise.reject({ reason: "object loader failure" }),
  ];

  for (const fail of failures) {
    let createClientCalls = 0;
    let loaderCalls = 0;
    const result = await loadSharedDailyDataForFamilyWithDependencies(input, {
      createClient: async () => {
        createClientCalls += 1;
        return client;
      },
      loadDailyDataForDate: () => {
        loaderCalls += 1;
        return fail();
      },
    });

    assert.equal(createClientCalls, 1);
    assert.equal(loaderCalls, 1);
    assert.equal(result.status, "transport_error");
    if (result.status === "transport_error") {
      assert.equal(result.error.kind, "rpc_error");
      assert.notEqual(result.error.message.trim(), "");
    }
    assert.deepEqual(roundTrip(result), result);
  }
});

const source = readFileSync(
  join(
    process.cwd(),
    "src",
    "lib",
    "family-sharing",
    "shared-daily-data-server.ts",
  ),
  "utf8",
);

test("server daily loader retains its server-only boundary", () => {
  assert.match(source, /import "server-only"/);
});
