import type {
  CustomizableItem,
  PreparationItem,
  PreparationSession,
} from "../types/preparation";

const sessionKey = "project-hoiku:preparation-session";
const checkCountsKey = "project-hoiku:locker-counts";
const customItemsKey = "project-hoiku:custom-items";

const defaultSession: PreparationSession = {
  checkedBy: "ママ",
  confirmedAt: null,
  completedAt: null,
  items: [],
  thanksSent: false,
};

const canUseStorage = () => typeof window !== "undefined";

export function loadPreparationSession(): PreparationSession {
  if (!canUseStorage()) {
    return defaultSession;
  }

  try {
    const saved = window.localStorage.getItem(sessionKey);
    return saved ? { ...defaultSession, ...JSON.parse(saved) } : defaultSession;
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
