import "server-only";

import type { DailyDataClient, LoadDailyDataInput } from "../../types/daily";
import type { SharedDailyState } from "../../types/shared-daily";
import { createClient } from "../supabase/server";
import {
  isDailyDataUuid,
  isPostgresInteger,
  normalizeDailyDataUuid,
} from "./daily-data";
import { loadSharedDailyDataForDate } from "./shared-daily-data";

export type SharedDailyServerClient = {
  rpc: (
    functionName:
      | Parameters<DailyDataClient["rpc"]>[0]
      | "ensure_daily_session"
      | "process_daily_carryovers",
    args:
      | Parameters<DailyDataClient["rpc"]>[1]
      | {
          p_family_id: string;
          p_child_id: string;
          p_to_session_date: string;
        },
  ) => ReturnType<DailyDataClient["rpc"]>;
};

export type SharedDailyDataServerDependencies = {
  createClient: () => Promise<SharedDailyServerClient>;
  loadDailyDataForDate: (
    client: DailyDataClient,
    input: LoadDailyDataInput,
  ) => Promise<SharedDailyState>;
};

const serverLoadFailure = (sessionDate: string): SharedDailyState => ({
  status: "transport_error",
  sessionDate,
  error: {
    kind: "rpc_error",
    message: "Shared daily data server load failed",
  },
});

const invalidBootstrapResponse = (
  sessionDate: string,
  step: "ensure_daily_session" | "process_daily_carryovers",
): SharedDailyState => ({
  status: "invalid_response",
  sessionDate,
  error: {
    kind: "invalid_response",
    message: "Invalid shared daily bootstrap response",
    issues: [{ path: step, code: "invalid_response" }],
  },
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const uuidEquals = (left: string, right: string): boolean =>
  normalizeDailyDataUuid(left) === normalizeDailyDataUuid(right);

const mapBootstrapBusinessFailure = (
  status: unknown,
  sessionDate: string,
  allowedStatuses: readonly string[],
): SharedDailyState | null =>
  typeof status === "string" && allowedStatuses.includes(status)
    ? {
        status: status as "forbidden" | "not_found" | "invalid_state",
        sessionDate,
      }
    : null;

const isNonNegativePostgresInteger = (value: unknown): value is number =>
  isPostgresInteger(value) && value >= 0;

async function ensureDailySession(
  client: SharedDailyServerClient,
  input: LoadDailyDataInput,
): Promise<SharedDailyState | null> {
  let response: Awaited<ReturnType<DailyDataClient["rpc"]>>;
  try {
    response = await client.rpc("ensure_daily_session", {
      p_family_id: input.familyId,
      p_child_id: input.childId,
      p_session_date: input.sessionDate,
    });
  } catch {
    return serverLoadFailure(input.sessionDate);
  }

  if (response.error) {
    return serverLoadFailure(input.sessionDate);
  }
  if (!isPlainObject(response.data)) {
    return invalidBootstrapResponse(input.sessionDate, "ensure_daily_session");
  }

  if (
    response.data.status === "forbidden" ||
    response.data.status === "invalid_state"
  ) {
    return response.data.session === null &&
      response.data.created_session === false &&
      response.data.created_item_count === 0
      ? mapBootstrapBusinessFailure(
          response.data.status,
          input.sessionDate,
          ["forbidden", "invalid_state"],
        )
      : invalidBootstrapResponse(input.sessionDate, "ensure_daily_session");
  }

  const session = response.data.session;
  if (
    response.data.status !== "success" ||
    typeof response.data.created_session !== "boolean" ||
    !isNonNegativePostgresInteger(response.data.created_item_count) ||
    !isPlainObject(session) ||
    !isDailyDataUuid(session.id) ||
    !isDailyDataUuid(session.session_id) ||
    !uuidEquals(session.id, session.session_id) ||
    !isDailyDataUuid(session.family_id) ||
    !uuidEquals(session.family_id, input.familyId) ||
    !isDailyDataUuid(session.child_id) ||
    !uuidEquals(session.child_id, input.childId) ||
    session.session_date !== input.sessionDate ||
    (!response.data.created_session && response.data.created_item_count !== 0)
  ) {
    return invalidBootstrapResponse(input.sessionDate, "ensure_daily_session");
  }

  return null;
}

async function processDailyCarryovers(
  client: SharedDailyServerClient,
  input: LoadDailyDataInput,
): Promise<SharedDailyState | null> {
  let response: Awaited<ReturnType<DailyDataClient["rpc"]>>;
  try {
    response = await client.rpc("process_daily_carryovers", {
      p_family_id: input.familyId,
      p_child_id: input.childId,
      p_to_session_date: input.sessionDate,
    });
  } catch {
    return serverLoadFailure(input.sessionDate);
  }

  if (response.error) {
    return serverLoadFailure(input.sessionDate);
  }
  if (!isPlainObject(response.data)) {
    return invalidBootstrapResponse(
      input.sessionDate,
      "process_daily_carryovers",
    );
  }

  if (
    response.data.status === "forbidden" ||
    response.data.status === "not_found" ||
    response.data.status === "invalid_state"
  ) {
    const hasEmptyCounts = response.data.created_count === 0 &&
      response.data.updated_count === 0 &&
      response.data.processed_count === 0 &&
      response.data.skipped_count === 0;
    if (!hasEmptyCounts) {
      return invalidBootstrapResponse(
        input.sessionDate,
        "process_daily_carryovers",
      );
    }
    if (response.data.status === "invalid_state") {
      return null;
    }
    return mapBootstrapBusinessFailure(
      response.data.status,
      input.sessionDate,
      ["forbidden", "not_found"],
    );
  }

  if (
    response.data.status !== "success" ||
    !isNonNegativePostgresInteger(response.data.created_count) ||
    !isNonNegativePostgresInteger(response.data.updated_count) ||
    !isNonNegativePostgresInteger(response.data.processed_count) ||
    !isNonNegativePostgresInteger(response.data.skipped_count)
  ) {
    return invalidBootstrapResponse(
      input.sessionDate,
      "process_daily_carryovers",
    );
  }

  return null;
}

export async function loadSharedDailyDataForFamilyWithDependencies(
  input: LoadDailyDataInput,
  dependencies: SharedDailyDataServerDependencies,
): Promise<SharedDailyState> {
  try {
    const client = await dependencies.createClient();
    const ensureFailure = await ensureDailySession(client, input);
    if (ensureFailure) {
      return ensureFailure;
    }

    const carryoverFailure = await processDailyCarryovers(client, input);
    if (carryoverFailure) {
      return carryoverFailure;
    }

    const loaded = await dependencies.loadDailyDataForDate(client, input);
    return loaded.status === "transport_error"
      ? serverLoadFailure(input.sessionDate)
      : loaded;
  } catch {
    return serverLoadFailure(input.sessionDate);
  }
}

async function createDailyDataServerClient(): Promise<SharedDailyServerClient> {
  const supabase = await createClient();

  return {
    rpc(functionName, args) {
      return supabase.rpc(functionName, args);
    },
  };
}

export async function loadSharedDailyDataForFamily(
  input: LoadDailyDataInput,
): Promise<SharedDailyState> {
  return loadSharedDailyDataForFamilyWithDependencies(input, {
    createClient: createDailyDataServerClient,
    loadDailyDataForDate: loadSharedDailyDataForDate,
  });
}
