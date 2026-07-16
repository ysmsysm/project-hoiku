import "server-only";

import { createClient } from "../supabase/server";
import {
  loadSharedSettingsWithClient,
  type SharedSettingsLoadResult,
} from "./shared-settings-query";

export type {
  SharedSettingsLoadError,
  SharedSettingsLoadResult,
} from "./shared-settings-query";

export async function loadSharedSettingsForFamily(
  familyId: string,
): Promise<SharedSettingsLoadResult> {
  return loadSharedSettingsWithClient(await createClient(), familyId);
}
