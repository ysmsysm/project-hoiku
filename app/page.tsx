"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Package,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssigneeBadge } from "../src/components/AssigneeBadge";
import { BabyHeader } from "../src/components/BabyHeader";
import { BabyAvatar } from "../src/components/BabyAvatar";
import { BottomNav } from "../src/components/BottomNav";
import { PreparationChecklist } from "../src/components/PreparationChecklist";
import { ShortageInputList } from "../src/components/ShortageInputList";
import { SpotQuantityControl } from "../src/components/SpotQuantityControl";
import {
  CardListRow,
  getCardListRowIndicatorWidth,
} from "../src/components/ui/CardListRow";
import { IconButton } from "../src/components/ui/IconButton";
import { ReusableCard } from "../src/components/ui/ReusableCard";
import { SectionCard } from "../src/components/ui/SectionCard";
import {
  createPreparationSession,
  createTodayOnlyTemporaryItem,
  defaultChildProfile,
  loadChildProfile,
  loadCheckCounts,
  loadCustomItems,
  loadPreparationSession,
  loadSpotAdditions,
  loadSpotDeadlines,
  loadTodayOnlyTemporaryItems,
  saveCheckCounts,
  saveChildProfile,
  saveCustomItems,
  savePreparationSession,
  saveSpotAdditions,
  saveSpotDeadlines,
  saveTodayOnlyTemporaryItems,
} from "../src/lib/storage";
import {
  getTodayDateKey,
  getTomorrowDateKey,
  isSpotDeadlineEnabled,
} from "../src/lib/deadline";
import { clampSpotQuantity, formatSpotItemName } from "../src/lib/spotQuantity";
import { useEditableSection } from "../src/hooks/useEditableSection";
import type { ChildProfile } from "../src/types/child";
import type { SpotAddition } from "../src/types/spot";
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
  {
    id: "apron",
    name: "お食事エプロン",
    unit: "枚",
    count: 1,
    category: "持ち物",
  },
  { id: "socks", name: "靴下", unit: "足", count: 2, category: "持ち物" },
  { id: "today-letter", name: "おたより", unit: "枚", count: 1, category: "スポット追加" },
  {
    id: "today-pool-card",
    name: "水遊びカード",
    unit: "枚",
    count: 1,
    category: "スポット追加",
  },
  {
    id: "today-futon",
    name: "布団セット",
    unit: "セット",
    count: 1,
    category: "スポット追加",
  },
  { id: "rough-diaper", name: "おむつ", unit: "パック", count: 1, category: "ざっくり管理" },
  { id: "rough-wipe", name: "おしりふき", unit: "パック", count: 1, category: "ざっくり管理" },
  { id: "rough-bag", name: "ビニール袋", unit: "セット", count: 1, category: "ざっくり管理" },
  { id: "rough-tissue", name: "ティッシュ", unit: "個", count: 1, category: "ざっくり管理" },
];

const roughStateOrder = ["十分", "少ない", "補充"] as const;
type RoughState = (typeof roughStateOrder)[number];

const itemCategories: CustomItemCategory[] = [
  "持ち物",
  "スポット追加",
  "ざっくり管理",
];

const weekdayOptions = [
  { value: 0, label: "日" },
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
];

const roughStateStyles: Record<RoughState, string> = {
  十分: "bg-success text-surface",
  少ない: "bg-warning text-text-primary",
  補充: "bg-danger text-surface",
};

const defaultRoughStates: Record<string, RoughState> = {
  "rough-diaper": "十分",
  "rough-wipe": "少ない",
  "rough-bag": "十分",
  "rough-tissue": "補充",
};

const settingsItems = [
  { id: "child", label: "こども設定", status: "", enabled: true },
  { id: "items", label: "持ち物設定", status: "", enabled: true },
  { id: "family", label: "家族共有", status: "準備中", enabled: false },
  { id: "notification", label: "通知設定", status: "準備中", enabled: false },
];

const otherSettingsItems = [
  { id: "about", label: "このアプリについて", value: "準備中" },
  { id: "terms", label: "利用規約", value: "準備中" },
  { id: "privacy", label: "プライバシーポリシー", value: "準備中" },
  { id: "contact", label: "お問い合わせ", value: "準備中" },
  { id: "version", label: "バージョン", value: "v1.0.0" },
];

const childSettingsSectionId = "child-settings";

const validateChildName = (value: string) =>
  value.trim() ? null : "名前を入力してください";

const cardStackClassName = "space-y-5";
const settingsSectionStackClassName = "space-y-4";
const quantityInputClassName =
  "h-11 w-14 rounded-xl bg-surface px-2 text-center text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green disabled:bg-transparent disabled:ring-transparent";

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

const normalizeCustomItems = (items: CustomizableItem[]) => {
  const categories = new Set<CustomItemCategory>(itemCategories);
  const normalized = items.filter((item) => categories.has(item.category));

  return normalized.length > 0 ? normalized : defaultCustomItems;
};

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

const formatSpotDueDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return `${month}/${day}`;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day);
};

const getMonthKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const parseMonthKey = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);

  return new Date(year, month - 1, 1);
};

const shiftMonthKey = (monthKey: string, offset: number) => {
  const monthDate = parseMonthKey(monthKey);
  monthDate.setMonth(monthDate.getMonth() + offset);

  return getMonthKey(monthDate);
};

const formatCalendarMonth = (monthKey: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(parseMonthKey(monthKey));

const createCalendarDays = (monthKey: string) => {
  const monthStart = parseMonthKey(monthKey);
  const firstDay = new Date(monthStart);
  firstDay.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);

    return {
      key: toDateKey(date),
      label: date.getDate(),
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
    };
  });
};

type SpotDeadlinePickerState = {
  itemId: string;
  temporaryDate: string;
  visibleMonth: string;
};

type SpotDeadlineCalendarProps = {
  picker: SpotDeadlinePickerState;
  onCancel: () => void;
  onConfirm: () => void;
  onSelectDate: (dateKey: string) => void;
  onShiftMonth: (offset: number) => void;
};

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function SpotDeadlineCalendar({
  picker,
  onCancel,
  onConfirm,
  onSelectDate,
  onShiftMonth,
}: SpotDeadlineCalendarProps) {
  const todayKey = getTodayDateKey();
  const days = createCalendarDays(picker.visibleMonth);

  return (
    <div className="absolute inset-0 z-20">
      <button
        type="button"
        aria-label="カレンダーを閉じる"
        onClick={onCancel}
        className="absolute inset-0 h-full w-full bg-surface/75"
      />
      <div
        className="absolute inset-x-4 top-4 max-h-[calc(100%-2rem)] overflow-y-auto rounded-section bg-surface p-3 shadow-floating ring-1 ring-danger/20"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="前の月"
            onClick={() => onShiftMonth(-1)}
            className="grid h-9 w-9 place-items-center rounded-button bg-card-today text-icon-today transition active:scale-95"
          >
            <ChevronRight className="rotate-180" size={20} strokeWidth={2.2} />
          </button>
          <div className="text-list-item font-semibold text-text-primary">
            {formatCalendarMonth(picker.visibleMonth)}
          </div>
          <button
            type="button"
            aria-label="次の月"
            onClick={() => onShiftMonth(1)}
            className="grid h-9 w-9 place-items-center rounded-button bg-card-today text-icon-today transition active:scale-95"
          >
            <ChevronRight size={20} strokeWidth={2.2} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-caption font-normal text-text-tertiary">
          {weekdayLabels.map((weekday) => (
            <div key={weekday}>{weekday}</div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const isSelected = day.key === picker.temporaryDate;
            const isToday = day.key === todayKey;

            return (
              <button
                key={day.key}
                type="button"
                onClick={() => onSelectDate(day.key)}
                className={`grid h-8 place-items-center rounded-full text-status font-normal transition active:scale-95 ${
                  isSelected
                    ? "bg-primary text-surface"
                    : isToday
                      ? "bg-card-today text-danger ring-1 ring-danger/20"
                      : day.isCurrentMonth
                        ? "text-text-primary"
                        : "text-text-tertiary"
                }`}
              >
                {day.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            aria-label="キャンセル"
            onClick={onCancel}
            className="grid h-10 w-10 place-items-center rounded-button bg-card-today text-icon-today transition active:scale-95"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            aria-label="期限を確定"
            onClick={onConfirm}
            className="grid h-10 w-10 place-items-center rounded-button bg-primary text-surface shadow-button transition active:scale-95"
          >
            <CheckCircle2 size={20} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

const formatSpotChipLabel = (
  item: Pick<CustomizableItem, "name" | "count">,
  dueDate?: string | null,
) => {
  const quantity = item.count > 1 ? ` ×${item.count}` : "";
  const deadline =
    dueDate && dueDate !== getTomorrowDateKey() ? formatSpotDueDate(dueDate) : null;

  return `${item.name}${quantity}${deadline ? `（〆${deadline}）` : ""}`;
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
  const [childProfile, setChildProfile] =
    useState<ChildProfile>(defaultChildProfile);
  const childNameEditor = useEditableSection({
    initialValue: defaultChildProfile.name,
    validate: validateChildName,
    onSave: (name) => {
      const trimmedName = name.trim().slice(0, 8);
      const nextProfile: ChildProfile = {
        ...childProfile,
        name: trimmedName,
      };

      setChildProfile(nextProfile);
      saveChildProfile(nextProfile);
    },
  });
  const setSavedChildName = childNameEditor.setSavedValue;
  const setChildNameDraft = childNameEditor.setDraftValue;
  const [roughStates, setRoughStates] = useState<Record<string, RoughState>>(
    () => createDefaultRoughStates(defaultCustomItems),
  );
  const [selectedTodayOnlyIds, setSelectedTodayOnlyIds] = useState<string[]>([]);
  const [spotAdditions, setSpotAdditions] = useState<SpotAddition[]>([]);
  const [spotDeadlines, setSpotDeadlines] = useState<Record<string, string>>({});
  const [spotDeadlinePicker, setSpotDeadlinePicker] =
    useState<SpotDeadlinePickerState | null>(null);
  const [temporaryTodayOnlyItems, setTemporaryTodayOnlyItems] = useState<
    TodayOnlyTemporaryItem[]
  >([]);
  const [isTodayOnlySheetOpen, setIsTodayOnlySheetOpen] = useState(false);
  const [isTodayOnlyInputOpen, setIsTodayOnlyInputOpen] = useState(false);
  const [todayOnlyInputValue, setTodayOnlyInputValue] = useState("");
  const [todayOnlyInputQuantity, setTodayOnlyInputQuantity] = useState(1);
  const [swipedTodayOnlyItemId, setSwipedTodayOnlyItemId] = useState<
    string | null
  >(null);
  const [swipingTodayOnlyItemId, setSwipingTodayOnlyItemId] = useState<
    string | null
  >(null);
  const [todayOnlySwipeOffset, setTodayOnlySwipeOffset] = useState(0);
  const [isChildSettingsOpen, setIsChildSettingsOpen] = useState(false);
  const [activeEditingSectionId, setActiveEditingSectionId] = useState<
    string | null
  >(null);
  const [isDiscardChildDialogOpen, setIsDiscardChildDialogOpen] =
    useState(false);
  const [isItemSettingsOpen, setIsItemSettingsOpen] = useState(false);
  const [selectedItemSettingsCategory, setSelectedItemSettingsCategory] =
    useState<CustomItemCategory | null>(null);
  const [customItemQuantityInputs, setCustomItemQuantityInputs] = useState<
    Record<string, string>
  >({});
  const [pendingFocusItemId, setPendingFocusItemId] = useState<string | null>(
    null,
  );
  const [isZeroQuantityToastVisible, setIsZeroQuantityToastVisible] =
    useState(false);
  const [sortingCategory, setSortingCategory] =
    useState<CustomItemCategory | null>(null);
  const [addingCategory, setAddingCategory] =
    useState<CustomItemCategory | null>(null);
  const [newCustomItemDraft, setNewCustomItemDraft] = useState({
    name: "",
    count: "1",
    unit: "",
    weekdays: [] as number[],
  });
  const [expandedWeekdayItemId, setExpandedWeekdayItemId] = useState<
    string | null
  >(null);
  const [draggingCustomItemId, setDraggingCustomItemId] = useState<
    string | null
  >(null);
  const todayOnlyInputRef = useRef<HTMLInputElement>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const customItemNameRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const newCustomItemNameRef = useRef<HTMLInputElement>(null);
  const zeroQuantityToastTimeoutRef = useRef<number | null>(null);
  const customItemDragOverIdRef = useRef<string | null>(null);
  const customItemReorderAnimationFrameRef = useRef<number | null>(null);
  const previousActiveTabRef = useRef<AppTab>(activeTab);

  useEffect(() => {
    const savedChildProfile = loadChildProfile();
    const savedCustomItems = normalizeCustomItems(
      loadCustomItems(defaultCustomItems),
    );
    setChildProfile(savedChildProfile);
    setSavedChildName(savedChildProfile.name);
    setChildNameDraft(savedChildProfile.name);
    setCustomItems(savedCustomItems);
    setShortageCounts(
      loadCheckCounts(createDefaultShortageCounts(savedCustomItems)),
    );
    setRoughStates(createDefaultRoughStates(savedCustomItems));
    setSession(loadPreparationSession());
    setTemporaryTodayOnlyItems(loadTodayOnlyTemporaryItems());
    const savedSpotAdditions = loadSpotAdditions();
    setSpotAdditions(savedSpotAdditions);
    setSelectedTodayOnlyIds(savedSpotAdditions.map((addition) => addition.itemId));
    setSpotDeadlines(loadSpotDeadlines());
    setCustomItemQuantityInputs(
      Object.fromEntries(
        savedCustomItems.map((item) => [item.id, String(item.count)]),
      ),
    );
  }, [setChildNameDraft, setSavedChildName]);

  useEffect(() => {
    if (
      activeTab === "settings" &&
      previousActiveTabRef.current !== "settings"
    ) {
      setIsChildSettingsOpen(false);
      setIsDiscardChildDialogOpen(false);
      childNameEditor.discardChanges();
      setActiveEditingSectionId(null);
    }

    previousActiveTabRef.current = activeTab;
  }, [activeTab, childNameEditor]);

  useEffect(() => {
    const today = new Date();
    const todayWeekday = today.getDay();
    const todayKey = getTodayDateKey();
    const wasPreparedToday = session.completedAt?.slice(0, 10) === todayKey;

    if (wasPreparedToday) {
      return;
    }

    setSpotAdditions((current) => {
      const additionsById = new Map(
        current.map((addition) => [addition.itemId, addition]),
      );

      customItems
        .filter(
          (item) =>
            item.category === "スポット追加" &&
            item.count > 0 &&
            item.weekdays?.includes(todayWeekday),
        )
        .forEach((item) => {
          if (!additionsById.has(item.id)) {
            additionsById.set(item.id, {
              itemId: item.id,
              dueDate: spotDeadlines[item.id] ?? null,
            });
          }
        });

      const nextAdditions = Array.from(additionsById.values());

      if (
        nextAdditions.length === current.length &&
        nextAdditions.every(
          (addition, index) =>
            addition.itemId === current[index]?.itemId &&
            addition.dueDate === current[index]?.dueDate,
        )
      ) {
        return current;
      }

      saveSpotAdditions(nextAdditions);
      setSelectedTodayOnlyIds(nextAdditions.map((addition) => addition.itemId));
      return nextAdditions;
    });
  }, [customItems, session.completedAt, spotDeadlines]);

  useEffect(() => {
    if (isTodayOnlyInputOpen) {
      todayOnlyInputRef.current?.focus();
    }
  }, [isTodayOnlyInputOpen]);

  useEffect(() => {
    if (addingCategory) {
      newCustomItemNameRef.current?.focus();
    }
  }, [addingCategory]);

  useEffect(() => {
    if (!pendingFocusItemId) {
      return;
    }

    customItemNameRefs.current[pendingFocusItemId]?.focus();
    setPendingFocusItemId(null);
  }, [customItems, pendingFocusItemId]);

  useEffect(
    () => () => {
      if (zeroQuantityToastTimeoutRef.current !== null) {
        window.clearTimeout(zeroQuantityToastTimeoutRef.current);
      }

      if (customItemReorderAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(customItemReorderAnimationFrameRef.current);
      }
    },
    [],
  );

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
    () =>
      customItems.filter(
        (item) => item.category === "持ち物" && item.count > 0,
      ),
    [customItems],
  );
  const todayOnlyOptions = useMemo(
    () =>
      customItems.filter(
        (item) => item.category === "スポット追加" && item.count > 0,
      ),
    [customItems],
  );
  const allTodayOnlyOptions = useMemo(
    () => [...todayOnlyOptions, ...temporaryTodayOnlyItems],
    [temporaryTodayOnlyItems, todayOnlyOptions],
  );
  const roughItems = useMemo(
    () =>
      customItems.filter(
        (item) => item.category === "ざっくり管理" && item.count > 0,
      ),
    [customItems],
  );

  const lockerItems: LockerItem[] = useMemo(
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
  const lockerIndicatorColumnWidth = getCardListRowIndicatorWidth(
    maxLockerRequiredCount + 1,
  );

  const isPreparationDone =
    session.items.length === 0 ||
    session.items.every((item) => item.checked || item.later);
  const hasCarryoverItems = session.items.some((item) => item.carryover);
  const isCurrentPreparationDone = isPreparationDone && !hasCarryoverItems;
  const canShowPreparationStatus =
    session.items.length > 0 &&
    isCurrentPreparationDone &&
    Boolean(session.completedAt);
  const lastConfirmedDate = formatHistoryDate(session.confirmedAt);
  const lastPreparedDate = formatHistoryDate(
    isCurrentPreparationDone ? session.completedAt : null,
  );
  const updateSession = (nextSession: PreparationSession) => {
    setSession(nextSession);
    savePreparationSession(nextSession);
  };

  const updateShortageCount = (itemId: string, nextCount: number) => {
    setShortageCounts((current) => {
      const nextCounts = { ...current, [itemId]: nextCount };
      saveCheckCounts(nextCounts);
      return nextCounts;
    });
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

  const updateSpotAdditions = (nextAdditions: SpotAddition[]) => {
    setSpotAdditions(nextAdditions);
    setSelectedTodayOnlyIds(nextAdditions.map((addition) => addition.itemId));
    saveSpotAdditions(nextAdditions);
  };

  const updateSpotDeadlines = (nextDeadlines: Record<string, string>) => {
    setSpotDeadlines(nextDeadlines);
    saveSpotDeadlines(nextDeadlines);
  };

  const updateTemporaryTodayOnlyItems = (nextItems: TodayOnlyTemporaryItem[]) => {
    setTemporaryTodayOnlyItems(nextItems);
    saveTodayOnlyTemporaryItems(nextItems);
  };

  const addSpotItem = (itemId: string, dueDate: string | null = null) => {
    const nextAdditions = [
      ...spotAdditions.filter((addition) => addition.itemId !== itemId),
      { itemId, dueDate },
    ];

    updateSpotAdditions(nextAdditions);
  };

  const removeSpotItem = (itemId: string) => {
    updateSpotAdditions(
      spotAdditions.filter((addition) => addition.itemId !== itemId),
    );
  };

  const toggleSpotItem = (itemId: string) => {
    if (selectedTodayOnlyIds.includes(itemId)) {
      removeSpotItem(itemId);
      return;
    }

    addSpotItem(itemId, spotDeadlines[itemId] ?? null);
  };

  const saveSpotDeadline = (itemId: string, dueDate: string) => {
    if (!dueDate) {
      return;
    }

    const nextDeadlines = { ...spotDeadlines, [itemId]: dueDate };
    updateSpotDeadlines(nextDeadlines);

    if (selectedTodayOnlyIds.includes(itemId)) {
      updateSpotAdditions(
        spotAdditions.map((addition) =>
          addition.itemId === itemId ? { ...addition, dueDate } : addition,
        ),
      );
    }
  };

  const clearSpotDeadline = (itemId: string) => {
    const nextDeadlines = { ...spotDeadlines };
    delete nextDeadlines[itemId];
    updateSpotDeadlines(nextDeadlines);

    if (selectedTodayOnlyIds.includes(itemId)) {
      updateSpotAdditions(
        spotAdditions.map((addition) =>
          addition.itemId === itemId ? { ...addition, dueDate: null } : addition,
        ),
      );
    }

    if (spotDeadlinePicker?.itemId === itemId) {
      setSpotDeadlinePicker(null);
    }
  };

  const openSpotDeadlinePicker = (itemId: string) => {
    const initialDate = spotDeadlines[itemId] ?? getTomorrowDateKey();

    setSpotDeadlinePicker({
      itemId,
      temporaryDate: initialDate,
      visibleMonth: getMonthKey(parseDateKey(initialDate)),
    });
  };

  const selectSpotDeadlineDate = (dateKey: string) => {
    setSpotDeadlinePicker((current) =>
      current
        ? {
            ...current,
            temporaryDate: dateKey,
            visibleMonth: getMonthKey(parseDateKey(dateKey)),
          }
        : current,
    );
  };

  const shiftSpotDeadlineMonth = (offset: number) => {
    setSpotDeadlinePicker((current) =>
      current
        ? { ...current, visibleMonth: shiftMonthKey(current.visibleMonth, offset) }
        : current,
    );
  };

  const cancelSpotDeadlinePicker = () => {
    setSpotDeadlinePicker(null);
  };

  const confirmSpotDeadlinePicker = () => {
    if (!spotDeadlinePicker) {
      return;
    }

    saveSpotDeadline(spotDeadlinePicker.itemId, spotDeadlinePicker.temporaryDate);
    setSpotDeadlinePicker(null);
  };

  const closeTodayOnlySheet = () => {
    setIsTodayOnlySheetOpen(false);
    setSpotDeadlinePicker(null);
    setIsTodayOnlyInputOpen(false);
    setTodayOnlyInputValue("");
    setTodayOnlyInputQuantity(1);
    setSwipedTodayOnlyItemId(null);
    setSwipingTodayOnlyItemId(null);
    setTodayOnlySwipeOffset(0);
  };

  const startTemporaryItemSwipe = (itemId: string, clientX: number) => {
    swipeStartXRef.current = clientX;
    setSwipingTodayOnlyItemId(itemId);
    setTodayOnlySwipeOffset(swipedTodayOnlyItemId === itemId ? 88 : 0);
  };

  const moveTemporaryItemSwipe = (itemId: string, clientX: number) => {
    const startX = swipeStartXRef.current;

    if (startX === null || swipingTodayOnlyItemId !== itemId) {
      return;
    }

    const baseOffset = swipedTodayOnlyItemId === itemId ? 88 : 0;
    const nextOffset = Math.min(88, Math.max(0, baseOffset + startX - clientX));
    setTodayOnlySwipeOffset(nextOffset);
  };

  const endTemporaryItemSwipe = (itemId: string) => {
    const offset = todayOnlySwipeOffset;
    swipeStartXRef.current = null;
    setSwipingTodayOnlyItemId(null);
    setTodayOnlySwipeOffset(0);

    setSwipedTodayOnlyItemId(offset > 44 ? itemId : null);
  };

  const addTemporaryTodayOnlyItem = () => {
    const trimmedName = todayOnlyInputValue.trim();

    if (!trimmedName) {
      setIsTodayOnlyInputOpen(false);
      setTodayOnlyInputValue("");
      return;
    }

    const newItem = createTodayOnlyTemporaryItem(
      trimmedName,
      clampSpotQuantity(todayOnlyInputQuantity),
    );
    const nextItems = [...temporaryTodayOnlyItems, newItem];

    updateTemporaryTodayOnlyItems(nextItems);
    addSpotItem(newItem.id, null);
    setIsTodayOnlyInputOpen(false);
    setTodayOnlyInputValue("");
    setTodayOnlyInputQuantity(1);
  };

  const removeTemporaryTodayOnlyItem = (itemId: string) => {
    const nextItems = temporaryTodayOnlyItems.filter((item) => item.id !== itemId);
    updateTemporaryTodayOnlyItems(nextItems);
    removeSpotItem(itemId);
    if (spotDeadlinePicker?.itemId === itemId) {
      setSpotDeadlinePicker(null);
    }
    setSwipedTodayOnlyItemId(null);
  };

  const createLockerPreparationItems = (): PreparationItem[] =>
    lockerItems
      .filter((item) => item.shortageCount < item.requiredCount)
      .map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        count: item.requiredCount - item.shortageCount,
        checked: false,
        later: false,
        source: "locker",
      }));

  const createTodayOnlyPreparationItems = (): PreparationItem[] =>
    allTodayOnlyOptions
      .map((item) => {
        const spotAddition = spotAdditions.find(
          (addition) => addition.itemId === item.id,
        );

        if (!spotAddition) {
          return null;
        }

        const preparationItem: PreparationItem = {
          id: item.id,
          name: item.name,
          unit: item.unit,
          count: item.count,
          checked: false,
          later: false,
          source: "spot" as const,
          dueDate: spotAddition.dueDate ?? spotDeadlines[item.id] ?? null,
        };

        return preparationItem;
      })
      .filter((item): item is PreparationItem => item !== null);

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
        source: "stock",
      }));

  const completeCheck = () => {
    const nextSession = createPreparationSession(
      buildPreparationItems([
        ...createLockerPreparationItems(),
        ...createTodayOnlyPreparationItems(),
        ...createRoughPreparationItems(),
      ]),
    );

    nextSession.completedAt = null;
    updateSession(nextSession);
    setActiveTab("items");
  };

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
      completedAt:
        hasCarryoverItems || (allChecked && isPreparationDone)
          ? session.completedAt
          : null,
      thanksSent: allChecked && !hasCarryoverItems ? session.thanksSent : false,
    };

    updateSession(nextSession);
  };

  const checkAllPreparationItems = () => {
    const shouldCheck = session.items.some(
      (item) => !item.later && !item.checked,
    );
    const nextItems = session.items.map((item) =>
      !item.later
        ? {
            ...item,
            checked: shouldCheck,
          }
        : item,
    );
    const allDone = nextItems.every((item) => item.checked || item.later);
    const nextSession = {
      ...session,
      items: nextItems,
      completedAt:
        hasCarryoverItems || (allDone && isPreparationDone)
          ? session.completedAt
          : null,
      thanksSent: allDone && !hasCarryoverItems ? session.thanksSent : false,
    };

    updateSession(nextSession);
  };

  const togglePreparationItemLater = (itemId: string) => {
    const nextItems = session.items.map((item) =>
      item.id === itemId
        ? { ...item, checked: false, later: !item.later }
        : item,
    );
    const allDone = nextItems.every((item) => item.checked || item.later);
    const nextSession = {
      ...session,
      items: nextItems,
      completedAt:
        hasCarryoverItems || (allDone && isPreparationDone)
          ? session.completedAt
          : null,
      thanksSent: allDone && !hasCarryoverItems ? session.thanksSent : false,
    };

    updateSession(nextSession);
  };

  const completePreparation = () => {
    const completedAt = new Date().toISOString();
    const deferredItems = session.items.filter(
      (item) => item.later && !item.checked,
    );
    const preparedItems = session.items.filter(
      (item) => !item.later || item.checked,
    );
    const deferredItemIds = new Set(deferredItems.map((item) => item.id));
    const preparedLockerItemIds = new Set(
      preparedItems
        .filter((item) => item.source === "locker")
        .map((item) => item.id),
    );
    const preparedStockItemIds = new Set(
      preparedItems
        .filter((item) => item.source === "stock")
        .map((item) => item.id),
    );
    const preparedSpotItemIds = new Set(
      preparedItems
        .filter((item) => item.source === "spot")
        .map((item) => item.id),
    );
    const carryoverItems = deferredItems.map((item) => ({
      ...item,
      checked: false,
      later: false,
      carryover: true,
    }));

    updateSession({
      ...session,
      items: carryoverItems,
      completedAt,
      thanksSent: false,
    });

    if (preparedLockerItemIds.size > 0) {
      setShortageCounts((current) => {
        const nextCounts = { ...current };

        preparedLockerItemIds.forEach((itemId) => {
          const lockerItem = lockerItems.find((item) => item.id === itemId);

          if (lockerItem) {
            nextCounts[itemId] = lockerItem.requiredCount;
          }
        });

        saveCheckCounts(nextCounts);
        return nextCounts;
      });
    }

    if (preparedStockItemIds.size > 0) {
      setRoughStates((current) => {
        const nextStates = { ...current };

        preparedStockItemIds.forEach((itemId) => {
          nextStates[itemId] = "十分";
        });

        return nextStates;
      });
    }

    updateSpotAdditions(
      spotAdditions.filter((addition) => deferredItemIds.has(addition.itemId)),
    );
    if (preparedSpotItemIds.size > 0) {
      const nextDeadlines = { ...spotDeadlines };

      preparedSpotItemIds.forEach((itemId) => {
        delete nextDeadlines[itemId];
      });

      updateSpotDeadlines(nextDeadlines);
    }
    updateTemporaryTodayOnlyItems(
      temporaryTodayOnlyItems.filter((item) => deferredItemIds.has(item.id)),
    );
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

  const showZeroQuantityToast = () => {
    setIsZeroQuantityToastVisible(true);

    if (zeroQuantityToastTimeoutRef.current !== null) {
      window.clearTimeout(zeroQuantityToastTimeoutRef.current);
    }

    zeroQuantityToastTimeoutRef.current = window.setTimeout(() => {
      setIsZeroQuantityToastVisible(false);
      zeroQuantityToastTimeoutRef.current = null;
    }, 3_000);
  };

  const startChildNameEdit = () => {
    setActiveEditingSectionId(childSettingsSectionId);
    childNameEditor.startEdit();
  };

  const completeChildNameEdit = async () => {
    const saved = await childNameEditor.completeEdit();

    if (saved) {
      setActiveEditingSectionId(null);
    }
  };

  const discardChildNameEdit = () => {
    childNameEditor.discardChanges();
    setActiveEditingSectionId(null);
    setIsDiscardChildDialogOpen(false);
  };

  const requestCloseChildSettings = () => {
    if (
      activeEditingSectionId === childSettingsSectionId &&
      childNameEditor.state.mode === "edit" &&
      childNameEditor.state.isDirty
    ) {
      setIsDiscardChildDialogOpen(true);
      return;
    }

    if (childNameEditor.state.mode === "edit") {
      childNameEditor.discardChanges();
      setActiveEditingSectionId(null);
    }

    setIsChildSettingsOpen(false);
  };

  const addCustomItem = (
    category: CustomItemCategory,
    draft: { name: string; count: string; unit: string; weekdays: number[] },
  ) => {
    const trimmedName = draft.name.trim();

    if (!trimmedName) {
      return;
    }

    const parsedCount = draft.count === "" ? 0 : Number(draft.count);
    const count =
      category === "スポット追加"
        ? clampSpotQuantity(parsedCount)
        : Number.isNaN(parsedCount)
          ? 0
          : parsedCount;
    const newItem: CustomizableItem = {
      id: `custom-${Date.now()}`,
      name: trimmedName,
      unit:
        category === "ざっくり管理"
          ? draft.unit
          : category === "スポット追加"
            ? "個"
            : "枚",
      count,
      category,
      weekdays: category === "スポット追加" ? draft.weekdays : [],
    };
    const categoryStartIndex = customItems.findIndex(
      (item) => item.category === category,
    );
    const nextItems =
      categoryStartIndex === -1
        ? [...customItems, newItem]
        : [
            ...customItems.slice(0, categoryStartIndex),
            newItem,
            ...customItems.slice(categoryStartIndex),
          ];

    updateCustomItems(nextItems);
    setCustomItemQuantityInputs((current) => ({
      ...current,
      [newItem.id]: String(newItem.count),
    }));
    setPendingFocusItemId(newItem.id);

    if (category === "持ち物") {
      setShortageCounts((current) => {
        const nextCounts = { ...current, [newItem.id]: 0 };
        saveCheckCounts(nextCounts);
        return nextCounts;
      });
    }

    if (category === "ざっくり管理") {
      setRoughStates((current) => ({
        ...current,
        [newItem.id]: current[newItem.id] ?? "十分",
      }));
    }
  };

  const updateCustomItem = (
    itemId: string,
    changes: Partial<Omit<CustomizableItem, "id">>,
  ) => {
    const currentItem = customItems.find((item) => item.id === itemId);
    const nextItems = customItems.map((item) =>
      item.id === itemId ? { ...item, ...changes } : item,
    );

    if (
      changes.count === 0 &&
      currentItem !== undefined &&
      currentItem.count !== 0
    ) {
      showZeroQuantityToast();
    }

    updateCustomItems(nextItems);
  };

  const deleteCustomItem = (itemId: string) => {
    updateCustomItems(customItems.filter((item) => item.id !== itemId));
    setCustomItemQuantityInputs((current) => {
      const nextInputs = { ...current };
      delete nextInputs[itemId];
      return nextInputs;
    });
    setSelectedTodayOnlyIds((current) =>
      current.filter((selectedId) => selectedId !== itemId),
    );
    setShortageCounts((current) => {
      const nextCounts = { ...current };
      delete nextCounts[itemId];
      saveCheckCounts(nextCounts);
      return nextCounts;
    });
    setRoughStates((current) => {
      const nextStates = { ...current };
      delete nextStates[itemId];
      return nextStates;
    });
    updateSpotAdditions(
      spotAdditions.filter((addition) => addition.itemId !== itemId),
    );
    updateSession({
      ...session,
      items: session.items.filter((item) => item.id !== itemId),
    });
  };

  const updateCustomItemQuantityInput = (itemId: string, value: string) => {
    if (!/^\d*$/.test(value)) {
      return;
    }

    setCustomItemQuantityInputs((current) => ({
      ...current,
      [itemId]: value,
    }));

    if (value === "") {
      return;
    }

    updateCustomItem(itemId, {
      count: Number(value),
    });
  };

  const saveCustomItemQuantityInput = (itemId: string) => {
    const value = customItemQuantityInputs[itemId];

    if (value !== "") {
      return;
    }

    setCustomItemQuantityInputs((current) => ({
      ...current,
      [itemId]: "0",
    }));
    updateCustomItem(itemId, {
      count: 0,
    });
  };

  const toggleCustomItemWeekday = (item: CustomizableItem, weekday: number) => {
    const currentWeekdays = item.weekdays ?? [];
    const nextWeekdays = currentWeekdays.includes(weekday)
      ? currentWeekdays.filter((day) => day !== weekday)
      : [...currentWeekdays, weekday].sort((a, b) => a - b);

    updateCustomItem(item.id, {
      weekdays: nextWeekdays,
    });
  };

  const toggleNewCustomItemWeekday = (weekday: number) => {
    setNewCustomItemDraft((current) => {
      const nextWeekdays = current.weekdays.includes(weekday)
        ? current.weekdays.filter((day) => day !== weekday)
        : [...current.weekdays, weekday].sort((a, b) => a - b);

      return {
        ...current,
        weekdays: nextWeekdays,
      };
    });
  };

  const getCustomItemRects = (category: CustomItemCategory) => {
    const rects = new Map<string, DOMRect>();

    document
      .querySelectorAll<HTMLElement>(
        `[data-custom-item-category="${category}"][data-custom-item-id]`,
      )
      .forEach((element) => {
        const itemId = element.dataset.customItemId;

        if (itemId) {
          rects.set(itemId, element.getBoundingClientRect());
        }
      });

    return rects;
  };

  const animateCustomItemReorder = (
    category: CustomItemCategory,
    previousRects: Map<string, DOMRect>,
    activeItemId: string,
  ) => {
    if (customItemReorderAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(customItemReorderAnimationFrameRef.current);
    }

    customItemReorderAnimationFrameRef.current = window.requestAnimationFrame(
      () => {
        document
          .querySelectorAll<HTMLElement>(
            `[data-custom-item-category="${category}"][data-custom-item-id]`,
          )
          .forEach((element) => {
            const itemId = element.dataset.customItemId;
            const previousRect = itemId ? previousRects.get(itemId) : undefined;

            if (!itemId || !previousRect || itemId === activeItemId) {
              return;
            }

            const nextRect = element.getBoundingClientRect();
            const deltaY = previousRect.top - nextRect.top;

            if (Math.abs(deltaY) < 1) {
              return;
            }

            element.style.transition = "none";
            element.style.transform = `translate3d(0, ${deltaY}px, 0)`;

            window.requestAnimationFrame(() => {
              element.style.transition =
                "transform 180ms cubic-bezier(0.2, 0, 0, 1)";
              element.style.transform = "";

              window.setTimeout(() => {
                element.style.transition = "";
              }, 200);
            });
          });

        customItemReorderAnimationFrameRef.current = null;
      },
    );
  };

  const reorderCustomItemsInCategory = (
    category: CustomItemCategory,
    activeItemId: string,
    overItemId: string,
  ) => {
    if (activeItemId === overItemId) {
      return;
    }

    const categoryItems = customItems.filter(
      (item) => item.category === category,
    );
    const activeIndex = categoryItems.findIndex(
      (item) => item.id === activeItemId,
    );
    const overIndex = categoryItems.findIndex((item) => item.id === overItemId);

    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    const previousRects = getCustomItemRects(category);
    const nextCategoryItems = [...categoryItems];
    const [movedItem] = nextCategoryItems.splice(activeIndex, 1);
    nextCategoryItems.splice(overIndex, 0, movedItem);

    let replacementIndex = 0;
    const nextItems = customItems.map((item) =>
      item.category === category
        ? nextCategoryItems[replacementIndex++]
        : item,
    );

    updateCustomItems(nextItems);
    animateCustomItemReorder(category, previousRects, activeItemId);
  };

  const moveCustomItemByPointer = (
    category: CustomItemCategory,
    activeItemId: string,
    clientX: number,
    clientY: number,
  ) => {
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest("[data-custom-item-id]");
    const overItemId = target?.getAttribute("data-custom-item-id");

    if (!overItemId || overItemId === activeItemId) {
      return;
    }

    if (customItemDragOverIdRef.current === overItemId) {
      return;
    }

    customItemDragOverIdRef.current = overItemId;
    reorderCustomItemsInCategory(category, activeItemId, overItemId);
  };

  const startCustomItemSorting = (category: CustomItemCategory) => {
    setAddingCategory(null);
    setSortingCategory(category);
    setDraggingCustomItemId(null);
  };

  const finishCustomItemSorting = () => {
    setSortingCategory(null);
    setDraggingCustomItemId(null);
  };

  const startCustomItemAdding = (category: CustomItemCategory) => {
    setSortingCategory(null);
    setAddingCategory(category);
    setExpandedWeekdayItemId(category === "スポット追加" ? "__new__" : null);
    setNewCustomItemDraft({
      name: "",
      count: "1",
      unit: "",
      weekdays: [],
    });
  };

  const finishCustomItemAdding = (category: CustomItemCategory) => {
    addCustomItem(category, newCustomItemDraft);
    setAddingCategory(null);
    setNewCustomItemDraft({
      name: "",
      count: "1",
      unit: "",
      weekdays: [],
    });
    setExpandedWeekdayItemId(null);
  };

  const closeItemSettings = () => {
    if (
      isChildSettingsOpen &&
      childNameEditor.state.mode === "edit" &&
      childNameEditor.state.isDirty
    ) {
      setIsDiscardChildDialogOpen(true);
      return;
    }

    setIsItemSettingsOpen((current) => !current);
    setIsChildSettingsOpen(false);
    childNameEditor.discardChanges();
    setActiveEditingSectionId(null);
    setSelectedItemSettingsCategory(null);
    setSortingCategory(null);
    setAddingCategory(null);
    setExpandedWeekdayItemId(null);
  };

  const toggleChildSettings = () => {
    if (isChildSettingsOpen) {
      requestCloseChildSettings();
      return;
    }

    setIsChildSettingsOpen(true);
    setIsItemSettingsOpen(false);
    setSelectedItemSettingsCategory(null);
    setSortingCategory(null);
    setAddingCategory(null);
    setExpandedWeekdayItemId(null);
    childNameEditor.discardChanges();
    setActiveEditingSectionId(null);
  };

  const renderCustomItemCard = (
    customItem: CustomizableItem,
    isSorting: boolean,
  ) => {
    const isRoughItem = customItem.category === "ざっくり管理";
    const isSpotItem = customItem.category === "スポット追加";
    const isDragging = draggingCustomItemId === customItem.id;

    return (
      <div
        key={customItem.id}
        data-custom-item-id={customItem.id}
        data-custom-item-category={customItem.category}
        draggable={isSorting}
        onDragStart={() => {
          if (isSorting) {
            customItemDragOverIdRef.current = null;
            setDraggingCustomItemId(customItem.id);
          }
        }}
        onDragOver={(event) => {
          if (isSorting) {
            event.preventDefault();
          }
        }}
        onDragEnter={() => {
          if (!isSorting || draggingCustomItemId === null) {
            return;
          }

          if (customItemDragOverIdRef.current === customItem.id) {
            return;
          }

          customItemDragOverIdRef.current = customItem.id;
          reorderCustomItemsInCategory(
            customItem.category,
            draggingCustomItemId,
            customItem.id,
          );
        }}
        onDragEnd={() => {
          customItemDragOverIdRef.current = null;
          setDraggingCustomItemId(null);
        }}
        onPointerEnter={() => {
          if (!isSorting || draggingCustomItemId === null) {
            return;
          }

          if (draggingCustomItemId === customItem.id) {
            return;
          }

          if (customItemDragOverIdRef.current === customItem.id) {
            return;
          }

          customItemDragOverIdRef.current = customItem.id;
          reorderCustomItemsInCategory(
            customItem.category,
            draggingCustomItemId,
            customItem.id,
          );
        }}
        onPointerUp={() => {
          customItemDragOverIdRef.current = null;
          setDraggingCustomItemId(null);
        }}
        onPointerCancel={() => {
          customItemDragOverIdRef.current = null;
          setDraggingCustomItemId(null);
        }}
        className={`rounded-2xl bg-[#f8fbf9] p-2.5 ring-1 ring-[#edf3ef] transition-[transform,box-shadow,background-color] duration-200 ease-out will-change-transform ${
          isSorting ? "cursor-grab active:cursor-grabbing" : ""
        } ${
          isDragging
            ? "relative z-20 scale-[1.02] cursor-grabbing bg-surface shadow-[0_14px_32px_rgba(38,53,45,0.16)] ring-[#e5eee9]"
            : "shadow-none"
        }`}
      >
        <div
          className={`grid items-center gap-2 ${
            isRoughItem
              ? isSorting
                ? "grid-cols-[1.75rem_minmax(0,1fr)_3.5rem_5.5rem]"
                : "grid-cols-[minmax(0,1fr)_3.5rem_5.5rem_2.75rem]"
              : isSpotItem
                ? isSorting
                  ? "grid-cols-[1.75rem_minmax(0,1fr)_3.5rem]"
                  : "grid-cols-[minmax(0,1fr)_3.5rem_4rem_2.75rem]"
              : isSorting
                ? "grid-cols-[1.75rem_minmax(0,1fr)_3.5rem]"
                : "grid-cols-[minmax(0,1fr)_3.5rem_2.75rem]"
          }`}
        >
          {isSorting ? (
            <IconButton
              type="button"
              label={`${customItem.name}を並び替え`}
              onPointerDown={(event) => {
                event.preventDefault();
                customItemDragOverIdRef.current = null;
                setDraggingCustomItemId(customItem.id);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (draggingCustomItemId !== customItem.id) {
                  return;
                }

                moveCustomItemByPointer(
                  customItem.category,
                  customItem.id,
                  event.clientX,
                  event.clientY,
                );
              }}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
                customItemDragOverIdRef.current = null;
                setDraggingCustomItemId(null);
              }}
              onPointerCancel={() => {
                customItemDragOverIdRef.current = null;
                setDraggingCustomItemId(null);
              }}
              className="touch-none cursor-grab active:cursor-grabbing"
            >
              <GripVertical size={20} strokeWidth={2} />
            </IconButton>
          ) : null}
          <input
            ref={(element) => {
              customItemNameRefs.current[customItem.id] = element;
            }}
            type="text"
            disabled={isSorting}
            value={customItem.name}
            placeholder="持ち物名"
            onChange={(event) =>
              updateCustomItem(customItem.id, {
                name: event.target.value,
              })
            }
            className="h-11 min-w-0 rounded-xl bg-surface px-3 text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green disabled:bg-transparent disabled:ring-transparent"
          />
          {isSpotItem ? (
            <SpotQuantityControl
              value={customItem.count}
              disabled={isSorting}
              onChange={(nextCount) => {
                updateCustomItem(customItem.id, { count: nextCount });
                setCustomItemQuantityInputs((current) => ({
                  ...current,
                  [customItem.id]: String(nextCount),
                }));
              }}
            />
          ) : (
            <input
              type="text"
              inputMode="numeric"
              disabled={isSorting}
              value={
                customItemQuantityInputs[customItem.id] ??
                String(customItem.count)
              }
              placeholder="数量"
              onChange={(event) =>
                updateCustomItemQuantityInput(customItem.id, event.target.value)
              }
              onBlur={() => saveCustomItemQuantityInput(customItem.id)}
              className={quantityInputClassName}
            />
          )}
          {isRoughItem ? (
            <input
              type="text"
              disabled={isSorting}
              value={customItem.unit}
              placeholder="単位"
              onChange={(event) =>
                updateCustomItem(customItem.id, {
                  unit: event.target.value,
                })
              }
              className="h-11 w-full rounded-xl bg-surface px-2 text-center text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green disabled:bg-transparent disabled:ring-transparent"
            />
          ) : null}
          {isSpotItem && !isSorting ? (
            <button
              type="button"
              aria-label={`${customItem.name}の曜日を設定`}
              onClick={() =>
                setExpandedWeekdayItemId((current) =>
                  current === customItem.id ? null : customItem.id,
                )
              }
              className={`h-11 w-16 rounded-xl px-2 text-caption font-normal ring-1 transition active:scale-95 ${
                expandedWeekdayItemId === customItem.id ||
                (customItem.weekdays?.length ?? 0) > 0
                  ? "bg-card-today text-danger ring-danger/30"
                  : "bg-surface text-text-tertiary ring-border-soft"
              }`}
            >
              曜日
            </button>
          ) : null}
          {!isSorting ? (
            <IconButton
              type="button"
              label="削除"
              tone="danger"
              onClick={() => deleteCustomItem(customItem.id)}
            >
              <Trash2 size={20} strokeWidth={2.2} />
            </IconButton>
          ) : null}
        </div>
        {isSpotItem && expandedWeekdayItemId === customItem.id
          ? renderWeekdayPicker({
              selectedWeekdays: customItem.weekdays ?? [],
              onToggle: (weekday) => toggleCustomItemWeekday(customItem, weekday),
            })
          : null}
      </div>
    );
  };

  const closeCustomItemEdit = () => {
    setSelectedItemSettingsCategory(null);
    setSortingCategory(null);
    setAddingCategory(null);
    setExpandedWeekdayItemId(null);
  };

  const renderItemSettingsHeader = ({
    title,
    actionLabel,
    onBack,
    onAction,
  }: {
    title: string;
    actionLabel: string;
    onBack: () => void;
    onAction: () => void;
  }) => (
    <div className="flex min-h-[44px] items-center justify-between gap-3">
      <button
        type="button"
        aria-label="戻る"
        onClick={onBack}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-button bg-surface text-text-tertiary transition active:scale-95"
      >
        <ChevronRight size={20} strokeWidth={2.2} className="rotate-180" />
      </button>
      <h3 className="min-w-0 flex-1 truncate text-center text-list-item font-semibold text-hoiku-ink">
        {title}
      </h3>
      {actionLabel === "編集" ? (
        <IconButton label="編集" onClick={onAction}>
          <Pencil size={20} strokeWidth={2.1} />
        </IconButton>
      ) : (
        <button
          type="button"
          onClick={onAction}
          className="h-10 w-14 shrink-0 text-right text-number font-normal text-danger"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );

  const renderWeekdayPicker = ({
    selectedWeekdays,
    onToggle,
  }: {
    selectedWeekdays: number[];
    onToggle: (weekday: number) => void;
  }) => (
    <div className="mt-2 rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-[#edf3ef]">
      <div className="grid grid-cols-7 gap-1.5">
        {weekdayOptions.map((weekday) => {
          const isSelected = selectedWeekdays.includes(weekday.value);

          return (
            <button
              key={weekday.value}
              type="button"
              onClick={() => onToggle(weekday.value)}
              className={`grid h-8 place-items-center rounded-full text-caption font-normal ring-1 transition active:scale-95 ${
                isSelected
                  ? "bg-card-today text-danger ring-danger/30"
                  : "bg-surface text-text-tertiary ring-border-soft"
              }`}
            >
              {weekday.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderCustomItemCategory = (category: CustomItemCategory) => {
    const isSorting = sortingCategory === category;
    const isAdding = addingCategory === category;
    const isRoughCategory = category === "ざっくり管理";
    const isSpotCategory = category === "スポット追加";

    return (
      <section key={category} className="space-y-3">
        {renderItemSettingsHeader({
          title: `${category}を編集`,
          actionLabel: "完了",
          onBack: closeCustomItemEdit,
          onAction: closeCustomItemEdit,
        })}

        <div className="flex min-h-11 items-center justify-end gap-2 text-number font-normal">
          {isSorting || isAdding ? (
            <button
              type="button"
              onClick={() =>
                isAdding
                  ? finishCustomItemAdding(category)
                  : finishCustomItemSorting()
              }
              className="h-11 px-2 text-[#7a867e]"
            >
              完了
            </button>
          ) : (
            <>
              <IconButton
                label="並び替え"
                onClick={() => startCustomItemSorting(category)}
              >
                <GripVertical size={20} strokeWidth={2} />
              </IconButton>
              <button
                type="button"
                aria-label="追加"
                onClick={() => startCustomItemAdding(category)}
                className="grid h-11 min-w-11 place-items-center rounded-button bg-surface px-4 text-number font-normal text-hoiku-deep ring-1 ring-border-soft transition active:scale-95"
              >
                ＋
              </button>
            </>
          )}
        </div>
        <div className="space-y-2">
          {isAdding ? (
            <div className="rounded-2xl bg-[#f8fbf9] p-2.5 ring-1 ring-[#edf3ef]">
              <div
                className={`grid items-center gap-2 ${
                  isRoughCategory
                    ? "grid-cols-[minmax(0,1fr)_3.5rem_5.5rem]"
                    : isSpotCategory
                      ? "grid-cols-[minmax(0,1fr)_3.5rem_4rem]"
                    : "grid-cols-[minmax(0,1fr)_3.5rem]"
                }`}
              >
                <input
                  ref={newCustomItemNameRef}
                  type="text"
                  value={newCustomItemDraft.name}
                  placeholder="持ち物名"
                  onChange={(event) =>
                    setNewCustomItemDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="h-11 min-w-0 rounded-xl bg-surface px-3 text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green"
                />
                {isSpotCategory ? (
                  <SpotQuantityControl
                    value={clampSpotQuantity(Number(newCustomItemDraft.count))}
                    onChange={(nextCount) =>
                      setNewCustomItemDraft((current) => ({
                        ...current,
                        count: String(nextCount),
                      }))
                    }
                  />
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newCustomItemDraft.count}
                    placeholder="数量"
                    onChange={(event) => {
                      if (!/^\d*$/.test(event.target.value)) {
                        return;
                      }

                      setNewCustomItemDraft((current) => ({
                        ...current,
                        count: event.target.value,
                      }));
                    }}
                    className={quantityInputClassName}
                  />
                )}
                {isSpotCategory ? (
                  <button
                    type="button"
                    aria-label="曜日を設定"
                    onClick={() =>
                      setExpandedWeekdayItemId((current) =>
                        current === "__new__" ? null : "__new__",
                      )
                    }
                    className={`h-11 w-16 rounded-xl px-2 text-caption font-normal ring-1 transition active:scale-95 ${
                      expandedWeekdayItemId === "__new__" ||
                      newCustomItemDraft.weekdays.length > 0
                        ? "bg-card-today text-danger ring-danger/30"
                        : "bg-surface text-text-tertiary ring-border-soft"
                    }`}
                  >
                    曜日
                  </button>
                ) : null}
                {isRoughCategory ? (
                  <input
                    type="text"
                    value={newCustomItemDraft.unit}
                    placeholder="単位"
                    onChange={(event) =>
                      setNewCustomItemDraft((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl bg-surface px-2 text-center text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green"
                  />
                ) : null}
              </div>
              {isSpotCategory && expandedWeekdayItemId === "__new__"
                ? renderWeekdayPicker({
                    selectedWeekdays: newCustomItemDraft.weekdays,
                    onToggle: toggleNewCustomItemWeekday,
                  })
                : null}
            </div>
          ) : null}
          {customItems
            .filter((customItem) => customItem.category === category)
            .map((customItem) => renderCustomItemCard(customItem, isSorting))}
        </div>
      </section>
    );
  };

  return (
    <main
      className={`min-h-screen ${
        activeTab === "settings" ? "bg-[#fbfcfb]" : "bg-background"
      }`}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-4 pb-[calc(98px_+_env(safe-area-inset-bottom))] pt-5">
        <BabyHeader
          childName={childProfile.name}
          rightContent={
            activeTab === "check" || activeTab === "items" ? (
              <div className="space-y-2">
                <div className="grid w-full grid-cols-[16px_1.75rem_auto_minmax(4.75rem,1fr)] items-center gap-x-1 gap-y-1 text-status font-normal">
                  <CheckCircle2
                    size={16}
                    className="text-[#3b9de9]"
                    strokeWidth={2.2}
                  />
                  <span className="whitespace-nowrap">確認</span>
                  <AssigneeBadge
                    label={lastConfirmedDate ? session.checkedBy : "未確認"}
                  />
                  <span className="min-w-0 whitespace-nowrap text-right text-[13px] font-normal leading-tight">
                    {lastConfirmedDate ?? "--"}
                  </span>
                </div>
                <div className="grid w-full grid-cols-[16px_1.75rem_auto_minmax(4.75rem,1fr)] items-center gap-x-1 gap-y-1 text-status font-normal">
                  {lastPreparedDate ? (
                    <CheckCircle2
                      size={16}
                      className="text-[#3b9de9]"
                      strokeWidth={2.2}
                    />
                  ) : (
                    <span className="h-4 w-4 rounded-button border-2 border-dashed border-text-tertiary" />
                  )}
                  <span className="whitespace-nowrap">準備</span>
                  <AssigneeBadge
                    label={lastPreparedDate ? session.checkedBy : "まだ"}
                    tone={lastPreparedDate ? "active" : "muted"}
                  />
                  <span className="min-w-0 whitespace-nowrap text-right text-[13px] font-normal leading-tight">
                    {lastPreparedDate ?? "--"}
                  </span>
                </div>
              </div>
            ) : null
          }
          rightFooterContent={
            activeTab === "items" && canShowPreparationStatus ? (
              <button
                type="button"
                onClick={sendThanks}
                className="rounded-button bg-tab-active px-3 py-1 text-status font-normal text-danger ring-1 ring-[#ffd1dc]"
              >
                {session.thanksSent ? "✓ ありがとう済み" : "♡ ありがとう"}
              </button>
            ) : null
          }
        />

        {activeTab === "check" ? (
          <div className={`${cardStackClassName} pb-24`}>
            <ShortageInputList
              items={lockerItems}
              onChange={updateShortageCount}
            />

            <ReusableCard
              title="スポット追加"
              icon={<CalendarDays size={22} strokeWidth={2.1} />}
              tone="pink"
              action={
                <button
                  type="button"
                  onClick={() => setIsTodayOnlySheetOpen(true)}
                  className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-button bg-surface/80 px-4 text-status font-normal text-danger ring-1 ring-danger/20 transition active:scale-95"
                >
                  ＋
                </button>
              }
              contentClassName="grid min-h-20 place-items-center px-4 py-4"
            >
              {selectedTodayOnlyIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {allTodayOnlyOptions
                    .filter((item) => selectedTodayOnlyIds.includes(item.id))
                    .map((item) => {
                      const spotAddition = spotAdditions.find(
                        (addition) => addition.itemId === item.id,
                      );

                      return (
                        <span
                          key={item.id}
                          className="max-w-full whitespace-nowrap rounded-button bg-surface px-4 py-2 text-number font-normal text-text-primary ring-1 ring-danger/25"
                        >
                          {formatSpotChipLabel(
                            item,
                            spotAddition?.dueDate ?? getTomorrowDateKey(),
                          )}
                        </span>
                      );
                    })}
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
                      className="grid w-full items-center"
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
                  indicatorWidth={lockerIndicatorColumnWidth}
                />
              ))}
            </ReusableCard>
          </div>
        ) : null}

        {activeTab === "items" ? (
          <div className={cardStackClassName}>
            <PreparationChecklist
              items={session.items}
              completedAt={isCurrentPreparationDone ? session.completedAt : null}
              onToggle={togglePreparationItem}
              onCheckAll={checkAllPreparationItems}
              onToggleLater={togglePreparationItemLater}
              onComplete={completePreparation}
            />
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <div className={settingsSectionStackClassName}>
            <SectionCard appearance="current">
              <h2 className="text-card-title font-semibold tracking-normal text-hoiku-ink">
                設定
              </h2>
              <div className="mt-4 divide-y divide-[#edf3ef]">
                {settingsItems.map((item) => (
                  <div key={item.id}>
                    <button
                      type="button"
                      disabled={!item.enabled}
                      onClick={() => {
                        if (item.id === "child") {
                          toggleChildSettings();
                        }

                        if (item.id === "items") {
                          closeItemSettings();
                        }
                      }}
                      className="flex min-h-[50px] w-full items-center justify-between gap-4 py-2 text-left disabled:cursor-default"
                    >
                      <span className="text-list-item font-medium text-hoiku-ink">
                        {item.label}
                      </span>
                      {item.id === "items" || item.id === "child" ? (
                        <ChevronRight
                          size={20}
                          strokeWidth={2}
                          className={`shrink-0 text-text-tertiary transition ${
                            (item.id === "items" && isItemSettingsOpen) ||
                            (item.id === "child" && isChildSettingsOpen)
                              ? "rotate-90"
                              : ""
                          }`}
                        />
                      ) : (
                        <span className="shrink-0 rounded-full bg-[#eeeeee] px-3 py-1 text-number font-normal text-text-secondary">
                          {item.status}
                        </span>
                      )}
                    </button>

                    {item.id === "child" && isChildSettingsOpen ? (
                      <div className="pb-4">
                        <div className="mt-3 rounded-section bg-surface p-4 ring-1 ring-border-soft">
                          <div className="mb-4 flex min-h-10 items-center justify-between gap-3">
                            <h3 className="text-list-item font-medium text-hoiku-ink">
                              こども設定
                            </h3>
                            {childNameEditor.state.mode === "edit" ? (
                              <button
                                type="button"
                                onClick={completeChildNameEdit}
                                disabled={
                                  childNameEditor.state.isSaving ||
                                  !childNameEditor.state.isValid
                                }
                                className="h-10 w-14 shrink-0 text-right text-number font-normal text-danger disabled:text-text-tertiary"
                              >
                                完了
                              </button>
                            ) : (
                              <IconButton label="編集" onClick={startChildNameEdit}>
                                <Pencil size={20} strokeWidth={2.1} />
                              </IconButton>
                            )}
                          </div>

                          {childNameEditor.state.mode === "edit" ? (
                            <div className="flex items-start gap-4">
                              <BabyAvatar
                                size="lg"
                                imageUrl={
                                  childProfile.iconType === "image"
                                    ? childProfile.iconUrl
                                    : null
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <label
                                  htmlFor="child-name"
                                  className="mb-2 block text-status font-normal text-text-secondary"
                                >
                                  名前
                                </label>
                                <input
                                  id="child-name"
                                  type="text"
                                  value={childNameEditor.state.draftValue}
                                  maxLength={8}
                                  onChange={(event) =>
                                    childNameEditor.setDraftValue(
                                      event.target.value.slice(0, 8),
                                    )
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      completeChildNameEdit();
                                    }
                                  }}
                                  className="h-11 w-full rounded-input bg-surface px-3 text-list-item font-medium text-text-primary outline-none ring-1 ring-border-soft focus:ring-primary"
                                />
                                <p className="mt-2 text-caption font-normal text-text-secondary">
                                  最大8文字
                                </p>
                                {childNameEditor.state.error ? (
                                  <p className="mt-2 text-status font-normal text-danger">
                                    {childNameEditor.state.error}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-4">
                              <BabyAvatar
                                size="lg"
                                imageUrl={
                                  childProfile.iconType === "image"
                                    ? childProfile.iconUrl
                                    : null
                                }
                              />
                              <p className="min-w-0 truncate text-list-item font-medium text-text-primary">
                                {childNameEditor.state.savedValue}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {item.id === "items" && isItemSettingsOpen ? (
                      <div className="pb-4">
                        {selectedItemSettingsCategory ? (
                          <div className="mt-3">
                            {renderCustomItemCategory(
                              selectedItemSettingsCategory,
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 divide-y divide-[#edf3ef]">
                            {itemCategories.map((category) => (
                              <button
                                key={category}
                                type="button"
                                aria-label={`${category}を編集`}
                                onClick={() => {
                                  setSelectedItemSettingsCategory(category);
                                  setSortingCategory(null);
                                  setAddingCategory(null);
                                  setExpandedWeekdayItemId(null);
                                }}
                                className="flex min-h-[50px] w-full items-center justify-between gap-4 py-2 text-left transition active:bg-[#f7f7f7]"
                              >
                                <span className="text-list-item font-medium text-hoiku-ink">
                                  {category}
                                </span>
                                <span className="grid h-11 w-11 shrink-0 place-items-center text-text-tertiary">
                                  <Pencil size={20} strokeWidth={2.1} />
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard appearance="current">
              <h2 className="text-card-title font-semibold tracking-normal text-hoiku-ink">
                その他
              </h2>
              <div className="mt-4 divide-y divide-[#edf3ef]">
                {otherSettingsItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex min-h-[50px] w-full items-center justify-between gap-4 py-2 text-left"
                  >
                    <span className="text-list-item font-medium text-hoiku-ink">
                      {item.label}
                    </span>
                    {item.id === "version" ? (
                      <span className="shrink-0 text-number font-normal text-text-secondary">
                        {item.value}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-[#eeeeee] px-3 py-1 text-number font-normal text-text-secondary">
                        {item.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
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

      {isZeroQuantityToastVisible ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px_+_env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-[430px] px-5">
          <div className="rounded-button bg-text-primary px-4 py-3 text-center text-status font-normal text-surface shadow-floating">
            数量0の項目は確認画面に表示されません。
          </div>
        </div>
      ) : null}

      {isDiscardChildDialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-6">
          <div className="w-full max-w-[340px] rounded-card bg-surface p-5 shadow-floating ring-1 ring-border-soft">
            <h3 className="text-list-item font-medium text-text-primary">
              変更内容を破棄しますか？
            </h3>
            <p className="mt-2 text-number font-normal leading-relaxed text-text-secondary">
              編集中の内容は保存されません。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsDiscardChildDialogOpen(false)}
                className="h-11 rounded-button bg-card-today text-number font-normal text-text-secondary ring-1 ring-border-soft transition active:scale-95"
              >
                編集を続ける
              </button>
              <button
                type="button"
                onClick={() => {
                  discardChildNameEdit();
                  setIsChildSettingsOpen(false);
                }}
                className="h-11 rounded-button bg-primary text-number font-normal text-surface shadow-button transition active:scale-95"
              >
                破棄する
              </button>
            </div>
          </div>
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
                スポット追加
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
            <div className="mt-4 max-h-[calc(54dvh-104px)] space-y-3 overflow-y-auto px-1 pb-2 pt-px">
              {allTodayOnlyOptions.map((item) => {
                const isTemporaryItem = temporaryTodayOnlyItems.some(
                  (temporaryItem) => temporaryItem.id === item.id,
                );
                const isSelected = selectedTodayOnlyIds.includes(item.id);
                const spotAddition = spotAdditions.find(
                  (addition) => addition.itemId === item.id,
                );
                const savedSpotDeadline =
                  spotAddition?.dueDate ?? spotDeadlines[item.id] ?? null;
                const hasSavedDeadline = Boolean(savedSpotDeadline);
                const isSwiped = swipedTodayOnlyItemId === item.id;
                const swipeOffset =
                  swipingTodayOnlyItemId === item.id
                    ? todayOnlySwipeOffset
                    : isSwiped
                      ? 88
                      : 0;
                const rowToneClass = isTemporaryItem
                  ? "bg-card-today ring-danger/20"
                  : "bg-surface ring-danger/25";

                const itemButton = (
                  <div
                    className={`rounded-section ring-1 transition active:scale-[0.99] ${rowToneClass}`}
                    style={
                      isTemporaryItem
                        ? { transform: `translate3d(-${swipeOffset}px, 0, 0)` }
                        : undefined
                    }
                  >
                    <div className="flex h-14 w-full items-center justify-between px-4 text-left text-list-item font-medium text-text-primary">
                      <span className="min-w-0 truncate">
                        {formatSpotItemName(item.name, item.count)}
                      </span>
                      <span className="ml-3 flex shrink-0 items-center gap-2">
                        {isSpotDeadlineEnabled ? (
                          hasSavedDeadline ? (
                            <button
                              type="button"
                              aria-label={`${item.name}の期限を解除`}
                              onClick={() => clearSpotDeadline(item.id)}
                              className="grid h-8 w-8 place-items-center rounded-full bg-primary text-surface ring-1 ring-primary/30 transition active:scale-95"
                            >
                              <CalendarDays size={16} strokeWidth={2.2} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              aria-label={`${item.name}の期限を設定`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openSpotDeadlinePicker(item.id);
                              }}
                              className="grid h-8 w-8 place-items-center rounded-full bg-surface text-icon-today ring-1 ring-danger/20 transition active:scale-95"
                            >
                              <CalendarDays size={16} strokeWidth={2.2} />
                            </button>
                          )
                        ) : null}
                        <button
                          type="button"
                          aria-label={`${item.name}を追加`}
                          onClick={() => toggleSpotItem(item.id)}
                          className={`inline-flex h-8 w-12 shrink-0 items-center justify-center rounded-full px-3 text-number font-normal ${
                            isSelected
                              ? "bg-primary text-surface"
                              : "bg-surface text-icon-today"
                          }`}
                        >
                          ＋
                        </button>
                      </span>
                    </div>
                  </div>
                );

                if (!isTemporaryItem) {
                  return (
                    <div key={item.id} className="px-px">
                      {itemButton}
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className="relative mx-px overflow-hidden rounded-section"
                    onPointerDown={(event) =>
                      startTemporaryItemSwipe(item.id, event.clientX)
                    }
                    onPointerMove={(event) =>
                      moveTemporaryItemSwipe(item.id, event.clientX)
                    }
                    onPointerUp={() => endTemporaryItemSwipe(item.id)}
                    onPointerCancel={() => {
                      swipeStartXRef.current = null;
                      setSwipingTodayOnlyItemId(null);
                      setTodayOnlySwipeOffset(0);
                    }}
                  >
                    <button
                      type="button"
                      aria-label="削除"
                      onClick={() => removeTemporaryTodayOnlyItem(item.id)}
                      className="absolute inset-y-0 right-0 z-10 grid w-[88px] place-items-center bg-danger text-surface transition-transform duration-200 ease-out"
                      style={{
                        transform: `translate3d(${88 - swipeOffset}px, 0, 0)`,
                      }}
                    >
                      <Trash2 size={20} strokeWidth={2.2} />
                    </button>
                    <div
                      className={`relative ${
                        swipingTodayOnlyItemId === item.id
                          ? ""
                          : "transition-transform duration-200 ease-out"
                      }`}
                    >
                      {itemButton}
                    </div>
                  </div>
                );
              })}

              {isTodayOnlyInputOpen ? (
                <div className="mx-px flex h-14 items-center gap-2 rounded-section bg-card-today px-3 ring-1 ring-danger/20">
                  <input
                    ref={todayOnlyInputRef}
                    type="text"
                    value={todayOnlyInputValue}
                    placeholder="持ち物名"
                    onChange={(event) =>
                      setTodayOnlyInputValue(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addTemporaryTodayOnlyItem();
                      }

                      if (event.key === "Escape") {
                        setIsTodayOnlyInputOpen(false);
                        setTodayOnlyInputValue("");
                        setTodayOnlyInputQuantity(1);
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-list-item font-medium text-text-primary outline-none placeholder:text-text-tertiary"
                  />
                  <SpotQuantityControl
                    value={todayOnlyInputQuantity}
                    onChange={setTodayOnlyInputQuantity}
                  />
                  <button
                    type="button"
                    aria-label="追加"
                    onClick={addTemporaryTodayOnlyItem}
                    className="grid h-11 min-w-11 shrink-0 place-items-center rounded-button bg-primary px-4 text-status font-normal text-surface"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    aria-label="キャンセル"
                    onClick={() => {
                      setIsTodayOnlyInputOpen(false);
                      setTodayOnlyInputValue("");
                      setTodayOnlyInputQuantity(1);
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-button bg-surface text-icon-today"
                  >
                    <X size={17} strokeWidth={2.4} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTodayOnlyInputQuantity(1);
                    setIsTodayOnlyInputOpen(true);
                  }}
                  className="mx-px flex h-14 w-[calc(100%-2px)] items-center rounded-section bg-card-today px-4 text-left text-list-item font-medium text-icon-today ring-1 ring-border-soft transition active:scale-[0.99]"
                >
                  ＋ 持ち物を入力...
                </button>
              )}
            </div>
            {spotDeadlinePicker ? (
              <SpotDeadlineCalendar
                picker={spotDeadlinePicker}
                onCancel={cancelSpotDeadlinePicker}
                onConfirm={confirmSpotDeadlinePicker}
                onSelectDate={selectSpotDeadlineDate}
                onShiftMonth={shiftSpotDeadlineMonth}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
