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

type SharedDailySuccessState = Extract<
  SharedDailyState,
  { status: "success" }
>;

type SharedDailyNonSuccessState = Exclude<
  SharedDailyState,
  { status: "success" }
>;

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
  return dailyMode === "local" && hasSession && localHydrationReady;
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
