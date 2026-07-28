import type {
  DailyDataInvalidInputError,
  DailyDataInvalidResponseError,
  DailyDataRpcError,
  DailySession,
} from "./daily";
import type { PreparationSession } from "./preparation";

export type SharedDailyCheckItem = {
  id: string;
  dailyItemId: string;
  itemTemplateId: string | null;
  version: number;
  name: string;
  unit: string;
  requiredQuantity: number;
  observedQuantity: number;
  isChecked: boolean;
};

export type SharedDailyCheckView = {
  items: SharedDailyCheckItem[];
};

type SharedDailyDatedState = {
  sessionDate: string;
};

export type SharedDailyState =
  | {
      status: "idle";
    }
  | (SharedDailyDatedState & {
      status: "loading";
    })
  | (SharedDailyDatedState & {
      status: "success";
      session: DailySession;
      preparationSession: PreparationSession;
      checkView: SharedDailyCheckView;
    })
  | (SharedDailyDatedState & {
      status: "not_found" | "forbidden" | "invalid_state";
    })
  | (SharedDailyDatedState & {
      status: "transport_error";
      error: DailyDataRpcError;
    })
  | (SharedDailyDatedState & {
      status: "invalid_response";
      error: DailyDataInvalidResponseError;
    })
  | (SharedDailyDatedState & {
      status: "invalid_input";
      error: DailyDataInvalidInputError;
    });
