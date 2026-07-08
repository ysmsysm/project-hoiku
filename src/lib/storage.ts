import type {
  CustomizableItem,
  PreparationItem,
  PreparationSession,
  TodayOnlyTemporaryItem,
} from "../types/preparation";

const sessionKey = "project-hoiku:preparation-session";
const checkCountsKey = "project-hoiku:locker-counts";
const customItemsKey = "project-hoiku:custom-items";
const todayOnlyTemporaryItemsKey = "project-hoiku:today-only-temporary-items";

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
    return saved ? JSON.parse(saved) : defaultItems;
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

    if (parsed.date !== getTodayKey()) {
      window.localStorage.removeItem(todayOnlyTemporaryItemsKey);
      return [];
    }

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

export function createTodayOnlyTemporaryItem(
  name: string,
): TodayOnlyTemporaryItem {
  return {
    id: `today-only-${Date.now()}`,
    name,
    unit: "個",
    count: 1,
    category: "今日だけ追加",
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
