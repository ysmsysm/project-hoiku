export type DailyItemKind = "regular" | "spot" | "rough";

export type DailyRoughState = "enough" | "low" | "refill";

export type DailyItemPayload = {
  id: unknown;
  daily_item_id: unknown;
  session_id: unknown;
  daily_session_id: unknown;
  family_id: unknown;
  item_template_id: unknown;
  kind: unknown;
  is_ad_hoc: unknown;
  name: unknown;
  required_quantity: unknown;
  observed_quantity: unknown;
  shortage_count: unknown;
  quantity: unknown;
  unit: unknown;
  rough_state: unknown;
  is_checked: unknown;
  is_prepared: unknown;
  is_deferred: unknown;
  is_carryover: unknown;
  carryover_pending_shortage_count: unknown;
  carried_from_daily_item_id: unknown;
  carryover_processed_at: unknown;
  carryover_resolved_at: unknown;
  due_date: unknown;
  sort_order: unknown;
  version: unknown;
  updated_by_member_id: unknown;
  updated_by_user_id: unknown;
  updated_by_display_name: unknown;
  created_at: unknown;
  updated_at: unknown;
  changed?: unknown;
};

export type DailySessionPayload = {
  id: unknown;
  session_id: unknown;
  family_id: unknown;
  child_id: unknown;
  session_date: unknown;
  version: unknown;
  is_checked: unknown;
  checked_by_member_id: unknown;
  checked_by_user_id: unknown;
  checked_by_display_name: unknown;
  checked_at: unknown;
  is_prepared: unknown;
  prepared_by_member_id: unknown;
  prepared_by_user_id: unknown;
  prepared_by_display_name: unknown;
  prepared_at: unknown;
  thanks_sent_at: unknown;
  thanks_sent_by_member_id: unknown;
  thanks_sent_by_user_id: unknown;
  thanks_sent_by_display_name: unknown;
  thanks_received_by_member_id: unknown;
  thanks_received_by_user_id: unknown;
  thanks_received_by_display_name: unknown;
  created_at: unknown;
  updated_at: unknown;
};

export type DailyItem = {
  dailyItemId: string;
  dailySessionId: string;
  familyId: string;
  itemTemplateId: string | null;
  kind: DailyItemKind;
  isAdHoc: boolean;
  name: string;
  requiredQuantity: number;
  observedQuantity: number | null;
  shortageCount: number | null;
  quantity: number;
  unit: string | null;
  roughState: DailyRoughState | null;
  isChecked: boolean;
  isPrepared: boolean;
  isDeferred: boolean;
  isCarryover: boolean;
  carryoverPendingShortageCount: number | null;
  carriedFromDailyItemId: string | null;
  carryoverProcessedAt: string | null;
  carryoverResolvedAt: string | null;
  dueDate: string | null;
  sortOrder: number;
  version: number;
  deletedAt: null;
  updatedByMemberId: string | null;
  updatedByUserId: string | null;
  updatedByDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdatedDailyItem = DailyItem & {
  changed: boolean;
};

export type DailySession = {
  dailySessionId: string;
  familyId: string;
  childId: string;
  sessionDate: string;
  version: number;
  isChecked: boolean;
  checkedAt: string | null;
  checkedByMemberId: string | null;
  checkedByUserId: string | null;
  checkedByDisplayName: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  completedByMemberId: string | null;
  completedByUserId: string | null;
  completedByDisplayName: string | null;
  thanksSent: boolean;
  thanksSentAt: string | null;
  thanksSentByMemberId: string | null;
  thanksSentByUserId: string | null;
  thanksSentByDisplayName: string | null;
  thanksReceivedByMemberId: string | null;
  thanksReceivedByUserId: string | null;
  thanksReceivedByDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
  items: DailyItem[];
};

export type DailySessionMetadata = Omit<DailySession, "items">;

export type CompleteDailyPreparationInput = {
  familyId: string;
  childId: string;
  sessionDate: string;
  expectedSessionVersion: number;
};

export type CompleteDailyPreparationReason =
  | "daily_check_incomplete"
  | "preparation_items_incomplete";

export type CompleteDailyPreparationBusinessResult =
  | {
      status: "success";
      changed: boolean;
      session: DailySessionMetadata;
    }
  | {
      status: "conflict";
      changed: false;
      session: DailySessionMetadata;
    }
  | {
      status: "forbidden" | "not_found";
      changed: false;
    }
  | {
      status: "invalid_state";
      changed: false;
      reason?: CompleteDailyPreparationReason;
      session?: DailySessionMetadata;
    };

export type CompleteDailyPreparationResult =
  | CompleteDailyPreparationBusinessResult
  | DailyDataFailure;

export type DailyDataValidationIssue = {
  path: string;
  code: string;
};

export type DailyDataInvalidResponseError = {
  kind: "invalid_response";
  message: string;
  issues: DailyDataValidationIssue[];
};

export type DailyDataRpcError = {
  kind: "rpc_error";
  message: string;
  code?: string;
};

export type DailyDataInvalidInputError = {
  kind: "invalid_input";
  message: string;
  issues: DailyDataValidationIssue[];
};

export type DailyDataTransportError =
  | DailyDataInvalidResponseError
  | DailyDataRpcError;

export type DailyDataClientError = DailyDataInvalidInputError;

export type DailyDataFailure =
  | {
      status: "transport_error";
      error: DailyDataTransportError;
    }
  | {
      status: "client_error";
      error: DailyDataClientError;
    };

export type LoadDailyDataInput = {
  familyId: string;
  childId: string;
  sessionDate: string;
};

export type LoadDailyDataBusinessResult =
  | {
      status: "success";
      session: DailySession;
    }
  | {
      status: "forbidden" | "not_found" | "invalid_state";
    };

export type LoadDailyDataResult =
  | LoadDailyDataBusinessResult
  | DailyDataFailure;

export type DailyPreparationItemUpdate = {
  dailyItemId: string;
  expectedVersion: number;
  isPrepared: boolean;
};

export type UpdateDailyPreparationItemsInput = {
  familyId: string;
  childId: string;
  sessionDate: string;
  updates: DailyPreparationItemUpdate[];
};

export type UpdateDailyPreparationItemsValidationContext = {
  dailySessionId: string;
  items: DailyItem[];
};

export type DailyPreparationConflictPayload = {
  daily_item_id: unknown;
  expected_version: unknown;
  current_version: unknown;
  is_prepared: unknown;
  is_deferred: unknown;
  updated_by_member_id: unknown;
  updated_by_user_id: unknown;
  updated_by_display_name: unknown;
  updated_at: unknown;
};

export type DailyPreparationConflict = {
  dailyItemId: string;
  expectedVersion: number;
  currentVersion: number;
  isPrepared: boolean;
  isDeferred: boolean;
  updatedByMemberId: string | null;
  updatedByUserId: string | null;
  updatedByDisplayName: string | null;
  updatedAt: string;
};

type UpdateDailyPreparationItemsCounts = {
  requestedCount: number;
  changedCount: number;
  unchangedCount: number;
};

export type UpdateDailyPreparationItemsBusinessResult =
  | (UpdateDailyPreparationItemsCounts & {
      status: "success";
      items: UpdatedDailyItem[];
    })
  | (UpdateDailyPreparationItemsCounts & {
      status: "conflict";
      conflicts: DailyPreparationConflict[];
    })
  | (UpdateDailyPreparationItemsCounts & {
      status: "forbidden" | "not_found" | "invalid_state";
      reason?: string;
    });

export type UpdateDailyPreparationItemsResult =
  | UpdateDailyPreparationItemsBusinessResult
  | DailyDataFailure;

type UpdateDailyItemScopeInput = {
  familyId: string;
  childId: string;
  sessionDate: string;
  dailySessionId: string;
  dailyItemId: string;
  expectedVersion: number;
};

export type UpdateDailyItemInput = UpdateDailyItemScopeInput &
  (
    | {
        action: "set_observed_quantity";
        requiredQuantity: number;
        observedQuantity: number;
      }
    | {
        action: "set_prepared";
        nextPrepared: boolean;
        currentIsPrepared: boolean;
        currentIsDeferred: boolean;
      }
    | {
        action: "set_deferred";
        nextDeferred: boolean;
        currentIsPrepared: boolean;
        currentIsDeferred: boolean;
      }
  );

export type UpdateDailyItemBusinessResult =
  | {
      status: "success";
      item: DailyItem;
    }
  | {
      status: "conflict";
      item: DailyItem;
    }
  | {
      status: "forbidden" | "not_found";
    }
  | {
      status: "invalid_state";
      reason?: "session_prepared";
    };

export type UpdateDailyItemResult =
  | UpdateDailyItemBusinessResult
  | DailyDataFailure;

export type UpdateDailyItemClient = {
  rpc: (
    functionName: "update_daily_item",
    args:
      | {
          p_family_id: string;
          p_child_id: string;
          p_session_date: string;
          p_daily_item_id: string;
          p_expected_version: number;
          p_action: "set_observed_quantity";
          p_value: { observed_quantity: number };
        }
      | {
          p_family_id: string;
          p_child_id: string;
          p_session_date: string;
          p_daily_item_id: string;
          p_expected_version: number;
          p_action: "set_prepared";
          p_value: { is_prepared: boolean };
        }
      | {
          p_family_id: string;
          p_child_id: string;
          p_session_date: string;
          p_daily_item_id: string;
          p_expected_version: number;
          p_action: "set_deferred";
          p_value: { is_deferred: boolean };
        },
  ) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

export type CompleteDailyPreparationClient = {
  rpc: (
    functionName: "complete_daily_preparation",
    args: {
      p_family_id: string;
      p_child_id: string;
      p_session_date: string;
      p_expected_version: number;
    },
  ) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

export type DailyDataClient = {
  rpc: (
    functionName:
      | "load_daily_data"
      | "update_daily_preparation_items"
      | "complete_daily_preparation",
    args:
      | {
          p_family_id: string;
          p_child_id: string;
          p_session_date: string;
        }
      | {
          p_family_id: string;
          p_child_id: string;
          p_session_date: string;
          p_updates: {
            daily_item_id: string;
            expected_version: number;
            is_prepared: boolean;
          }[];
        }
      | {
          p_family_id: string;
          p_child_id: string;
          p_session_date: string;
          p_expected_version: number;
        },
  ) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};
