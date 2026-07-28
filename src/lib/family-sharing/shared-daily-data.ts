import type {
  DailyDataClient,
  LoadDailyDataInput,
  LoadDailyDataResult,
} from "../../types/daily";
import type { SharedDailyState } from "../../types/shared-daily";
import { loadDailyData } from "./daily-data";
import {
  mapDailySessionToCheckView,
  mapDailySessionToPreparationSession,
} from "./daily-data-view";

const viewMappingFailure = (
  sessionDate: string,
): SharedDailyState => ({
  status: "invalid_response",
  sessionDate,
  error: {
    kind: "invalid_response",
    message: "Could not derive shared daily views",
    issues: [{ path: "session", code: "view_mapping_failed" }],
  },
});

export function mapLoadDailyDataResultToSharedDailyState(
  result: LoadDailyDataResult,
  sessionDate: string,
): SharedDailyState {
  if (result.status === "success") {
    try {
      return {
        status: "success",
        sessionDate: result.session.sessionDate,
        session: result.session,
        preparationSession: mapDailySessionToPreparationSession(
          result.session,
        ),
        checkView: mapDailySessionToCheckView(result.session),
      };
    } catch {
      return viewMappingFailure(sessionDate);
    }
  }

  if (result.status === "client_error") {
    return {
      status: "invalid_input",
      sessionDate,
      error: result.error,
    };
  }

  if (result.status === "transport_error") {
    if (result.error.kind === "invalid_response") {
      return {
        status: "invalid_response",
        sessionDate,
        error: result.error,
      };
    }

    return {
      status: "transport_error",
      sessionDate,
      error: result.error,
    };
  }

  return { status: result.status, sessionDate };
}

export async function loadSharedDailyDataForDate(
  client: DailyDataClient,
  input: LoadDailyDataInput,
): Promise<SharedDailyState> {
  try {
    const result = await loadDailyData(client, input);
    return mapLoadDailyDataResultToSharedDailyState(
      result,
      input.sessionDate,
    );
  } catch {
    return {
      status: "transport_error",
      sessionDate: input.sessionDate,
      error: {
        kind: "rpc_error",
        message: "Shared daily data load failed",
      },
    };
  }
}
