import type { DailySpotMutationInput } from "./family-sharing/mutate-daily-spot-item";
import type { SharedTemplateMutationResult } from "./family-sharing/update-item-template";
import type { CustomizableItem } from "../types/preparation";

export function isHomeCompletedSpotCorrectionAction(
  action: DailySpotMutationInput["action"],
): boolean {
  return (
    action === "add_template" ||
    action === "add_temporary" ||
    action === "delete"
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
