import type { ChildProfile } from "../../types/child";
import type { SpotAddition } from "../../types/spot";
import type {
  CustomizableItem,
  PreparationItem,
  PreparationSession,
  TodayOnlyTemporaryItem,
} from "../../types/preparation";

export interface AppRepository {
  defaultChildProfile: ChildProfile;
  loadPreparationSession: () => PreparationSession;
  savePreparationSession: (session: PreparationSession) => void;
  loadCheckCounts: (
    defaultCounts: Record<string, number>,
  ) => Record<string, number>;
  saveCheckCounts: (counts: Record<string, number>) => void;
  loadRoughStates: <RoughState extends string>(
    defaultStates: Record<string, RoughState>,
  ) => Record<string, RoughState>;
  saveRoughStates: <RoughState extends string>(
    states: Record<string, RoughState>,
  ) => void;
  loadCustomItems: (defaultItems: CustomizableItem[]) => CustomizableItem[];
  saveCustomItems: (items: CustomizableItem[]) => void;
  loadTodayOnlyTemporaryItems: () => TodayOnlyTemporaryItem[];
  saveTodayOnlyTemporaryItems: (items: TodayOnlyTemporaryItem[]) => void;
  loadSpotAdditions: () => SpotAddition[];
  saveSpotAdditions: (additions: SpotAddition[]) => void;
  loadSpotDeadlines: () => Record<string, string>;
  saveSpotDeadlines: (deadlines: Record<string, string>) => void;
  loadChildProfile: () => ChildProfile;
  saveChildProfile: (profile: ChildProfile) => void;
  createTodayOnlyTemporaryItem: (
    name: string,
    count?: number,
  ) => TodayOnlyTemporaryItem;
  createPreparationSession: (
    items: PreparationItem[],
  ) => PreparationSession;
}
