import "server-only";

import { createClient } from "../supabase/server";
import {
  mapSharedSettingsRowsToAppData,
  type SharedSettingsAppData,
  type SharedSettingsChildRow,
  type SharedSettingsDataError,
  type SharedSettingsItemTemplateRow,
  type SharedSettingsMappingResult,
  type SharedSettingsWeekdayRow,
} from "./shared-settings";

export type SharedSettingsLoadError =
  | {
      type: "query_failed";
      source: "children" | "item_templates" | "item_template_weekdays";
      message: string;
    }
  | {
      type: "child_missing";
      issues: SharedSettingsDataError["issues"];
    }
  | {
      type: "multiple_children";
      issues: SharedSettingsDataError["issues"];
    }
  | {
      type: "invalid_data";
      issues: SharedSettingsDataError["issues"];
    };

export type SharedSettingsLoadResult =
  | { ok: true; data: SharedSettingsAppData }
  | { ok: false; error: SharedSettingsLoadError };

export async function loadSharedSettingsForFamily(
  familyId: string,
): Promise<SharedSettingsLoadResult> {
  const supabase = await createClient();

  const childrenResult = await supabase
    .from("children")
    .select("id, family_id, name, icon_type, icon_id, icon_url")
    .eq("family_id", familyId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (childrenResult.error) {
    return queryFailed("children", childrenResult.error.message);
  }

  const itemTemplatesResult = await supabase
    .from("item_templates")
    .select(
      [
        "id",
        "family_id",
        "child_id",
        "kind",
        "name",
        "default_quantity",
        "unit",
        "sort_order",
        "current_rough_state",
      ].join(", "),
    )
    .eq("family_id", familyId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (itemTemplatesResult.error) {
    return queryFailed("item_templates", itemTemplatesResult.error.message);
  }

  const weekdaysResult = await supabase
    .from("item_template_weekdays")
    .select("item_template_id, family_id, weekday")
    .eq("family_id", familyId)
    .order("item_template_id", { ascending: true })
    .order("weekday", { ascending: true });

  if (weekdaysResult.error) {
    return queryFailed("item_template_weekdays", weekdaysResult.error.message);
  }

  return toLoadResult(
    mapSharedSettingsRowsToAppData({
      children: (childrenResult.data ?? []) as SharedSettingsChildRow[],
      itemTemplates: (itemTemplatesResult.data ?? []) as unknown as SharedSettingsItemTemplateRow[],
      itemTemplateWeekdays: (weekdaysResult.data ?? []) as SharedSettingsWeekdayRow[],
    }),
  );
}

function queryFailed(
  source: "children" | "item_templates" | "item_template_weekdays",
  message: string,
): SharedSettingsLoadResult {
  return {
    ok: false,
    error: {
      type: "query_failed",
      source,
      message,
    },
  };
}

function toLoadResult(
  result: SharedSettingsMappingResult,
): SharedSettingsLoadResult {
  if (result.ok === true) {
    return result;
  }

  return {
    ok: false,
    error: {
      type: result.error.code,
      issues: result.error.issues,
    },
  };
}
