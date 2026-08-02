import "server-only";

import type { DailyDataClient, LoadDailyDataInput } from "../../types/daily";
import type { SharedDailyState } from "../../types/shared-daily";
import { createClient } from "../supabase/server";
import { loadSharedDailyDataForDate } from "./shared-daily-data";

export type SharedDailyDataServerDependencies = {
  createClient: () => Promise<DailyDataClient>;
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
    message: "Shared daily data server client creation failed",
  },
});

export async function loadSharedDailyDataForFamilyWithDependencies(
  input: LoadDailyDataInput,
  dependencies: SharedDailyDataServerDependencies,
): Promise<SharedDailyState> {
  try {
    const client = await dependencies.createClient();
    return await dependencies.loadDailyDataForDate(client, input);
  } catch {
    return serverLoadFailure(input.sessionDate);
  }
}

async function createDailyDataServerClient(): Promise<DailyDataClient> {
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
