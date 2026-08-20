import type { DailySpotMutationInput } from "./family-sharing/mutate-daily-spot-item";
import {
  mutateDailySpotItem,
  type DailySpotMutationClient,
  type DailySpotMutationResult,
} from "./family-sharing/mutate-daily-spot-item";
import { loadDailyData } from "./family-sharing/daily-data";
import { mapDailySessionToSharedDailyState } from "./family-sharing/shared-daily-data";
import type { SharedTemplateMutationResult } from "./family-sharing/update-item-template";
import type { DailyDataClient } from "../types/daily";
import type { SharedDailyState } from "../types/shared-daily";
import type { CustomizableItem } from "../types/preparation";

export function isHomeCompletedSpotCorrectionAction(
  action: DailySpotMutationInput["action"],
): boolean {
  return (
    action === "add_template" ||
    action === "add_temporary" ||
    action === "delete" ||
    action === "set_due_date"
  );
}

export function applyHomeSharedRoughMutationFallback<RoughState extends string>(
  input: {
    itemId: string;
    nextState: RoughState;
    result: Extract<SharedTemplateMutationResult, { status: "success" }>;
    roughStates: Record<string, RoughState>;
    customItems: CustomizableItem[];
  },
) {
  return {
    roughStates: {
      ...input.roughStates,
      [input.itemId]: input.nextState,
    },
    customItems: input.customItems.map((item) =>
      item.id === input.itemId
        ? { ...item, updatedAt: input.result.updatedAt }
        : item,
    ),
  };
}

export type HomeSharedRoughExecutionResult<RoughState extends string> =
  | {
      status: "success";
      fallback: {
        roughStates: Record<string, RoughState>;
        customItems: CustomizableItem[];
      } | null;
    }
  | {
      status: "failure";
      result: Exclude<SharedTemplateMutationResult, { status: "success" }>;
    };

export async function executeHomeSharedRoughMutation<RoughState extends string>(
  input: {
    itemId: string;
    nextState: RoughState;
    roughStates: Record<string, RoughState>;
    customItems: CustomizableItem[];
  },
  dependencies: {
    save: () => Promise<SharedTemplateMutationResult | undefined>;
    reloadCanonical: () => Promise<boolean>;
  },
): Promise<HomeSharedRoughExecutionResult<RoughState>> {
  const result = await dependencies.save();
  if (!result || result.status !== "success") {
    return {
      status: "failure" as const,
      result: (result ?? {
        status: "client_error",
        changed: false,
        reason: null,
      }) as Exclude<SharedTemplateMutationResult, { status: "success" }>,
    };
  }
  if (await dependencies.reloadCanonical()) {
    return { status: "success" as const, fallback: null };
  }
  return {
    status: "success" as const,
    fallback: applyHomeSharedRoughMutationFallback({ ...input, result }),
  };
}

export type HomeSharedDailySpotClient = DailySpotMutationClient & DailyDataClient;

export type HomeSharedDailySpotExecutionResult =
  | {
      status: "success";
      state: Extract<SharedDailyState, { status: "success" }>;
    }
  | { status: "mutation_failure"; result: DailySpotMutationResult }
  | { status: "reload_failure" };

export async function executeHomeSharedDailySpotMutation(
  client: HomeSharedDailySpotClient,
  input: DailySpotMutationInput,
  expectedDailySessionId: string,
): Promise<HomeSharedDailySpotExecutionResult> {
  const result = await mutateDailySpotItem(client, input);
  if (result.status !== "success") {
    return { status: "mutation_failure", result };
  }
  const loaded = await loadDailyData(client, input);
  if (
    loaded.status !== "success" ||
    loaded.session.dailySessionId !== expectedDailySessionId
  ) {
    return { status: "reload_failure" };
  }
  const state = mapDailySessionToSharedDailyState(
    loaded.session,
    input.sessionDate,
  );
  return state.status === "success"
    ? { status: "success", state }
    : { status: "reload_failure" };
}
