"use client";

import {
  Baby,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Package,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "../src/components/BottomNav";
import { PreparationChecklist } from "../src/components/PreparationChecklist";
import { ShortageInputList } from "../src/components/ShortageInputList";
import { CardListRow } from "../src/components/ui/CardListRow";
import { ReusableCard } from "../src/components/ui/ReusableCard";
import { SectionCard } from "../src/components/ui/SectionCard";
import {
  createPreparationSession,
  createTodayOnlyTemporaryItem,
  loadCheckCounts,
  loadCustomItems,
  loadPreparationSession,
  loadTodayOnlyTemporaryItems,
  saveCheckCounts,
  saveCustomItems,
  savePreparationSession,
  saveTodayOnlyTemporaryItems,
} from "../src/lib/storage";
import type {
  AppTab,
  CustomizableItem,
  CustomItemCategory,
  LockerItem,
  PreparationItem,
  PreparationSession,
  TodayOnlyTemporaryItem,
} from "../src/types/preparation";

const defaultCustomItems: CustomizableItem[] = [
  { id: "tshirt", name: "半袖", unit: "枚", count: 3, category: "持ち物" },
  { id: "underwear", name: "下着", unit: "枚", count: 3, category: "持ち物" },
  { id: "pants", name: "ズボン", unit: "枚", count: 3, category: "持ち物" },
  { id: "bib", name: "スタイ", unit: "枚", count: 2, category: "持ち物" },
  { id: "apron", name: "お食事エプロン", unit: "枚", count: 1, category: "持ち物" },
  { id: "socks", name: "靴下", unit: "足", count: 2, category: "持ち物" },
  { id: "today-letter", name: "おたより", unit: "枚", count: 1, category: "今日だけ追加" },
  { id: "today-pool-card", name: "水遊びカード", unit: "枚", count: 1, category: "今日だけ追加" },
  { id: "today-futon", name: "布団セット", unit: "セット", count: 1, category: "今日だけ追加" },
  { id: "rough-diaper", name: "おむつ", unit: "パック", count: 1, category: "ざっくり管理" },
  { id: "rough-wipe", name: "おしりふき", unit: "パック", count: 1, category: "ざっくり管理" },
  { id: "rough-bag", name: "ビニール袋", unit: "セット", count: 1, category: "ざっくり管理" },
  { id: "rough-tissue", name: "ティッシュ", unit: "個", count: 1, category: "ざっくり管理" },
];

const roughStateOrder = ["十分", "少ない", "補充"] as const;
type RoughState = (typeof roughStateOrder)[number];
const itemCategories: CustomItemCategory[] = [
  "持ち物",
  "今日だけ追加",
  "ざっくり管理",
];

const defaultRoughStates: Record<string, RoughState> = {
  "rough-diaper": "十分",
  "rough-wipe": "少ない",
  "rough-bag": "十分",
  "rough-tissue": "補充",
};

const roughStateStyles: Record<RoughState, string> = {
  十分: "bg-success text-surface",
  少ない: "bg-warning text-text-primary",
  補充: "bg-danger text-surface",
};

const settingsItems = [
  { id: "child", label: "子ども設定", status: "" },
  { id: "items", label: "持ち物設定", status: "" },
  { id: "family", label: "家族共有", status: "準備中" },
  { id: "notification", label: "通知設定", status: "準備中" },
];

const createDefaultShortageCounts = (items: CustomizableItem[]) =>
  items.reduce<Record<string, number>>((counts, item) => {
    if (item.category === "持ち物") {
      counts[item.id] = 0;
    }

    return counts;
  }, {});

const createDefaultRoughStates = (items: CustomizableItem[]) =>
  items.reduce<Record<string, RoughState>>((states, item) => {
    if (item.category === "ざっくり管理") {
      states[item.id] = defaultRoughStates[item.id] ?? "十分";
    }

    return states;
  }, {});

const formatHistoryDate = (value: string | null) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const buildPreparationItems = (items: PreparationItem[]): PreparationItem[] =>
  Array.from(
    items.reduce<Map<string, PreparationItem>>((mergedItems, item) => {
      if (item.count <= 0) {
        return mergedItems;
      }

      const existingItem = mergedItems.get(item.id);

      mergedItems.set(item.id, {
        ...item,
        count: existingItem ? existingItem.count + item.count : item.count,
        checked: false,
        later: false,
      });

      return mergedItems;
    }, new Map()).values(),
  );

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("check");
  const [customItems, setCustomItems] =
    useState<CustomizableItem[]>(defaultCustomItems);
  const [shortageCounts, setShortageCounts] = useState(
    createDefaultShortageCounts(defaultCustomItems),
  );
  const [session, setSession] = useState<PreparationSession>({
    checkedBy: "ママ",
    confirmedAt: null,
    completedAt: null,
    items: [],
    thanksSent: false,
  });
  const [roughStates, setRoughStates] = useState<Record<string, RoughState>>(
    () => createDefaultRoughStates(defaultCustomItems),
  );
  const [selectedTodayOnlyIds, setSelectedTodayOnlyIds] = useState<string[]>([]);
  const [temporaryTodayOnlyItems, setTemporaryTodayOnlyItems] = useState<
    TodayOnlyTemporaryItem[]
  >([]);
  const [isTodayOnlySheetOpen, setIsTodayOnlySheetOpen] = useState(false);
  const [isTodayOnlyInputOpen, setIsTodayOnlyInputOpen] = useState(false);
  const [todayOnlyInputValue, setTodayOnlyInputValue] = useState("");
  const [swipedTodayOnlyItemId, setSwipedTodayOnlyItemId] = useState<
    string | null
  >(null);
  const [isItemSettingsOpen, setIsItemSettingsOpen] = useState(false);
  const todayOnlyInputRef = useRef<HTMLInputElement>(null);
  const swipeStartXRef = useRef<number | null>(null);

  useEffect(() => {
    const savedCustomItems = loadCustomItems(defaultCustomItems);
    setCustomItems(savedCustomItems);
    setShortageCounts(
      loadCheckCounts(createDefaultShortageCounts(savedCustomItems)),
    );
    setRoughStates(createDefaultRoughStates(savedCustomItems));
    setSession(loadPreparationSession());
    setTemporaryTodayOnlyItems(loadTodayOnlyTemporaryItems());
  }, []);

  useEffect(() => {
    if (isTodayOnlyInputOpen) {
      todayOnlyInputRef.current?.focus();
    }
  }, [isTodayOnlyInputOpen]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const freshTemporaryItems = loadTodayOnlyTemporaryItems();
      const freshTemporaryIds = new Set(
        freshTemporaryItems.map((item) => item.id),
      );

      setTemporaryTodayOnlyItems(freshTemporaryItems);
      setSelectedTodayOnlyIds((current) =>
        current.filter(
          (itemId) =>
            !itemId.startsWith("today-only-") ||
            freshTemporaryIds.has(itemId),
        ),
      );
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const baseLockerItems = useMemo(
    () => customItems.filter((item) => item.category === "持ち物"),
    [customItems],
  );
  const todayOnlyOptions = useMemo(
    () => customItems.filter((item) => item.category === "今日だけ追加"),
    [customItems],
  );
  const allTodayOnlyOptions = useMemo(
    () => [...todayOnlyOptions, ...temporaryTodayOnlyItems],
    [temporaryTodayOnlyItems, todayOnlyOptions],
  );
  const roughItems = useMemo(
    () => customItems.filter((item) => item.category === "ざっくり管理"),
    [customItems],
  );

  const lockerItems = useMemo<LockerItem[]>(
    () =>
      baseLockerItems.map((item) => {
        const savedCount = shortageCounts[item.id] ?? 0;

        return {
          id: item.id,
          name: item.name,
          unit: item.unit,
          requiredCount: item.count,
          shortageCount: Math.min(item.count, Math.max(0, savedCount)),
        };
      }),
    [baseLockerItems, shortageCounts],
  );
  const maxLockerRequiredCount = Math.max(
    1,
    ...lockerItems.map((item) => item.requiredCount),
  );

  const isPreparationDone =
    session.items.length === 0 ||
    session.items.every((item) => item.checked || item.later);
  const canShowPreparationStatus =
    session.items.length > 0 && isPreparationDone && Boolean(session.completedAt);
  const completedTime = session.completedAt
    ? new Intl.DateTimeFormat("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(session.completedAt))
    : "--:--";
  const lastConfirmedDate = formatHistoryDate(session.confirmedAt);
  const lastPreparedDate = formatHistoryDate(session.completedAt);

  const updateShortageCount = (itemId: string, shortageCount: number) => {
    const nextCounts = {
      ...shortageCounts,
      [itemId]: shortageCount,
    };

    setShortageCounts(nextCounts);
    saveCheckCounts(nextCounts);
  };

  const completeCheck = () => {
    const preparationItems = buildPreparationItems([
      ...createLockerPreparationItems(),
      ...createTodayOnlyPreparationItems(),
      ...createRoughPreparationItems(),
    ]);
    const nextSession = createPreparationSession(preparationItems);

    if (preparationItems.length > 0) {
      nextSession.completedAt = null;
    }

    setSession(nextSession);
    savePreparationSession(nextSession);
    setActiveTab("items");
  };

  const updateSession = (nextSession: PreparationSession) => {
    setSession(nextSession);
    savePreparationSession(nextSession);
  };

  const toggleRoughState = (itemId: string) => {
    setRoughStates((current) => {
      const currentState = current[itemId] ?? "十分";
      const currentIndex = roughStateOrder.indexOf(currentState);
      const nextState =
        roughStateOrder[(currentIndex + 1) % roughStateOrder.length];

      return {
        ...current,
        [itemId]: nextState,
      };
    });
  };

  const toggleTodayOnlyItem = (itemId: string) => {
    setSelectedTodayOnlyIds((current) =>
      current.includes(itemId)
        ? current.filter((selectedId) => selectedId !== itemId)
        : [...current, itemId],
    );
  };

  const cancelTodayOnlyInput = () => {
    setIsTodayOnlyInputOpen(false);
    setTodayOnlyInputValue("");
  };

  const closeTodayOnlySheet = () => {
    cancelTodayOnlyInput();
    setSwipedTodayOnlyItemId(null);
    setIsTodayOnlySheetOpen(false);
  };

  const startTemporaryItemSwipe = (clientX: number) => {
    swipeStartXRef.current = clientX;
  };

  const endTemporaryItemSwipe = (itemId: string, clientX: number) => {
    if (swipeStartXRef.current === null) {
      return;
    }

    const deltaX = clientX - swipeStartXRef.current;
    swipeStartXRef.current = null;

    if (deltaX < -36) {
      setSwipedTodayOnlyItemId(itemId);
      return;
    }

    if (deltaX > 24) {
      setSwipedTodayOnlyItemId(null);
    }
  };

  const addTemporaryTodayOnlyItem = () => {
    const itemName = todayOnlyInputValue.trim();

    if (!itemName) {
      cancelTodayOnlyInput();
      return;
    }

    const newItem = createTodayOnlyTemporaryItem(itemName);
    const nextItems = [...temporaryTodayOnlyItems, newItem];

    setTemporaryTodayOnlyItems(nextItems);
    saveTodayOnlyTemporaryItems(nextItems);
    setSelectedTodayOnlyIds((current) => [...current, newItem.id]);
    cancelTodayOnlyInput();
  };

  const deleteTemporaryTodayOnlyItem = (itemId: string) => {
    const nextItems = temporaryTodayOnlyItems.filter(
      (item) => item.id !== itemId,
    );

    setTemporaryTodayOnlyItems(nextItems);
    saveTodayOnlyTemporaryItems(nextItems);
    setSelectedTodayOnlyIds((current) =>
      current.filter((selectedId) => selectedId !== itemId),
    );
    setSwipedTodayOnlyItemId(null);
  };

  const createLockerPreparationItems = (): PreparationItem[] =>
    lockerItems.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      count: Math.max(0, item.requiredCount - item.shortageCount),
      checked: false,
      later: false,
    }));

  const createTodayOnlyPreparationItems = (): PreparationItem[] =>
    allTodayOnlyOptions
      .filter((item) => selectedTodayOnlyIds.includes(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        count: item.count,
        checked: false,
        later: false,
      }));

  const createRoughPreparationItems = (): PreparationItem[] =>
    roughItems
      .filter((item) => roughStates[item.id] === "補充")
      .map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        count: item.count,
        checked: false,
        later: false,
      }));

  const togglePreparationItem = (itemId: string) => {
    const nextItems = session.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            checked: !item.checked,
            later: !item.checked ? false : item.later,
          }
        : item,
    );
    const allChecked = nextItems.every((item) => item.checked || item.later);
    const nextSession = {
      ...session,
      items: nextItems,
      completedAt: allChecked
        ? session.completedAt ?? new Date().toISOString()
        : null,
      thanksSent: allChecked ? session.thanksSent : false,
    };

    updateSession(nextSession);
  };

  const checkAllPreparationItems = () => {
    const allChecked = session.items.every((item) => item.checked);
    const nextItems = session.items.map((item) => ({
      ...item,
      checked: !allChecked,
      later: !allChecked ? false : item.later,
    }));
    const nextSession = {
      ...session,
      items: nextItems,
      completedAt: allChecked ? null : new Date().toISOString(),
      thanksSent: allChecked ? false : session.thanksSent,
    };

    updateSession(nextSession);
  };

  const togglePreparationItemLater = (itemId: string) => {
    const nextItems = session.items.map((item) =>
      item.id === itemId
        ? { ...item, later: item.checked ? false : !item.later }
        : item,
    );
    const allDone = nextItems.every((item) => item.checked || item.later);
    const nextSession = {
      ...session,
      items: nextItems,
      completedAt: allDone ? session.completedAt : null,
      thanksSent: allDone ? session.thanksSent : false,
    };

    updateSession(nextSession);
  };

  const completePreparation = () => {
    const nextItems = session.items.map((item) => ({
      ...item,
      checked: item.later ? item.checked : true,
    }));

    updateSession({
      ...session,
      items: nextItems,
      completedAt: new Date().toISOString(),
    });
  };

  const sendThanks = () => {
    updateSession({
      ...session,
      thanksSent: !session.thanksSent,
    });
  };

  const updateCustomItems = (nextItems: CustomizableItem[]) => {
    setCustomItems(nextItems);
    saveCustomItems(nextItems);
  };

  const addCustomItem = () => {
    const newItem: CustomizableItem = {
      id: `custom-${Date.now()}`,
      name: "新しい持ち物",
      unit: "個",
      count: 1,
      category: "持ち物",
    };

    updateCustomItems([...customItems, newItem]);
    setShortageCounts((current) => {
      const nextCounts = { ...current, [newItem.id]: 0 };
      saveCheckCounts(nextCounts);
      return nextCounts;
    });
  };

  const updateCustomItem = (
    itemId: string,
    changes: Partial<Omit<CustomizableItem, "id">>,
  ) => {
    const nextItems = customItems.map((item) =>
      item.id === itemId ? { ...item, ...changes } : item,
    );

    updateCustomItems(nextItems);

    if (changes.category === "持ち物") {
      setShortageCounts((current) => {
        if (current[itemId] !== undefined) {
          return current;
        }

        const nextCounts = { ...current, [itemId]: 0 };
        saveCheckCounts(nextCounts);
        return nextCounts;
      });
    }

    if (changes.category === "ざっくり管理") {
      setRoughStates((current) => ({
        ...current,
        [itemId]: current[itemId] ?? "十分",
      }));
    }
  };

  const deleteCustomItem = (itemId: string) => {
    updateCustomItems(customItems.filter((item) => item.id !== itemId));
    setSelectedTodayOnlyIds((current) =>
      current.filter((selectedId) => selectedId !== itemId),
    );
    setShortageCounts((current) => {
      const { [itemId]: _deletedCount, ...nextCounts } = current;
      saveCheckCounts(nextCounts);
      return nextCounts;
    });
    setRoughStates((current) => {
      const { [itemId]: _deletedState, ...nextStates } = current;
      return nextStates;
    });
    updateSession({
      ...session,
      items: session.items.filter((item) => item.id !== itemId),
    });
  };

  return (
    <main
      className={`min-h-screen ${
        activeTab === "settings" ? "bg-[#fbfcfb]" : "bg-background"
      }`}
    >
      <div
        className={`mx-auto flex min-h-screen w-full max-w-[430px] flex-col pb-[calc(98px_+_env(safe-area-inset-bottom))] pt-5 ${
          activeTab === "check" ? "px-6" : "px-5"
        }`}
      >
        <header className="mb-4 rounded-card bg-surface p-4 shadow-card ring-1 ring-border-soft">
          <p className="sr-only">
            Project Hoiku
          </p>
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-avatar bg-[#f8ead8] text-[#c78b4f] shadow-card">
              <Baby size={30} strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[24px] font-bold leading-none tracking-normal text-text-primary">
                そうた
              </h1>
            </div>
            <div className="h-16 w-px shrink-0 bg-divider" />
            <div className="ml-auto flex min-w-0 flex-1 flex-col justify-center gap-2 text-status font-normal text-text-primary">
              {activeTab === "check" || activeTab === "items" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-[16px_1.8rem_max-content_max-content] items-center justify-start gap-1 text-status font-normal">
                    <CheckCircle2 size={16} className="text-[#3b9de9]" strokeWidth={2.2} />
                    <span className="whitespace-nowrap">確認</span>
                    <span className="rounded-button bg-card-items px-2 py-0.5 text-center text-status font-normal text-icon-items">
                      {lastConfirmedDate ? session.checkedBy : "未確認"}
                    </span>
                    <span className="whitespace-nowrap text-right text-status font-normal">
                      {lastConfirmedDate ?? "--"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[16px_1.8rem_max-content_max-content] items-center justify-start gap-1 text-status font-normal">
                    <span className="h-4 w-4 rounded-button border-2 border-dashed border-text-tertiary" />
                    <span className="whitespace-nowrap">準備</span>
                    <span className="rounded-button bg-[#eeeeee] px-2 py-0.5 text-center text-status font-normal text-text-secondary">
                      {lastPreparedDate ? session.checkedBy : "まだ"}
                    </span>
                    <span className="whitespace-nowrap text-right text-status font-normal">
                      {lastPreparedDate ?? "--"}
                    </span>
                  </div>
                  {activeTab === "items" && canShowPreparationStatus ? (
                    <button
                      type="button"
                      onClick={sendThanks}
                      className="ml-auto block rounded-button bg-tab-active px-3 py-1 text-status font-normal text-danger ring-1 ring-[#ffd1dc]"
                    >
                      {session.thanksSent ? "✓ ありがとう済み" : "♡ ありがとう"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {activeTab === "check" ? (
          <div className="space-y-5 pb-24">
            <ShortageInputList
              items={lockerItems}
              onChange={updateShortageCount}
            />

            <ReusableCard
              title="今日だけ追加"
              icon={<CalendarDays size={22} strokeWidth={2.1} />}
              tone="pink"
              action={
                <button
                  type="button"
                  onClick={() => setIsTodayOnlySheetOpen(true)}
                  className="-mt-1 inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-button bg-surface px-5 text-number font-normal text-danger ring-1 ring-danger/30 transition active:scale-95"
                >
                  <Plus size={18} strokeWidth={2.5} className="text-icon-today" />
                  持ち物を追加
                </button>
              }
              contentClassName="grid min-h-[56px] place-items-center rounded-section bg-surface px-5 py-4 shadow-card"
            >
              {selectedTodayOnlyIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {allTodayOnlyOptions
                    .filter((item) => selectedTodayOnlyIds.includes(item.id))
                    .map((item) => (
                      <span
                        key={item.id}
                        className="max-w-full truncate whitespace-nowrap rounded-button bg-surface px-4 py-2 text-number font-normal text-text-primary ring-1 ring-border-soft"
                      >
                        {item.name}
                      </span>
                    ))}
                </div>
              ) : (
                <p className="whitespace-nowrap text-number font-normal text-text-secondary">
                  追加の持ち物はありません
                </p>
              )}
            </ReusableCard>

            <ReusableCard
              title="ざっくり管理"
              icon={<Package size={22} strokeWidth={2.1} />}
              tone="green"
            >
              {roughItems.map((item) => (
                <CardListRow
                  key={item.id}
                  as="button"
                  onClick={() => toggleRoughState(item.id)}
                  left={item.name}
                  center={
                    <div
                      className="grid w-36 items-center"
                      style={{
                        gridTemplateColumns: `repeat(${
                          maxLockerRequiredCount + 1
                        }, minmax(0, 1fr))`,
                      }}
                    >
                      <div
                        className="flex min-w-0 items-center gap-2"
                        style={{ gridColumn: "2 / -1" }}
                      >
                      <span
                        className={`h-5 w-5 shrink-0 rounded-full ${
                          roughStateStyles[roughStates[item.id] ?? "十分"]
                        }`}
                      />
                      <span className="truncate">
                        {roughStates[item.id] ?? "十分"}
                      </span>
                      </div>
                    </div>
                  }
                  right={`${item.count}${item.unit}`}
                />
              ))}
            </ReusableCard>
          </div>
        ) : null}

        {activeTab === "items" ? (
          <div className="space-y-5">
            <PreparationChecklist
              items={session.items}
              onToggle={togglePreparationItem}
              onCheckAll={checkAllPreparationItems}
              onToggleLater={togglePreparationItemLater}
              onComplete={completePreparation}
            />
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <SectionCard appearance="current">
            <h2 className="text-card-title font-semibold tracking-normal text-hoiku-ink">
              設定
            </h2>
            <div className="mt-4 divide-y divide-[#edf3ef]">
              {settingsItems.map((item) => (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.id === "items") {
                        setIsItemSettingsOpen((current) => !current);
                      }
                    }}
                    className="flex min-h-[50px] w-full items-center justify-between gap-4 py-2 text-left"
                  >
                    <span className="text-list-item font-medium text-hoiku-ink">
                      {item.label}
                    </span>
                    {item.id === "items" ? (
                      <span className="shrink-0 text-number font-normal text-[#7a867e]">
                        {isItemSettingsOpen ? "閉じる" : "編集"}
                      </span>
                    ) : item.status ? (
                      <span className="shrink-0 rounded-full bg-hoiku-mint px-3 py-1 text-number font-normal text-hoiku-deep">
                        {item.status}
                      </span>
                    ) : null}
                  </button>

                  {item.id === "items" && isItemSettingsOpen ? (
                    <div className="pb-4">
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8fbf9] px-3 py-2 ring-1 ring-[#edf3ef]">
                        <h3 className="text-card-title font-semibold text-hoiku-ink">
                          持ち物カスタマイズ
                        </h3>
                        <button
                          type="button"
                          onClick={addCustomItem}
                          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-hoiku-mint px-3 text-number font-normal text-hoiku-deep transition active:scale-95"
                        >
                          <Plus size={15} strokeWidth={2.6} />
                          追加
                        </button>
                      </div>

                      <div className="mt-3 space-y-2.5">
                        {customItems.map((customItem) => (
                          <div
                            key={customItem.id}
                            className="rounded-2xl bg-[#f8fbf9] p-2.5 ring-1 ring-[#edf3ef]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-status font-normal text-[#7a867e]">
                                持ち物名
                              </label>
                              <button
                                type="button"
                                onClick={() => deleteCustomItem(customItem.id)}
                                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 text-status font-normal text-[#b45a53] ring-1 ring-[#f0d8d5] transition active:scale-95"
                              >
                                <Trash2 size={13} strokeWidth={2.4} />
                                削除
                              </button>
                            </div>

                            <input
                              type="text"
                              value={customItem.name}
                              onChange={(event) =>
                                updateCustomItem(customItem.id, {
                                  name: event.target.value,
                                })
                              }
                              className="mt-1.5 h-9 w-full rounded-xl bg-surface px-3 text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green"
                            />

                            <div className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                              <div>
                                <label className="block text-status font-normal text-[#7a867e]">
                                  数量
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={customItem.count}
                                  onChange={(event) =>
                                    updateCustomItem(customItem.id, {
                                      count: Math.max(
                                        1,
                                        Number(event.target.value) || 1,
                                      ),
                                    })
                                  }
                                  className="mt-1 h-9 w-full rounded-xl bg-surface px-2.5 text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green"
                                />
                              </div>

                              <div>
                                <label className="block text-status font-normal text-[#7a867e]">
                                  表示カテゴリ
                                </label>
                                <select
                                  value={customItem.category}
                                  onChange={(event) =>
                                    updateCustomItem(customItem.id, {
                                      category: event.target
                                        .value as CustomItemCategory,
                                    })
                                  }
                                  className="mt-1 h-9 w-full rounded-xl bg-surface px-2.5 text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green"
                                >
                                  {itemCategories.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>

      {activeTab === "check" ? (
        <div className="fixed inset-x-0 bottom-[calc(88px_+_env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-[430px] px-6">
          <button
            type="button"
            onClick={completeCheck}
            className="h-[52px] w-full rounded-button bg-primary text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99]"
          >
            確認完了
          </button>
        </div>
      ) : null}

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      {isTodayOnlySheetOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="閉じる"
            className="absolute inset-0 h-full w-full bg-black/20"
            onClick={closeTodayOnlySheet}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto h-[54dvh] w-full max-w-[430px] rounded-t-card bg-surface px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 shadow-floating">
            <div className="mx-auto h-1.5 w-11 rounded-button bg-divider" />
            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-card-title font-semibold text-text-primary">
                今日だけ追加
              </h2>
              <button
                type="button"
                aria-label="シートを閉じる"
                onClick={closeTodayOnlySheet}
                className="grid h-10 w-10 place-items-center rounded-button bg-card-today text-icon-today transition active:scale-95"
              >
                <ChevronDown size={22} />
              </button>
            </div>
              <div className="mt-4 max-h-[calc(54dvh-104px)] space-y-3 overflow-y-auto pb-2">
                {allTodayOnlyOptions.map((item) => {
                  const isTemporaryItem = temporaryTodayOnlyItems.some(
                    (temporaryItem) => temporaryItem.id === item.id,
                  );
                  const isSelected = selectedTodayOnlyIds.includes(item.id);
                  const isSwiped = swipedTodayOnlyItemId === item.id;

                  const itemButton = (
                    <button
                      type="button"
                      onClick={() => {
                        if (isSwiped) {
                          setSwipedTodayOnlyItemId(null);
                          return;
                        }

                        toggleTodayOnlyItem(item.id);
                      }}
                      className={`flex h-14 w-full items-center justify-between rounded-section bg-card-today px-4 text-left text-list-item font-medium text-text-primary ring-1 ring-border-soft transition active:scale-[0.99] ${
                        isTemporaryItem && isSwiped ? "-translate-x-20" : ""
                      }`}
                    >
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span
                        className={`ml-3 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                          isSelected
                            ? "bg-primary text-surface"
                            : "bg-surface text-icon-today"
                        }`}
                      >
                        {isSelected ? (
                          <Check size={18} strokeWidth={2.6} />
                        ) : (
                          <Plus size={18} strokeWidth={2.6} />
                        )}
                      </span>
                    </button>
                  );

                  if (!isTemporaryItem) {
                    return <div key={item.id}>{itemButton}</div>;
                  }

                  return (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-section"
                      onPointerDown={(event) =>
                        startTemporaryItemSwipe(event.clientX)
                      }
                      onPointerUp={(event) =>
                        endTemporaryItemSwipe(item.id, event.clientX)
                      }
                      onPointerCancel={() => {
                        swipeStartXRef.current = null;
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => deleteTemporaryTodayOnlyItem(item.id)}
                        className="absolute inset-y-0 right-0 grid w-20 place-items-center rounded-section bg-danger text-number font-normal text-surface"
                      >
                        削除
                      </button>
                      {itemButton}
                    </div>
                  );
                })}
                {isTodayOnlyInputOpen ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      addTemporaryTodayOnlyItem();
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        cancelTodayOnlyInput();
                      }
                    }}
                    className="flex h-14 w-full items-center gap-2 rounded-section bg-surface px-4 ring-1 ring-border-soft"
                  >
                    <input
                      ref={todayOnlyInputRef}
                      type="text"
                      value={todayOnlyInputValue}
                      onChange={(event) => setTodayOnlyInputValue(event.target.value)}
                      placeholder="持ち物名"
                      className="min-w-0 flex-1 bg-transparent text-list-item font-medium text-text-primary outline-none placeholder:text-text-tertiary"
                    />
                    <button
                      type="button"
                      aria-label="入力をキャンセル"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={cancelTodayOnlyInput}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-button bg-card-today text-icon-today transition active:scale-95"
                    >
                      <X size={16} strokeWidth={2.4} />
                    </button>
                    <button
                      type="submit"
                      onMouseDown={(event) => event.preventDefault()}
                      className="h-9 shrink-0 rounded-button bg-primary px-4 text-number font-normal text-surface transition active:scale-95"
                    >
                      追加
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsTodayOnlyInputOpen(true)}
                    className="flex h-14 w-full items-center gap-2 rounded-section bg-surface px-4 text-left text-list-item font-medium text-icon-today ring-1 ring-border-soft transition active:scale-[0.99]"
                  >
                    <Plus size={18} strokeWidth={2.5} />
                    持ち物を入力...
                  </button>
                )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
