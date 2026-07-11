import type {
  CustomizableItem,
  PreparationItem,
  PreparationSession,
  TodayOnlyTemporaryItem,
} from "../types/preparation";
import type { ChildProfile } from "../types/child";
import type { SpotAddition } from "../types/spot";

const sessionKey = "project-hoiku:preparation-session";
const checkCountsKey = "project-hoiku:locker-counts";
const customItemsKey = "project-hoiku:custom-items";
const todayOnlyTemporaryItemsKey = "project-hoiku:today-only-temporary-items";
const spotAdditionsKey = "project-hoiku:spot-additions";
const spotDeadlinesKey = "project-hoiku:spot-deadlines";
const childProfileKey = "project-hoiku:child-profile";

export const defaultChildProfile: ChildProfile = {
  name: "そうた",
  iconType: "default",
  iconId: "default-baby",
  iconUrl: null,
  birthday: null,
  photoUrl: null,
};

const defaultSession: PreparationSession = {
  checkedBy: "ママ",
  confirmedAt: null,
  completedAt: null,
  items: [],
  thanksSent: false,
};

const canUseStorage = () => typeof window !== "undefined";

const getTodayKey = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
};

export function loadPreparationSession(): PreparationSession {
  if (!canUseStorage()) {
    return defaultSession;
  }

  try {
    const saved = window.localStorage.getItem(sessionKey);
    if (!saved) {
      return defaultSession;
    }

    const parsed = { ...defaultSession, ...JSON.parse(saved) };

    return {
      ...parsed,
      items: parsed.items.map((item: PreparationItem) => ({
        ...item,
        later: item.later ?? false,
      })),
    };
  } catch {
    return defaultSession;
  }
}

export function savePreparationSession(session: PreparationSession) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function loadCheckCounts(defaultCounts: Record<string, number>) {
  if (!canUseStorage()) {
    return defaultCounts;
  }

  try {
    const saved = window.localStorage.getItem(checkCountsKey);
    return saved ? { ...defaultCounts, ...JSON.parse(saved) } : defaultCounts;
  } catch {
    return defaultCounts;
  }
}

export function saveCheckCounts(counts: Record<string, number>) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(checkCountsKey, JSON.stringify(counts));
}

export function loadCustomItems(
  defaultItems: CustomizableItem[],
): CustomizableItem[] {
  if (!canUseStorage()) {
    return defaultItems;
  }

  try {
    const saved = window.localStorage.getItem(customItemsKey);
    const items = saved ? JSON.parse(saved) : defaultItems;

    return items.map((item: Omit<CustomizableItem, "category"> & { category: string }) => ({
      ...item,
      category:
        item.category === "今日だけ追加" ? "スポット追加" : item.category,
      weekdays: item.weekdays ?? [],
    }));
  } catch {
    return defaultItems;
  }
}

export function saveCustomItems(items: CustomizableItem[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(customItemsKey, JSON.stringify(items));
}

export function loadTodayOnlyTemporaryItems(): TodayOnlyTemporaryItem[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const saved = window.localStorage.getItem(todayOnlyTemporaryItemsKey);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved) as {
      date?: string;
      items?: TodayOnlyTemporaryItem[];
    };

    return parsed.items ?? [];
  } catch {
    return [];
  }
}

export function saveTodayOnlyTemporaryItems(
  items: TodayOnlyTemporaryItem[],
) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    todayOnlyTemporaryItemsKey,
    JSON.stringify({
      date: getTodayKey(),
      items,
    }),
  );
}

export function loadSpotAdditions(): SpotAddition[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const saved = window.localStorage.getItem(spotAdditionsKey);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveSpotAdditions(additions: SpotAddition[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(spotAdditionsKey, JSON.stringify(additions));
}

export function loadSpotDeadlines(): Record<string, string> {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const saved = window.localStorage.getItem(spotDeadlinesKey);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function saveSpotDeadlines(deadlines: Record<string, string>) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(spotDeadlinesKey, JSON.stringify(deadlines));
}

export function loadChildProfile(): ChildProfile {
  if (!canUseStorage()) {
    return defaultChildProfile;
  }

  try {
    const saved = window.localStorage.getItem(childProfileKey);
    if (!saved) {
      return defaultChildProfile;
    }

    const parsed = JSON.parse(saved) as Partial<ChildProfile>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const iconUrl =
      typeof parsed.iconUrl === "string" && parsed.iconUrl.trim()
        ? parsed.iconUrl
        : typeof parsed.photoUrl === "string" && parsed.photoUrl.trim()
          ? parsed.photoUrl
          : null;
    const iconType = parsed.iconType === "image" && iconUrl ? "image" : "default";

    return {
      ...defaultChildProfile,
      ...parsed,
      name: name || defaultChildProfile.name,
      iconType,
      iconId: parsed.iconId === "default-baby" ? parsed.iconId : "default-baby",
      iconUrl,
      photoUrl: iconUrl,
    };
  } catch {
    return defaultChildProfile;
  }
}

export function saveChildProfile(profile: ChildProfile) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(childProfileKey, JSON.stringify(profile));
}

export function createTodayOnlyTemporaryItem(
  name: string,
  count = 1,
): TodayOnlyTemporaryItem {
  return {
    id: `today-only-${Date.now()}`,
    name,
    unit: "個",
    count,
    category: "スポット追加",
    date: getTodayKey(),
  };
}

export function createPreparationSession(
  items: PreparationItem[],
): PreparationSession {
  return {
    checkedBy: "ママ",
    confirmedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    items,
    thanksSent: false,
  };
}
