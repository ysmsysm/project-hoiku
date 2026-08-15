import type { HomeDataSource } from "./home-data-source";
import type { AppRepository } from "./repositories/AppRepository";
import type {
  SharedDailyCheckView,
  SharedDailyState,
} from "../types/shared-daily";
import type {
  CustomizableItem,
  LockerItem,
  PreparationSession,
  TodayOnlyTemporaryItem,
} from "../types/preparation";
import type { SpotAddition } from "../types/spot";
import type {
  CompleteDailyCheckResult,
  CompleteDailyPreparationResult,
  DailySession,
  DeleteDailyItemResult,
  SendDailyThanksResult,
  UpdateDailyItemResult,
  UpdateDailyPreparationItemsResult,
} from "../types/daily";

type SharedDailySuccessState = Extract<
  SharedDailyState,
  { status: "success" }
>;

type SharedDailyNonSuccessState = Exclude<
  SharedDailyState,
  { status: "success" }
>;

export type HomeSharedDailyDisplayState = Extract<
  SharedDailyState,
  {
    status:
      | "not_found"
      | "forbidden"
      | "invalid_state"
      | "transport_error"
      | "invalid_response"
      | "invalid_input";
  }
>;

export type HomeSharedDailyStatusView = {
  status: HomeSharedDailyDisplayState["status"];
  category: "business" | "transport" | "response" | "input";
  title: string;
  body: string;
};

export type HomeDailyItemMutationOperation =
  | "quantity"
  | "prepared"
  | "deferred"
  | "bulk_prepared"
  | "complete_check"
  | "complete_preparation"
  | "send_thanks"
  | "delete_item";

export type HomeDailyItemMutationErrorView = {
  title: string;
  body: string;
  canReload: boolean;
};

export type HomeSharedCompleteCheckNavigationState = {
  requestScopeKey: string;
  currentScopeKey: string;
  requestScopeGeneration: number;
  currentScopeGeneration: number;
  dailySessionId: string;
  responseVersion: number;
  appliedSession: DailySession;
};

type HomeLocalDailyRepository = Pick<
  AppRepository,
  | "loadCheckCounts"
  | "loadPreparationSession"
  | "loadTodayOnlyTemporaryItems"
  | "loadSpotAdditions"
  | "loadSpotDeadlines"
>;

export type HomeDailyInitialState =
  | {
      mode: "local";
      sharedDailyState: null;
      checkView: null;
      checkCounts: Record<string, number>;
      session: PreparationSession;
    }
  | {
      mode: "shared-success";
      sharedDailyState: SharedDailySuccessState;
      checkView: SharedDailyCheckView;
      checkCounts: Record<string, number>;
      session: PreparationSession;
    }
  | {
      mode: "shared-non-success";
      sharedDailyState: SharedDailyNonSuccessState;
      checkView: null;
      checkCounts: null;
      session: null;
    }
  | {
      mode: "shared-error";
      sharedDailyState: null;
      checkView: null;
      checkCounts: null;
      session: null;
    };

export type HomeLocalDailyInitialState = {
  checkCounts: Record<string, number>;
  preparationSession: PreparationSession;
  temporaryTodayOnlyItems: TodayOnlyTemporaryItem[];
  spotAdditions: SpotAddition[];
  spotDeadlines: Record<string, string>;
};

export type HomeSharedDailyPropSync = {
  initialKey: string | null;
  state: SharedDailyState | null;
  shouldSync: boolean;
};

export type HomeLocalDailyHydrationState =
  | { status: "idle"; sourceKey: null; requestId: 0 }
  | { status: "loading" | "ready"; sourceKey: string; requestId: number };

export type HomeCompleteCheckActionState = {
  dailyMode: HomeDailyInitialState["mode"];
  hasSession: boolean;
  hasCheckView: boolean;
  localHydrationReady: boolean;
};

type HomeLockerItemsInput =
  | {
      mode: "local";
      items: CustomizableItem[];
      checkCounts: Record<string, number>;
    }
  | {
      mode: "shared-success";
      checkView: SharedDailyCheckView;
    }
  | {
      mode: "shared-non-success" | "shared-error";
    };

export const initialHomeLocalDailyHydrationState: HomeLocalDailyHydrationState = {
  status: "idle",
  sourceKey: null,
  requestId: 0,
};

const createEmptyLocalPreparationSession = (): PreparationSession => ({
  checkedBy: "ママ",
  confirmedAt: null,
  completedAt: null,
  items: [],
  thanksSent: false,
});

export const createDefaultHomeCheckCounts = (
  items: CustomizableItem[],
): Record<string, number> =>
  items.reduce<Record<string, number>>((counts, item) => {
    if (item.category === "持ち物") {
      counts[item.id] = 0;
    }

    return counts;
  }, {});

const mapSharedCheckViewToCounts = (
  checkView: SharedDailyCheckView,
): Record<string, number> =>
  checkView.items.reduce<Record<string, number>>((counts, item) => {
    counts[item.id] = item.observedQuantity;
    return counts;
  }, {});

export function deriveHomeSharedDailyState(
  sharedDailyState: SharedDailyState,
): Extract<
  HomeDailyInitialState,
  { mode: "shared-success" | "shared-non-success" }
> {
  if (sharedDailyState.status === "success") {
    return {
      mode: "shared-success",
      sharedDailyState,
      checkView: sharedDailyState.checkView,
      checkCounts: mapSharedCheckViewToCounts(sharedDailyState.checkView),
      session: sharedDailyState.preparationSession,
    };
  }

  return {
    mode: "shared-non-success",
    sharedDailyState,
    checkView: null,
    checkCounts: null,
    session: null,
  };
}

export function createHomeDailyInitialState(
  dataSource: HomeDataSource,
  durableItems: CustomizableItem[],
): HomeDailyInitialState {
  if (dataSource.mode === "shared") {
    return deriveHomeSharedDailyState(dataSource.initialDailyData);
  }

  if (dataSource.mode === "shared-error") {
    return {
      mode: "shared-error",
      sharedDailyState: null,
      checkView: null,
      checkCounts: null,
      session: null,
    };
  }

  return {
    mode: "local",
    sharedDailyState: null,
    checkView: null,
    checkCounts: createDefaultHomeCheckCounts(durableItems),
    session: createEmptyLocalPreparationSession(),
  };
}

export function getHomeSharedDailyStateSyncKey(
  state: SharedDailyState,
): string {
  return JSON.stringify(state);
}

export function getHomeSharedDailyPropSync(
  previousInitialKey: string | null,
  dataSource: HomeDataSource,
): HomeSharedDailyPropSync {
  if (dataSource.mode !== "shared") {
    return {
      initialKey: null,
      state: null,
      shouldSync: previousInitialKey !== null,
    };
  }

  const initialKey = getHomeSharedDailyStateSyncKey(
    dataSource.initialDailyData,
  );

  return {
    initialKey,
    state: dataSource.initialDailyData,
    shouldSync: initialKey !== previousInitialKey,
  };
}

export function getHomeLocalDailySourceKey(
  dataSource: HomeDataSource,
): string | null {
  return dataSource.mode === "local" ? "local" : null;
}

export function startHomeLocalDailyHydration(
  sourceKey: string,
  requestId: number,
): HomeLocalDailyHydrationState {
  return { status: "loading", sourceKey, requestId };
}

export function canApplyHomeLocalDailyHydration(
  hydration: HomeLocalDailyHydrationState,
  sourceKey: string,
  requestId: number,
): boolean {
  return (
    hydration.status === "loading" &&
    hydration.sourceKey === sourceKey &&
    hydration.requestId === requestId
  );
}

export function completeHomeLocalDailyHydration(
  hydration: HomeLocalDailyHydrationState,
  sourceKey: string,
  requestId: number,
): HomeLocalDailyHydrationState {
  if (!canApplyHomeLocalDailyHydration(hydration, sourceKey, requestId)) {
    return hydration;
  }

  return { status: "ready", sourceKey, requestId };
}

export function isHomeLocalDailyHydrationReady(
  hydration: HomeLocalDailyHydrationState,
  sourceKey: string | null,
): boolean {
  return (
    sourceKey !== null &&
    hydration.status === "ready" &&
    hydration.sourceKey === sourceKey
  );
}

export function shouldRunHomeLocalDailyAutoEffects(
  dataSource: HomeDataSource,
  hydration: HomeLocalDailyHydrationState,
  sourceKey: string | null,
): boolean {
  return (
    dataSource.mode === "local" &&
    isHomeLocalDailyHydrationReady(hydration, sourceKey)
  );
}

export function canRenderHomeCompleteCheckAction({
  dailyMode,
  hasSession,
  hasCheckView,
  localHydrationReady,
}: HomeCompleteCheckActionState): boolean {
  if (dailyMode === "local") {
    return hasSession && localHydrationReady;
  }

  return dailyMode === "shared-success" && hasSession && hasCheckView;
}

export function canRunHomeLocalCompleteCheck({
  dailyMode,
  hasSession,
  localHydrationReady,
}: HomeCompleteCheckActionState): boolean {
  return (
    canRunHomeLocalDailyMutation(dailyMode) &&
    hasSession &&
    localHydrationReady
  );
}

export function canRunHomeCompleteCheckMutation(
  dailyMode: HomeDailyInitialState["mode"],
): boolean {
  return dailyMode === "local" || dailyMode === "shared-success";
}

export function canNavigateHomeAfterSharedCompleteCheck(
  state: SharedDailyState | null,
  navigation: HomeSharedCompleteCheckNavigationState,
): boolean {
  return (
    state?.status === "success" &&
    navigation.requestScopeKey === navigation.currentScopeKey &&
    navigation.requestScopeGeneration === navigation.currentScopeGeneration &&
    state.session === navigation.appliedSession &&
    state.session.dailySessionId.toLowerCase() ===
      navigation.dailySessionId.toLowerCase() &&
    state.session.version === navigation.responseVersion &&
    state.session.isChecked &&
    Boolean(state.session.checkedAt)
  );
}

export function canRunHomeLocalDailyMutation(
  dailyMode: HomeDailyInitialState["mode"],
): boolean {
  return dailyMode === "local";
}

export function canRunHomeObservedQuantityMutation(
  dailyMode: HomeDailyInitialState["mode"],
): boolean {
  return dailyMode === "local" || dailyMode === "shared-success";
}

export function canRunHomePreparationItemMutation(
  dailyMode: HomeDailyInitialState["mode"],
): boolean {
  return dailyMode === "local" || dailyMode === "shared-success";
}

export function canRunHomePreparationBulkMutation(
  dailyMode: HomeDailyInitialState["mode"],
): boolean {
  return dailyMode === "local" || dailyMode === "shared-success";
}

export function canRunHomeCompletePreparationMutation(
  dailyMode: HomeDailyInitialState["mode"],
): boolean {
  return dailyMode === "local" || dailyMode === "shared-success";
}

export function canRunHomeSendThanksMutation(
  dailyMode: HomeDailyInitialState["mode"],
): boolean {
  return dailyMode === "local" || dailyMode === "shared-success";
}

export function isHomeSharedThanksSelf(
  currentMemberId: string,
  completedByMemberId: string | null,
): boolean {
  return (
    completedByMemberId !== null &&
    currentMemberId.toLowerCase() === completedByMemberId.toLowerCase()
  );
}

export type HomeSharedThanksDisplay = "sent" | "received" | null;

export function getHomeSharedThanksDisplay(
  currentMemberId: string,
  session: Pick<
    DailySession,
    "thanksSent" | "thanksSentByMemberId" | "thanksReceivedByMemberId"
  >,
): HomeSharedThanksDisplay {
  if (!session.thanksSent) {
    return null;
  }

  if (isHomeSharedThanksSelf(currentMemberId, session.thanksSentByMemberId)) {
    return "sent";
  }

  if (
    isHomeSharedThanksSelf(currentMemberId, session.thanksReceivedByMemberId)
  ) {
    return "received";
  }

  return null;
}

export function getHomePreparationBulkTooManyItemsView(): HomeDailyItemMutationErrorView {
  return {
    title: "一括操作を利用できません",
    body: "項目が多いため、一括操作を利用できません。個別に変更してください。",
    canReload: false,
  };
}

export function getHomeDailyItemMutationErrorView(
  result: Exclude<
    | UpdateDailyItemResult
    | UpdateDailyPreparationItemsResult
    | CompleteDailyCheckResult
    | CompleteDailyPreparationResult
    | SendDailyThanksResult
    | DeleteDailyItemResult,
    { status: "success" }
  >,
  operation: HomeDailyItemMutationOperation,
): HomeDailyItemMutationErrorView {
  const operationName =
    operation === "quantity"
      ? "数量"
      : operation === "prepared"
        ? "準備状態"
        : operation === "deferred"
          ? "「あとで」の状態"
          : operation === "bulk_prepared"
            ? "一括の準備状態"
            : "準備完了";

  if (operation === "delete_item") {
    if (result.status === "conflict") {
      return {
        title: "ほかの端末で変更されています",
        body: "再読み込みして最新の状態を確認してください。",
        canReload: true,
      };
    }
    if (result.status === "invalid_state") {
      if (result.reason === "session_completed") {
        return {
          title: "この項目を削除できません",
          body: "準備完了後はこの項目を削除できません。",
          canReload: false,
        };
      }
      if (result.reason === "carryover_linked") {
        return {
          title: "この項目を削除できません",
          body: "持ち越し中の項目は削除できません。",
          canReload: false,
        };
      }
      if (result.reason === "daily_item_mismatch") {
        return {
          title: "最新の状態を確認できませんでした",
          body: "再読み込みして最新の状態を確認してください。",
          canReload: true,
        };
      }
      return {
        title: "この項目を削除できません",
        body: "現在の状態では削除できません。",
        canReload: false,
      };
    }
    if (result.status === "not_found") {
      return {
        title: "対象を確認できませんでした",
        body: "再読み込みして最新の状態を確認してください。",
        canReload: true,
      };
    }
    if (result.status === "forbidden") {
      return {
        title: "削除権限を確認できませんでした",
        body: "家族の共有設定を確認してください。",
        canReload: false,
      };
    }
    if (result.status === "transport_error") {
      return result.error.kind === "invalid_response"
        ? {
            title: "削除結果を確認できませんでした",
            body: "再読み込みして最新の状態を確認してください。",
            canReload: true,
          }
        : {
            title: "通信に失敗しました",
            body: "通信環境を確認して、もう一度お試しください。",
            canReload: false,
          };
    }
    return {
      title: "この項目を削除できません",
      body: "現在の状態では削除できません。",
      canReload: false,
    };
  }

  if (operation === "complete_check") {
    if (result.status === "conflict") {
      return {
        title: "ほかの端末で状態が更新されています",
        body: "最新の状態を確認するため、再読み込みしてください。",
        canReload: true,
      };
    }
    if (result.status === "forbidden") {
      return {
        title: "確認完了の権限を確認できません",
        body: "家族の共有設定を確認してください。",
        canReload: false,
      };
    }
    if (result.status === "not_found") {
      return {
        title: "対象のデータが見つかりません",
        body: "最新の状態を確認するため、再読み込みしてください。",
        canReload: true,
      };
    }
    if (result.status === "invalid_state") {
      return {
        title: "確認完了できる状態ではありません",
        body: "最新の状態を確認するため、再読み込みしてください。",
        canReload: true,
      };
    }
    if (result.status === "client_error") {
      return {
        title: "確認完了できる状態ではありません",
        body: "現在の画面の状態を確認してください。",
        canReload: false,
      };
    }
    if (result.status === "transport_error") {
      return result.error.kind === "invalid_response"
        ? {
            title: "確認結果を確認できませんでした",
            body: "最新の状態を確認するため、再読み込みしてください。",
            canReload: true,
          }
        : {
            title: "通信に失敗しました",
            body: "通信環境を確認して、もう一度操作してください。",
            canReload: false,
          };
    }
  }

  if (operation === "send_thanks") {
    if (result.status === "invalid_state") {
      switch (result.reason) {
        case "preparation_incomplete":
          return {
            title: "ありがとうを送信できませんでした",
            body: "準備完了後に操作してください。",
            canReload: true,
          };
        case "recipient_missing":
          return {
            title: "ありがとうを送信できませんでした",
            body: "ありがとうを送る相手を確認できません。最新の状態を確認してください。",
            canReload: true,
          };
        case "self_recipient":
          return {
            title: "ありがとうを送信できませんでした",
            body: "自分自身にはありがとうを送信できません。",
            canReload: false,
          };
        case "invalid_input":
        default:
          return {
            title: "ありがとうを送信できませんでした",
            body: "現在の状態では操作できません。",
            canReload: false,
          };
      }
    }
    if (result.status === "conflict") {
      return {
        title: "ほかの端末で状態が更新されています",
        body: "最新の状態を確認するため、再読み込みしてください。",
        canReload: true,
      };
    }
    if (result.status === "forbidden") {
      return {
        title: "送信権限を確認できません",
        body: "家族の共有設定を確認してください。",
        canReload: false,
      };
    }
    if (result.status === "not_found") {
      return {
        title: "対象のデータが見つかりません",
        body: "最新の状態を確認するため、再読み込みしてください。",
        canReload: true,
      };
    }
    if (result.status === "client_error") {
      return {
        title: "ありがとうを送信できませんでした",
        body: "現在の状態では操作できません。",
        canReload: false,
      };
    }
    if (result.status === "transport_error") {
      return result.error.kind === "invalid_response"
        ? {
            title: "送信結果を確認できませんでした",
            body: "最新の状態を確認するため、再読み込みしてください。",
            canReload: true,
          }
        : {
            title: "通信に失敗しました",
            body: "通信環境を確認して、もう一度操作してください。",
            canReload: false,
          };
    }
    return {
      title: "ありがとうを送信できませんでした",
      body: "現在の状態では操作できません。",
      canReload: false,
    };
  }

  if (operation === "complete_preparation") {
    if (result.status === "invalid_state") {
      if (result.reason === "daily_check_incomplete") {
        return {
          title: "準備完了を保存できませんでした",
          body: "確認を完了してから操作してください。",
          canReload: true,
        };
      }
      if (result.reason === "preparation_items_incomplete") {
        return {
          title: "準備完了を保存できませんでした",
          body: "未完了の項目があります。最新の状態を確認してください。",
          canReload: true,
        };
      }
    }
    if (result.status === "client_error") {
      return {
        title: "準備完了を保存できませんでした",
        body: "現在の状態では完了できません。",
        canReload: false,
      };
    }
    if (
      result.status === "transport_error" &&
      result.error.kind === "invalid_response"
    ) {
      return {
        title: "完了結果を確認できませんでした",
        body: "最新の状態を確認するため、再読み込みしてください。",
        canReload: true,
      };
    }
  }

  switch (result.status) {
    case "conflict":
      return {
        title: `他の端末で${operationName}が更新されています`,
        body: "最新の状態を確認するため、再読み込みしてください。",
        canReload: true,
      };
    case "forbidden":
      return {
        title: "更新権限を確認できません",
        body: "家族の共有設定を確認してください。",
        canReload: false,
      };
    case "not_found":
      return {
        title: "対象のデータが見つかりません",
        body: "最新の状態を確認するため、再読み込みしてください。",
        canReload: true,
      };
    case "invalid_state":
      return result.reason === "session_prepared"
        ? {
            title: `準備完了後は${operationName}を変更できません`,
            body: "最新の状態を確認してください。",
            canReload: true,
          }
        : {
            title: `現在の状態では${operationName}を変更できません`,
            body: "最新の状態を確認してください。",
            canReload: true,
          };
    case "client_error":
      return {
        title: `${operationName}を更新できませんでした`,
        body: "内容を確認して、もう一度操作してください。",
        canReload: false,
      };
    case "transport_error":
      return result.error.kind === "invalid_response"
        ? {
            title: "更新結果を確認できませんでした",
            body: "最新の状態を確認するため、再読み込みしてください。",
            canReload: true,
          }
        : {
            title: "通信に失敗しました",
            body: "通信環境を確認して、もう一度操作してください。",
            canReload: false,
          };
  }
}

export function isHomeSharedDailyDisplayState(
  state: SharedDailyState,
): state is HomeSharedDailyDisplayState {
  return (
    state.status === "not_found" ||
    state.status === "forbidden" ||
    state.status === "invalid_state" ||
    state.status === "transport_error" ||
    state.status === "invalid_response" ||
    state.status === "invalid_input"
  );
}

export function getHomeSharedDailyStatusView(
  state: HomeSharedDailyDisplayState,
): HomeSharedDailyStatusView {
  switch (state.status) {
    case "not_found":
      return {
        status: state.status,
        category: "business",
        title: "今日のデータはまだありません",
        body: "別の家族が確認を始めた後に、もう一度読み込んでください。",
      };
    case "forbidden":
      return {
        status: state.status,
        category: "business",
        title: "共有データを確認できません",
        body: "家族または子どもの共有設定を確認してください。",
      };
    case "invalid_state":
      return {
        status: state.status,
        category: "business",
        title: "今日のデータを表示できません",
        body: "データの状態を確認してから、もう一度読み込んでください。",
      };
    case "transport_error":
      return {
        status: state.status,
        category: "transport",
        title: "通信に失敗しました",
        body: "通信環境を確認して、もう一度読み込んでください。",
      };
    case "invalid_response":
      return {
        status: state.status,
        category: "response",
        title: "データを読み込めませんでした",
        body: "安全に表示できるデータを取得できませんでした。",
      };
    case "invalid_input":
      return {
        status: state.status,
        category: "input",
        title: "読み込み条件を確認できませんでした",
        body: "家族の設定を確認してから、もう一度読み込んでください。",
      };
  }
}

export function createHomeLockerItems(
  input: HomeLockerItemsInput,
): LockerItem[] {
  if (input.mode === "shared-success") {
    return input.checkView.items.map((item) => ({
      id: item.id,
      dailyItemId: item.dailyItemId,
      itemTemplateId: item.itemTemplateId,
      dailyItemVersion: item.version,
      isChecked: item.isChecked,
      name: item.name,
      unit: item.unit,
      requiredCount: item.requiredQuantity,
      shortageCount: Math.min(
        item.requiredQuantity,
        Math.max(0, item.observedQuantity),
      ),
    }));
  }

  if (input.mode !== "local") {
    return [];
  }

  return input.items
    .filter((item) => item.category === "持ち物" && item.count > 0)
    .map((item) => {
      const savedCount = input.checkCounts[item.id] ?? 0;

      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        requiredCount: item.count,
        shortageCount: Math.min(item.count, Math.max(0, savedCount)),
      };
    });
}

export function loadHomeLocalDailyInitialState(
  dataSource: HomeDataSource,
  repository: HomeLocalDailyRepository,
  defaultCheckCounts: Record<string, number>,
): HomeLocalDailyInitialState | null {
  if (dataSource.mode !== "local") {
    return null;
  }

  return {
    checkCounts: repository.loadCheckCounts(defaultCheckCounts),
    preparationSession: repository.loadPreparationSession(),
    temporaryTodayOnlyItems: repository.loadTodayOnlyTemporaryItems(),
    spotAdditions: repository.loadSpotAdditions(),
    spotDeadlines: repository.loadSpotDeadlines(),
  };
}
