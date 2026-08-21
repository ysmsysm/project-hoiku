"use server";

import type { LoadDailyDataInput } from "../src/types/daily";
import type { SharedDailyState } from "../src/types/shared-daily";
import { loadSharedDailyDataForFamily } from "../src/lib/family-sharing/shared-daily-data-server";

export async function loadHomeSharedDailyData(
  input: LoadDailyDataInput,
): Promise<SharedDailyState> {
  return loadSharedDailyDataForFamily(input);
}
