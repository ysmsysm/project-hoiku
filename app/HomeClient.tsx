"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
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
import {
  HomeItemQuantityText,
  HomeItemUnitText,
} from "../src/components/ui/HomeItemQuantityText";
import { ReusableCard } from "../src/components/ui/ReusableCard";
import { SectionCard } from "../src/components/ui/SectionCard";
import { appRepository } from "../src/lib/repositories/app-repository";
import {
  defaultCustomItems,
  defaultRoughStates,
} from "../src/data/defaultCustomItems";
import {
  getTodayDateKey,
  getTomorrowDateKey,
  isSpotDeadlineEnabled,
} from "../src/lib/deadline";
import {
  getPreparationCompletedAt,
  isPreparationSessionCompleted,
} from "../src/lib/preparation-status";
import {
  canAddHomeDurableItem,
  canSelectHomeNewItemWeekdays,
  canDeleteHomeDurableItems,
  canEditHomeChildProfile,
  canEditHomeDurableSettings,
  canEditHomeExistingItemDetails,
  canEditHomeItemWeekdays,
  canEditHomeRoughItemUnit,
  canSortHomeDurableItems,
  canToggleHomeRoughState,
  getHomeSharedErrorCopy,
  getSharedInitialDurableSettings,
  sharedSettingsReadonlyMessage,
  type HomeDataSource,
} from "../src/lib/home-data-source";
import {
  canApplyHomeLocalDailyHydration,
  canRenderHomeCompleteCheckAction,
  canNavigateHomeAfterSharedCompleteCheck,
  canRunHomeCompleteCheckMutation,
  canRunHomeLocalDailyMutation,
  canRunHomeCompletePreparationMutation,
  canRunHomeLocalCompleteCheck,
  canRunHomeObservedQuantityMutation,
  canRunHomePreparationBulkMutation,
  canRunHomePreparationItemMutation,
  canRunHomeSendThanksMutation,
  completeHomeLocalDailyHydration,
  createHomeLockerItems,
  createDefaultHomeCheckCounts,
  createHomeDailyInitialState,
  deriveHomeSharedDailyState,
  getHomeLocalDailySourceKey,
  getHomeDailyItemMutationErrorView,
  getHomePreparationBulkTooManyItemsView,
  getHomeSharedDailyStatusView,
  getHomeSharedDailyPropSync,
  getHomeSharedDailyStateSyncKey,
  initialHomeLocalDailyHydrationState,
  isHomeSharedDailyDisplayState,
  isHomeSharedThanksSelf,
  isHomeLocalDailyHydrationReady,
  loadHomeLocalDailyInitialState,
  shouldRunHomeLocalDailyAutoEffects,
  startHomeLocalDailyHydration,
  type HomeDailyInitialState,
  type HomeDailyItemMutationErrorView,
  type HomeDailyItemMutationOperation,
} from "../src/lib/home-daily-initial-state";
import { saveHomeChildProfile } from "../src/lib/home-child-profile-save";
import { saveSharedChildProfile } from "../src/lib/family-sharing/save-child-profile";
import {
  applyHomeRoughStateChange,
  appendHomeCustomItemToCategory,
  canUpdateHomeCustomItemDragPointer,
  canInterruptHomeCustomItemSorting,
  getHomeCustomItemDragCenterY,
  getHomeCustomItemDragTargetIndex,
  reorderHomeCustomItemsInCategory,
  saveHomeCustomItemAdd,
  saveHomeCustomItemDelete,
  saveHomeCustomItemEdit,
  saveHomeCustomItemSortOrder,
  saveHomeRoughState,
  type HomeCustomItemDragMoveDirection,
} from "../src/lib/home-item-template-save";
import { homeItemQuantityMax } from "../src/lib/home-item-template-constraints";
import {
  saveSharedItemTemplateAdd,
  saveSharedItemTemplateDelete,
  saveSharedItemTemplateEdit,
  saveSharedItemTemplateSortOrders,
  saveSharedRoughState,
  type SharedItemTemplateAddClient,
  type SharedItemTemplateSortOrderClient,
} from "../src/lib/family-sharing/save-item-template";
import { clampSpotQuantity, formatSpotItemName } from "../src/lib/spotQuantity";
import { createClient as createSupabaseClient } from "../src/lib/supabase/client";
import {
  updateDailyPreparationItems,
} from "../src/lib/family-sharing/update-daily-preparation-items";
import { completeDailyPreparation } from "../src/lib/family-sharing/complete-daily-preparation";
import { completeDailyCheck } from "../src/lib/family-sharing/complete-daily-check";
import { sendDailyThanks } from "../src/lib/family-sharing/send-daily-thanks";
import { loadDailyData } from "../src/lib/family-sharing/daily-data";
import {
  isDeferredDailyItemMutationNoOp,
  isPreparedDailyItemMutationNoOp,
  updateDailyItem,
  validateUpdateDailyItemInput,
} from "../src/lib/family-sharing/update-daily-item";
import {
  applyUpdatedItemsToSharedDailyState,
  applyUpdatedItemToSharedDailyState,
  applyCheckedSessionToSharedDailyState,
  applyCompletedSessionToSharedDailyState,
  applyThanksSessionToSharedDailyState,
  getSharedPreparationBulkMutationPlan,
} from "../src/lib/family-sharing/shared-daily-data";
import { useEditableSection } from "../src/hooks/useEditableSection";
import type { ChildProfile } from "../src/types/child";
import type { SpotAddition } from "../src/types/spot";
import type { SharedDailyState } from "../src/types/shared-daily";
import type {
  CompleteDailyCheckClient,
  DailyDataClient,
  DailySession,
  SendDailyThanksClient,
  UpdateDailyItemClient,
  UpdateDailyItemInput,
} from "../src/types/daily";
import type {
  AppTab,
  CustomizableItem,
  CustomItemCategory,
  LockerItem,
  PreparationItem,
  PreparationSession,
  TodayOnlyTemporaryItem,
} from "../src/types/preparation";

const roughStateOrder = ["十分", "少ない", "補充"] as const;
type RoughState = (typeof roughStateOrder)[number];
type SharedSessionMutationOperation =
  | "complete_check"
  | "complete_preparation"
  | "send_thanks";
type SharedSessionMutationRequest = {
  operation: SharedSessionMutationOperation;
  token: symbol;
  scopeKey: string;
  generation: number;
  startVersion: number;
};
type SharedCompleteCheckNavigationRequest = {
  scopeKey: string;
  generation: number;
  dailySessionId: string;
  responseVersion: number;
  appliedSession: DailySession;
};

const itemCategories: CustomItemCategory[] = [
  "持ち物",
  "スポット追加",
  "ざっくり管理",
];

const itemSettingsWeekdayOptions = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 0, label: "日" },
];

type CustomItemDraft = {
  name: string;
  count: string;
  unit: string;
  weekdays: number[];
};

type CustomItemDragState = {
  itemId: string;
  pointerId: number;
  offsetY: number;
  currentY: number;
  left: number;
  width: number;
};

type HomeClientProps = {
  dataSource?: HomeDataSource;
};

const roughStateStyles: Record<RoughState, string> = {
  十分: "bg-success text-surface",
  少ない: "bg-warning text-text-primary",
  補充: "bg-danger text-surface",
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
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSelectDate: (dateKey: string) => void;
  onShiftMonth: (offset: number) => void;
};

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function SpotDeadlineCalendar({
  picker,
  disabled = false,
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
            disabled={disabled}
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
            disabled={disabled}
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
                disabled={disabled}
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
            disabled={disabled}
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

export default function HomeClient({
  dataSource = { mode: "local" },
}: HomeClientProps) {
  if (dataSource.mode === "shared-error") {
    return <SharedErrorScreen reason={dataSource.reason} />;
  }

  return <HomeClientContent key={dataSource.mode} dataSource={dataSource} />;
}

function SharedErrorScreen({
  reason,
}: {
  reason: Extract<HomeDataSource, { mode: "shared-error" }>["reason"];
}) {
  const router = useRouter();
  const errorCopy = getHomeSharedErrorCopy(reason);

  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-hoiku-ink">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[430px] items-center">
        <SectionCard appearance="current" className="w-full">
          <div className="space-y-4">
            <div>
              <h1 className="text-card-title font-semibold text-text-primary">
                {errorCopy.title}
              </h1>
              <p className="mt-2 text-status font-normal leading-relaxed text-text-secondary">
                {errorCopy.body}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <button
                type="button"
                onClick={() => router.refresh()}
                className="h-[48px] rounded-button bg-primary px-4 text-button font-bold text-surface shadow-button transition active:scale-[0.99]"
              >
                再読み込み
              </button>
              <a
                href="/family"
                className="grid h-[48px] place-items-center rounded-button border border-border-soft bg-surface px-4 text-button font-bold text-text-primary shadow-card transition active:scale-[0.99]"
              >
                家族画面へ
              </a>
            </div>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

function HomeClientContent({
  dataSource,
}: {
  dataSource: Exclude<HomeDataSource, { mode: "shared-error" }>;
}) {
  const router = useRouter();
  const sharedInitialData = getSharedInitialDurableSettings(dataSource);
  const initialCustomItems =
    sharedInitialData?.customItems ?? defaultCustomItems;
  const initialChildProfile =
    sharedInitialData?.childProfile ?? appRepository.defaultChildProfile;
  const initialRoughStates =
    sharedInitialData?.roughStates ?? createDefaultRoughStates(initialCustomItems);
  const childProfileEditable = canEditHomeChildProfile(dataSource);
  const durableItemsEditable = canEditHomeDurableSettings(dataSource);
  const existingItemDetailsEditable =
    canEditHomeExistingItemDetails(dataSource);
  const roughItemUnitEditable = canEditHomeRoughItemUnit(dataSource);
  const roughStateEditable = canToggleHomeRoughState(dataSource);
  const durableItemsDeletable = canDeleteHomeDurableItems(dataSource);
  const itemWeekdaysEditable = canEditHomeItemWeekdays(dataSource);
  const newItemWeekdaysSelectable =
    canSelectHomeNewItemWeekdays(dataSource);
  const durableItemsSortable = canSortHomeDurableItems(dataSource);
  const dailyInitialState = createHomeDailyInitialState(
    dataSource,
    initialCustomItems,
  );

  const [activeTab, setActiveTab] = useState<AppTab>("check");
  const [customItems, setCustomItems] =
    useState<CustomizableItem[]>(initialCustomItems);
  const [sharedDailyState, setSharedDailyState] =
    useState<SharedDailyState | null>(dailyInitialState.sharedDailyState);
  const initialSharedDailyKeyRef = useRef<string | null>(
    dailyInitialState.sharedDailyState
      ? getHomeSharedDailyStateSyncKey(dailyInitialState.sharedDailyState)
      : null,
  );
  const sharedDailyView = useMemo(
    () =>
      sharedDailyState
        ? deriveHomeSharedDailyState(sharedDailyState)
        : null,
    [sharedDailyState],
  );
  const dailyMode: HomeDailyInitialState["mode"] =
    dataSource.mode === "local"
      ? "local"
      : sharedDailyView?.mode ?? "shared-non-success";
  const canRunLocalDailyMutation = canRunHomeLocalDailyMutation(dailyMode);
  const canRunObservedQuantityMutation =
    canRunHomeObservedQuantityMutation(dailyMode);
  const canRunPreparationItemMutation =
    canRunHomePreparationItemMutation(dailyMode);
  const canRunPreparationBulkMutation =
    canRunHomePreparationBulkMutation(dailyMode);
  const canRunCompletePreparationMutation =
    canRunHomeCompletePreparationMutation(dailyMode);
  const canRunCompleteCheckMutation =
    canRunHomeCompleteCheckMutation(dailyMode);
  const canRunSendThanksMutation = canRunHomeSendThanksMutation(dailyMode);
  const sharedDailyStatusView =
    sharedDailyState && isHomeSharedDailyDisplayState(sharedDailyState)
      ? getHomeSharedDailyStatusView(sharedDailyState)
      : null;
  const localDailySourceKey = getHomeLocalDailySourceKey(dataSource);
  const [localDailyHydration, setLocalDailyHydration] = useState(
    initialHomeLocalDailyHydrationState,
  );
  const localDailyHydrationRequestRef = useRef(0);
  const [shortageCounts, setShortageCounts] = useState(
    dailyInitialState.mode === "local" ? dailyInitialState.checkCounts : {},
  );
  const [pendingDailyItemMutationItemIds, setPendingDailyItemMutationItemIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const pendingDailyItemMutationRequestsRef = useRef(new Map<string, symbol>());
  const [sharedSessionMutationPendingOperation, setSharedSessionMutationPendingOperation] =
    useState<SharedSessionMutationOperation | null>(null);
  const sharedSessionMutationRequestRef =
    useRef<SharedSessionMutationRequest | null>(null);
  const isSharedSessionMutationPending =
    sharedSessionMutationPendingOperation !== null;
  const isCompleteCheckPending =
    sharedSessionMutationPendingOperation === "complete_check";
  const isCompletePreparationPending =
    sharedSessionMutationPendingOperation === "complete_preparation";
  const isSendThanksPending =
    sharedSessionMutationPendingOperation === "send_thanks";
  const dailyMutationBrowserClientRef = useRef<ReturnType<
    typeof createSupabaseClient
  > | null>(null);
  const dailyItemMutationClientRef = useRef<UpdateDailyItemClient | null>(null);
  const dailyCheckClientRef = useRef<CompleteDailyCheckClient | null>(null);
  const dailyPreparationItemsClientRef = useRef<DailyDataClient | null>(null);
  const dailyThanksClientRef = useRef<SendDailyThanksClient | null>(null);
  const sharedCompleteCheckNavigationRequestRef =
    useRef<SharedCompleteCheckNavigationRequest | null>(null);
  const dailyItemMutationMountedRef = useRef(true);
  const [dailyItemMutationError, setDailyItemMutationError] =
    useState<HomeDailyItemMutationErrorView | null>(null);
  const [localSession, setLocalSession] = useState<PreparationSession | null>(
    dailyInitialState.mode === "local" ? dailyInitialState.session : null,
  );
  const session =
    dataSource.mode === "shared"
      ? sharedDailyView?.session ?? null
      : localSession;
  const displayedCheckCounts =
    dataSource.mode === "shared" &&
    sharedDailyView?.mode === "shared-success"
      ? sharedDailyView.checkCounts
      : shortageCounts;
  const sharedInitialDailyData =
    dataSource.mode === "shared" ? dataSource.initialDailyData : null;
  const sharedInitialDailyKey = sharedInitialDailyData
    ? getHomeSharedDailyStateSyncKey(sharedInitialDailyData)
    : null;
  const dailyItemMutationScopeState =
    sharedInitialDailyData?.status === "success"
      ? sharedInitialDailyData
      : null;
  const dailyItemMutationScopeKey =
    dataSource.mode === "shared" && dailyItemMutationScopeState
      ? [
          dataSource.familyId,
          dataSource.currentMemberId,
          dailyItemMutationScopeState.session.childId,
          dailyItemMutationScopeState.session.sessionDate,
          dailyItemMutationScopeState.session.dailySessionId,
          sharedInitialDailyKey,
        ].join(":")
      : dataSource.mode === "shared"
        ? [
            dataSource.mode,
            dataSource.familyId,
            dataSource.currentMemberId,
            dataSource.initialDailyData.status,
            "sessionDate" in dataSource.initialDailyData
              ? dataSource.initialDailyData.sessionDate
              : "none",
          ].join(":")
        : dataSource.mode;
  const dailyItemMutationScopeKeyRef = useRef(dailyItemMutationScopeKey);
  const dailyItemMutationScopeGenerationRef = useRef(0);
  if (dailyItemMutationScopeKeyRef.current !== dailyItemMutationScopeKey) {
    dailyItemMutationScopeKeyRef.current = dailyItemMutationScopeKey;
    dailyItemMutationScopeGenerationRef.current += 1;
  }
  const localDailyHydrationReady = isHomeLocalDailyHydrationReady(
    localDailyHydration,
    localDailySourceKey,
  );
  const completeCheckActionState = {
    dailyMode,
    hasSession: session !== null,
    hasCheckView: sharedDailyView?.mode === "shared-success",
    localHydrationReady: localDailyHydrationReady,
  };
  const shouldRenderCompleteCheckAction =
    canRenderHomeCompleteCheckAction(completeCheckActionState);
  const canRunLocalCompleteCheck = canRunHomeLocalCompleteCheck(
    completeCheckActionState,
  );
  const [childProfile, setChildProfile] =
    useState<ChildProfile>(initialChildProfile);
  const childNameEditor = useEditableSection({
    initialValue: initialChildProfile.name,
    validate: validateChildName,
    onSave: async (name) => {
      if (!childProfileEditable) {
        return;
      }

      const trimmedName = name.trim().slice(0, 8);
      const nextProfile: ChildProfile = {
        ...childProfile,
        name: trimmedName,
      };

      await saveHomeChildProfile(dataSource, nextProfile, {
        applyChildProfile: setChildProfile,
        saveLocalChildProfile: appRepository.saveChildProfile,
        saveSharedChildProfile: (input) =>
          saveSharedChildProfile(createSupabaseClient(), input),
      });
    },
  });
  const setSavedChildName = childNameEditor.setSavedValue;
  const setChildNameDraft = childNameEditor.setDraftValue;
  const [roughStates, setRoughStates] = useState<Record<string, RoughState>>(
    () => initialRoughStates,
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
  const [isZeroQuantityToastVisible, setIsZeroQuantityToastVisible] =
    useState(false);
  const [sortingCategory, setSortingCategory] =
    useState<CustomItemCategory | null>(null);
  const [sortingDraftItems, setSortingDraftItems] = useState<
    CustomizableItem[] | null
  >(null);
  const [isSavingCustomItemSortOrder, setIsSavingCustomItemSortOrder] =
    useState(false);
  const [customItemSortOrderError, setCustomItemSortOrderError] =
    useState<string | null>(null);
  const [addingCategory, setAddingCategory] =
    useState<CustomItemCategory | null>(null);
  const [newCustomItemDraft, setNewCustomItemDraft] = useState<CustomItemDraft>({
    name: "",
    count: "1",
    unit: "",
    weekdays: [],
  });
  const [editingCustomItemId, setEditingCustomItemId] = useState<string | null>(
    null,
  );
  const [customItemEditDraft, setCustomItemEditDraft] =
    useState<CustomItemDraft>({
      name: "",
      count: "1",
      unit: "",
      weekdays: [],
    });
  const [customItemEditError, setCustomItemEditError] = useState<string | null>(
    null,
  );
  const [customItemAddError, setCustomItemAddError] = useState<string | null>(
    null,
  );
  const [customItemDeleteError, setCustomItemDeleteError] = useState<{
    itemId: string;
    message: string;
  } | null>(null);
  const [customItemDeleteConfirmItemId, setCustomItemDeleteConfirmItemId] =
    useState<string | null>(null);
  const [customItemDeletingItemIds, setCustomItemDeletingItemIds] = useState(
    () => new Set<string>(),
  );
  const [isAddingCustomItem, setIsAddingCustomItem] = useState(false);
  const [savingCustomItemId, setSavingCustomItemId] = useState<string | null>(
    null,
  );
  const [roughStateSavingItemIds, setRoughStateSavingItemIds] = useState<
    string[]
  >([]);
  const [roughStateSaveError, setRoughStateSaveError] = useState<string | null>(
    null,
  );
  const [expandedWeekdayItemId, setExpandedWeekdayItemId] = useState<
    string | null
  >(null);
  const [draggingCustomItemId, setDraggingCustomItemId] = useState<
    string | null
  >(null);
  const [customItemDragState, setCustomItemDragState] =
    useState<CustomItemDragState | null>(null);
  const todayOnlyInputRef = useRef<HTMLInputElement>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const zeroQuantityToastTimeoutRef = useRef<number | null>(null);
  const pendingCustomItemDragRef = useRef<{
    itemId: string;
    category: CustomItemCategory;
    pointerId: number;
    clientY: number;
    element: HTMLElement;
  } | null>(null);
  const activeCustomItemDragTargetRef = useRef<{
    itemId: string;
    category: CustomItemCategory;
    pointerId: number;
    targetIndex: number;
    lastMoveDirection: HomeCustomItemDragMoveDirection | null;
    latestClientY: number;
    pointerOffsetY: number;
    rowHeight: number;
  } | null>(null);
  const customItemDragStartTimeoutRef = useRef<number | null>(null);
  const customItemDragFrameRef = useRef<number | null>(null);
  const previousActiveTabRef = useRef<AppTab>(activeTab);
  const customItemSaveInFlightRef = useRef(false);
  const customItemAddInFlightRef = useRef(false);
  const customItemSortOrderSaveInFlightRef = useRef(false);
  const customItemDeleteInFlightItemIdsRef = useRef(new Set<string>());
  const roughStateSaveInFlightItemIdsRef = useRef(new Set<string>());
  const roughStatesRef = useRef(initialRoughStates);

  const canInterruptCustomItemSorting = () =>
    canInterruptHomeCustomItemSorting(
      customItemSortOrderSaveInFlightRef.current,
    );

  const cancelCustomItemDragFrame = () => {
    if (customItemDragFrameRef.current !== null) {
      window.cancelAnimationFrame(customItemDragFrameRef.current);
      customItemDragFrameRef.current = null;
    }
  };

  useEffect(() => {
    if (!sharedInitialData) {
      return;
    }

    setChildProfile(sharedInitialData.childProfile);
    setSavedChildName(sharedInitialData.childProfile.name);
    setChildNameDraft(sharedInitialData.childProfile.name);
    setCustomItems(sharedInitialData.customItems);
    roughStatesRef.current = sharedInitialData.roughStates;
    setRoughStates(sharedInitialData.roughStates);
  }, [setChildNameDraft, setSavedChildName, sharedInitialData]);

  useEffect(() => {
    const sync = getHomeSharedDailyPropSync(
      initialSharedDailyKeyRef.current,
      dataSource,
    );

    if (!sync.shouldSync) {
      return;
    }

    initialSharedDailyKeyRef.current = sync.initialKey;
    setSharedDailyState(sync.state);
  }, [dataSource, sharedInitialDailyData, sharedInitialDailyKey]);

  useEffect(() => {
    pendingDailyItemMutationRequestsRef.current.clear();
    sharedSessionMutationRequestRef.current = null;
    sharedCompleteCheckNavigationRequestRef.current = null;
    setPendingDailyItemMutationItemIds(new Set());
    setSharedSessionMutationPendingOperation(null);
    setDailyItemMutationError(null);
  }, [dailyItemMutationScopeKey]);

  useEffect(() => {
    dailyItemMutationMountedRef.current = true;
    const pendingRequests = pendingDailyItemMutationRequestsRef.current;
    return () => {
      dailyItemMutationMountedRef.current = false;
      pendingRequests.clear();
      sharedSessionMutationRequestRef.current = null;
      sharedCompleteCheckNavigationRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    const navigation = sharedCompleteCheckNavigationRequestRef.current;
    if (!navigation) {
      return;
    }
    if (
      !canNavigateHomeAfterSharedCompleteCheck(sharedDailyState, {
        requestScopeKey: navigation.scopeKey,
        currentScopeKey: dailyItemMutationScopeKeyRef.current,
        requestScopeGeneration: navigation.generation,
        currentScopeGeneration: dailyItemMutationScopeGenerationRef.current,
        dailySessionId: navigation.dailySessionId,
        responseVersion: navigation.responseVersion,
        appliedSession: navigation.appliedSession,
      })
    ) {
      sharedCompleteCheckNavigationRequestRef.current = null;
      return;
    }
    sharedCompleteCheckNavigationRequestRef.current = null;
    setActiveTab("items");
  }, [dailyItemMutationScopeKey, sharedDailyState]);

  useEffect(() => {
    roughStatesRef.current = roughStates;
  }, [roughStates]);

  useEffect(() => {
    let cancelled = false;
    let durableItems = initialCustomItems;

    if (!localDailySourceKey) {
      localDailyHydrationRequestRef.current += 1;
      setLocalDailyHydration(initialHomeLocalDailyHydrationState);
      return;
    }

    const requestId = localDailyHydrationRequestRef.current + 1;
    localDailyHydrationRequestRef.current = requestId;
    const loadingHydration = startHomeLocalDailyHydration(
      localDailySourceKey,
      requestId,
    );
    setLocalDailyHydration(loadingHydration);

    const savedChildProfile = appRepository.loadChildProfile();
    const savedCustomItems = normalizeCustomItems(
      appRepository.loadCustomItems(defaultCustomItems),
    );
    durableItems = savedCustomItems;
    const savedRoughStates = appRepository.loadRoughStates(
      createDefaultRoughStates(savedCustomItems),
    );

    const localDailyState = loadHomeLocalDailyInitialState(
      { mode: "local" },
      appRepository,
      createDefaultHomeCheckCounts(durableItems),
    );

    if (
      !localDailyState ||
      cancelled ||
      localDailyHydrationRequestRef.current !== requestId ||
      !canApplyHomeLocalDailyHydration(
        loadingHydration,
        localDailySourceKey,
        requestId,
      )
    ) {
      return;
    }

    setChildProfile(savedChildProfile);
    setSavedChildName(savedChildProfile.name);
    setChildNameDraft(savedChildProfile.name);
    setCustomItems(savedCustomItems);
    setRoughStates(savedRoughStates);
    setShortageCounts(localDailyState.checkCounts);
    setLocalSession(localDailyState.preparationSession);
    setTemporaryTodayOnlyItems(localDailyState.temporaryTodayOnlyItems);
    setSpotAdditions(localDailyState.spotAdditions);
    setSelectedTodayOnlyIds(
      localDailyState.spotAdditions.map((addition) => addition.itemId),
    );
    setSpotDeadlines(localDailyState.spotDeadlines);
    setLocalDailyHydration(
      completeHomeLocalDailyHydration(
        loadingHydration,
        localDailySourceKey,
        requestId,
      ),
    );

    return () => {
      cancelled = true;
    };
  }, [
    initialCustomItems,
    localDailySourceKey,
    setChildNameDraft,
    setSavedChildName,
  ]);

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
    if (
      !shouldRunHomeLocalDailyAutoEffects(
        dataSource,
        localDailyHydration,
        localDailySourceKey,
      )
    ) {
      return;
    }

    const today = new Date();
    const todayWeekday = today.getDay();
    const todayKey = getTodayDateKey();
    if (!session) {
      return;
    }

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

      appRepository.saveSpotAdditions(nextAdditions);
      setSelectedTodayOnlyIds(nextAdditions.map((addition) => addition.itemId));
      return nextAdditions;
    });
  }, [
    customItems,
    dataSource,
    localDailyHydration,
    localDailySourceKey,
    session,
    spotDeadlines,
  ]);

  useEffect(() => {
    if (isTodayOnlyInputOpen) {
      todayOnlyInputRef.current?.focus();
    }
  }, [isTodayOnlyInputOpen]);

  useEffect(
    () => () => {
      if (zeroQuantityToastTimeoutRef.current !== null) {
        window.clearTimeout(zeroQuantityToastTimeoutRef.current);
      }

      if (customItemDragStartTimeoutRef.current !== null) {
        window.clearTimeout(customItemDragStartTimeoutRef.current);
      }

      cancelCustomItemDragFrame();
      activeCustomItemDragTargetRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (
      !shouldRunHomeLocalDailyAutoEffects(
        dataSource,
        localDailyHydration,
        localDailySourceKey,
      )
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const freshTemporaryItems = appRepository.loadTodayOnlyTemporaryItems();
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
  }, [dataSource, localDailyHydration, localDailySourceKey]);

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
    () => {
      if (dataSource.mode === "local") {
        return createHomeLockerItems({
          mode: "local",
          items: customItems,
          checkCounts: displayedCheckCounts,
        });
      }

      if (sharedDailyView?.mode === "shared-success") {
        return createHomeLockerItems({
          mode: "shared-success",
          checkView: sharedDailyView.checkView,
        });
      }

      return createHomeLockerItems({ mode: "shared-non-success" });
    },
    [customItems, dataSource.mode, displayedCheckCounts, sharedDailyView],
  );
  const disabledObservedQuantityItemIds = useMemo(() => {
    const disabledIds = new Set(pendingDailyItemMutationItemIds);
    if (
      isSharedSessionMutationPending ||
      (dailyMode === "shared-success" && session?.completedAt)
    ) {
      lockerItems.forEach((item) => {
        disabledIds.add(item.dailyItemId ?? item.id);
      });
    }
    if (dailyMode === "shared-success") {
      lockerItems.forEach((item) => {
        if (!item.dailyItemId || item.dailyItemVersion === undefined) {
          disabledIds.add(item.dailyItemId ?? item.id);
        }
      });
    }
    return disabledIds;
  }, [
    dailyMode,
    isSharedSessionMutationPending,
    lockerItems,
    pendingDailyItemMutationItemIds,
    session?.completedAt,
  ]);
  const maxLockerRequiredCount = Math.max(
    1,
    ...lockerItems.map((item) => item.requiredCount),
  );
  const roughValueColumnWidth = "5rem";
  const roughIndicatorColumnWidth = getCardListRowIndicatorWidth(
    maxLockerRequiredCount + 1,
    roughValueColumnWidth,
  );

  const sessionItems = useMemo(() => session?.items ?? [], [session]);
  const isSharedDailyPreparationCompleted =
    dailyMode === "shared-success" && Boolean(session?.completedAt);
  const sharedPreparationBulkPlan = useMemo(
    () =>
      sharedDailyState?.status === "success"
        ? getSharedPreparationBulkMutationPlan(sharedDailyState.session)
        : null,
    [sharedDailyState],
  );
  const isSharedPreparationBulkPending =
    sharedPreparationBulkPlan?.status === "ready" &&
    sharedPreparationBulkPlan.updates.some((update) =>
      pendingDailyItemMutationItemIds.has(update.dailyItemId),
    );
  const hasInvalidSharedPreparationBulkItem =
    dailyMode === "shared-success" &&
    sessionItems.some(
      (item) =>
        !item.later &&
        (!item.dailyItemId || item.dailyItemVersion === undefined),
    );
  const isPreparationBulkDisabled =
    !canRunPreparationBulkMutation ||
    isSharedDailyPreparationCompleted ||
    isSharedSessionMutationPending ||
    (dailyMode === "shared-success" &&
      (sharedPreparationBulkPlan?.status !== "ready" ||
        hasInvalidSharedPreparationBulkItem ||
        isSharedPreparationBulkPending));
  const preparationBulkAvailabilityError =
    dailyMode === "shared-success" &&
    sharedPreparationBulkPlan?.status === "too_many"
      ? getHomePreparationBulkTooManyItemsView()
      : null;
  const displayedDailyItemMutationError =
    preparationBulkAvailabilityError ?? dailyItemMutationError;
  const disabledPreparationItemIds = useMemo(() => {
    const disabledIds = new Set(pendingDailyItemMutationItemIds);
    if (isSharedSessionMutationPending || isSharedDailyPreparationCompleted) {
      sessionItems.forEach((item) => {
        disabledIds.add(item.dailyItemId ?? item.id);
      });
    }
    if (dailyMode === "shared-success") {
      sessionItems.forEach((item) => {
        if (!item.dailyItemId || item.dailyItemVersion === undefined) {
          disabledIds.add(item.dailyItemId ?? item.id);
        }
      });
    }
    return disabledIds;
  }, [
    dailyMode,
    isSharedSessionMutationPending,
    isSharedDailyPreparationCompleted,
    pendingDailyItemMutationItemIds,
    sessionItems,
  ]);
  const isPreparationDone =
    sessionItems.length === 0 ||
    sessionItems.every((item) => item.checked || item.later);
  const hasCarryoverItems = sessionItems.some((item) => item.carryover);
  const preparationCompletedAt = session
    ? getPreparationCompletedAt(session)
    : null;
  const canShowPreparationStatus =
    session !== null &&
    sessionItems.length > 0 &&
    isPreparationSessionCompleted(session);
  const sharedThanksSession =
    sharedDailyState?.status === "success" ? sharedDailyState.session : null;
  const isUnsentSharedSelfThanks =
    dailyMode === "shared-success" &&
    dataSource.mode === "shared" &&
    sharedThanksSession !== null &&
    !sharedThanksSession.thanksSent &&
    isHomeSharedThanksSelf(
      dataSource.currentMemberId,
      sharedThanksSession.completedByMemberId,
    );
  const shouldShowThanksButton =
    canShowPreparationStatus &&
    (dailyMode === "local" ||
      (dailyMode === "shared-success" && !isUnsentSharedSelfThanks));
  const isSharedThanksButtonDisabled =
    dailyMode !== "shared-success" ||
    !canRunSendThanksMutation ||
    !sharedThanksSession?.isCompleted ||
    !sharedThanksSession.completedAt ||
    sharedThanksSession.thanksSent ||
    !sharedThanksSession.completedByMemberId ||
    !Number.isInteger(sharedThanksSession.version) ||
    sharedThanksSession.version < 1 ||
    pendingDailyItemMutationRequestsRef.current.size > 0 ||
    isSharedSessionMutationPending;
  const hasCurrentSharedCompleteCheckScope =
    dataSource.mode === "shared" &&
    dataSource.initialDailyData.status === "success" &&
    sharedDailyState?.status === "success" &&
    dataSource.familyId.toLowerCase() ===
      sharedDailyState.session.familyId.toLowerCase() &&
    dataSource.initialDailyData.session.familyId.toLowerCase() ===
      sharedDailyState.session.familyId.toLowerCase() &&
    dataSource.initialDailyData.session.childId.toLowerCase() ===
      sharedDailyState.session.childId.toLowerCase() &&
    dataSource.initialDailyData.session.sessionDate ===
      sharedDailyState.session.sessionDate &&
    dataSource.initialDailyData.session.dailySessionId.toLowerCase() ===
      sharedDailyState.session.dailySessionId.toLowerCase();
  const canRunSharedCompleteCheck =
    dailyMode === "shared-success" &&
    canRunCompleteCheckMutation &&
    hasCurrentSharedCompleteCheckScope &&
    sharedDailyState?.status === "success" &&
    !sharedDailyState.session.isChecked &&
    sharedDailyState.session.checkedAt === null &&
    !sharedDailyState.session.isCompleted &&
    sharedDailyState.session.completedAt === null &&
    Number.isInteger(sharedDailyState.session.version) &&
    sharedDailyState.session.version >= 1 &&
    sharedDailyState.session.version < 2_147_483_647 &&
    pendingDailyItemMutationItemIds.size === 0 &&
    !isSharedSessionMutationPending;
  const canRunSharedCompletePreparation =
    dailyMode === "shared-success" &&
    canRunCompletePreparationMutation &&
    session !== null &&
    session.items.length > 0 &&
    !session.completedAt &&
    session.items.every((item) => item.checked || item.later) &&
    sharedDailyState?.status === "success" &&
    sharedDailyState.session.isChecked &&
    Boolean(sharedDailyState.session.checkedAt) &&
    !sharedDailyState.session.isCompleted &&
    Number.isInteger(sharedDailyState.session.version) &&
    sharedDailyState.session.version >= 1 &&
    pendingDailyItemMutationRequestsRef.current.size === 0 &&
    !isSharedSessionMutationPending;
  const lastConfirmedDate = formatHistoryDate(session?.confirmedAt ?? null);
  const lastPreparedDate = formatHistoryDate(preparationCompletedAt);
  const updateSession = (nextSession: PreparationSession) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    setLocalSession(nextSession);
    appRepository.savePreparationSession(nextSession);
  };

  const getCurrentSharedDailySession = () => {
    if (
      dailyMode !== "shared-success" ||
      dataSource.mode !== "shared" ||
      dataSource.initialDailyData.status !== "success" ||
      sharedDailyState?.status !== "success"
    ) {
      return null;
    }

    const initialSession = dataSource.initialDailyData.session;
    if (
      dataSource.familyId.toLowerCase() !==
        sharedDailyState.session.familyId.toLowerCase() ||
      initialSession.familyId.toLowerCase() !==
        sharedDailyState.session.familyId.toLowerCase() ||
      initialSession.childId.toLowerCase() !==
        sharedDailyState.session.childId.toLowerCase() ||
      initialSession.sessionDate !== sharedDailyState.session.sessionDate ||
      initialSession.dailySessionId.toLowerCase() !==
        sharedDailyState.session.dailySessionId.toLowerCase()
    ) {
      return null;
    }

    return sharedDailyState.session;
  };

  const runSharedDailyItemMutation = async (
    input: UpdateDailyItemInput,
    operation: HomeDailyItemMutationOperation,
  ) => {
    if (sharedSessionMutationRequestRef.current) {
      return;
    }
    const dailyItemId = input.dailyItemId;
    const currentSharedSession = getCurrentSharedDailySession();
    const canonicalItem = currentSharedSession?.items.find(
      (item) => item.dailyItemId === dailyItemId,
    );
    if (
      !currentSharedSession ||
      currentSharedSession.familyId !== input.familyId ||
      currentSharedSession.childId !== input.childId ||
      currentSharedSession.sessionDate !== input.sessionDate ||
      currentSharedSession.dailySessionId !== input.dailySessionId ||
      canonicalItem?.version !== input.expectedVersion
    ) {
      return;
    }
    if (pendingDailyItemMutationRequestsRef.current.has(dailyItemId)) {
      return;
    }

    const requestScopeKey = dailyItemMutationScopeKeyRef.current;
    const requestScopeGeneration =
      dailyItemMutationScopeGenerationRef.current;
    const requestToken = Symbol(dailyItemId);
    pendingDailyItemMutationRequestsRef.current.set(dailyItemId, requestToken);
    setPendingDailyItemMutationItemIds(
      new Set(pendingDailyItemMutationRequestsRef.current.keys()),
    );
    setDailyItemMutationError(null);

    try {
      if (!dailyItemMutationClientRef.current) {
        const browserClient =
          dailyMutationBrowserClientRef.current ?? createSupabaseClient();
        dailyMutationBrowserClientRef.current = browserClient;
        dailyItemMutationClientRef.current = {
          rpc(functionName, args) {
            return browserClient.rpc(functionName, args);
          },
        };
      }

      const result = await updateDailyItem(
        dailyItemMutationClientRef.current,
        input,
      );
      if (
        !dailyItemMutationMountedRef.current ||
        dailyItemMutationScopeKeyRef.current !== requestScopeKey ||
        dailyItemMutationScopeGenerationRef.current !== requestScopeGeneration
      ) {
        return;
      }

      if (result.status === "success") {
        setSharedDailyState((current) =>
          current
            ? applyUpdatedItemToSharedDailyState(
                current,
                {
                  familyId: input.familyId,
                  childId: input.childId,
                  sessionDate: input.sessionDate,
                  dailySessionId: input.dailySessionId,
                  dailyItemId: input.dailyItemId,
                  expectedVersion: input.expectedVersion,
                },
                result.item,
              )
            : current,
        );
      } else {
        setDailyItemMutationError(
          getHomeDailyItemMutationErrorView(result, operation),
        );
      }
    } catch {
      if (
        dailyItemMutationMountedRef.current &&
        dailyItemMutationScopeKeyRef.current === requestScopeKey &&
        dailyItemMutationScopeGenerationRef.current === requestScopeGeneration
      ) {
        setDailyItemMutationError(
          getHomeDailyItemMutationErrorView(
            {
              status: "transport_error",
              error: {
                kind: "rpc_error",
                message: "Daily item mutation failed",
              },
            },
            operation,
          ),
        );
      }
    } finally {
      if (
        pendingDailyItemMutationRequestsRef.current.get(dailyItemId) ===
        requestToken
      ) {
        pendingDailyItemMutationRequestsRef.current.delete(dailyItemId);
      }
      if (dailyItemMutationMountedRef.current) {
        setPendingDailyItemMutationItemIds(
          new Set(pendingDailyItemMutationRequestsRef.current.keys()),
        );
      }
    }
  };

  const runSharedDailyPreparationItemsMutation = async () => {
    if (sharedSessionMutationRequestRef.current) {
      return;
    }
    const currentSharedSession = getCurrentSharedDailySession();
    if (!currentSharedSession) {
      return;
    }
    const plan = getSharedPreparationBulkMutationPlan(currentSharedSession);
    if (plan.status !== "ready") {
      return;
    }

    const targetIds = plan.updates.map((update) => update.dailyItemId);
    if (
      targetIds.some((dailyItemId) =>
        pendingDailyItemMutationRequestsRef.current.has(dailyItemId),
      )
    ) {
      return;
    }

    const requestScopeKey = dailyItemMutationScopeKeyRef.current;
    const requestScopeGeneration =
      dailyItemMutationScopeGenerationRef.current;
    const requestToken = Symbol("bulk-prepared");
    targetIds.forEach((dailyItemId) => {
      pendingDailyItemMutationRequestsRef.current.set(
        dailyItemId,
        requestToken,
      );
    });
    setPendingDailyItemMutationItemIds(
      new Set(pendingDailyItemMutationRequestsRef.current.keys()),
    );
    setDailyItemMutationError(null);

    try {
      if (!dailyPreparationItemsClientRef.current) {
        const browserClient =
          dailyMutationBrowserClientRef.current ?? createSupabaseClient();
        dailyMutationBrowserClientRef.current = browserClient;
        dailyPreparationItemsClientRef.current = {
          rpc(functionName, args) {
            return browserClient.rpc(functionName, args);
          },
        };
      }

      const input = {
        familyId: currentSharedSession.familyId,
        childId: currentSharedSession.childId,
        sessionDate: currentSharedSession.sessionDate,
        updates: plan.updates,
      };
      const result = await updateDailyPreparationItems(
        dailyPreparationItemsClientRef.current,
        input,
        {
          dailySessionId: currentSharedSession.dailySessionId,
          items: plan.currentItems,
        },
      );
      if (
        !dailyItemMutationMountedRef.current ||
        dailyItemMutationScopeKeyRef.current !== requestScopeKey ||
        dailyItemMutationScopeGenerationRef.current !== requestScopeGeneration
      ) {
        return;
      }

      if (result.status === "success") {
        setSharedDailyState((current) =>
          current
            ? applyUpdatedItemsToSharedDailyState(
                current,
                {
                  familyId: input.familyId,
                  childId: input.childId,
                  sessionDate: input.sessionDate,
                  dailySessionId: currentSharedSession.dailySessionId,
                  updates: input.updates,
                },
                result.items,
                result.changedCount,
              )
            : current,
        );
      } else {
        setDailyItemMutationError(
          getHomeDailyItemMutationErrorView(result, "bulk_prepared"),
        );
      }
    } catch {
      if (
        dailyItemMutationMountedRef.current &&
        dailyItemMutationScopeKeyRef.current === requestScopeKey &&
        dailyItemMutationScopeGenerationRef.current === requestScopeGeneration
      ) {
        setDailyItemMutationError(
          getHomeDailyItemMutationErrorView(
            {
              status: "transport_error",
              error: {
                kind: "rpc_error",
                message: "Daily preparation items mutation failed",
              },
            },
            "bulk_prepared",
          ),
        );
      }
    } finally {
      targetIds.forEach((dailyItemId) => {
        if (
          pendingDailyItemMutationRequestsRef.current.get(dailyItemId) ===
          requestToken
        ) {
          pendingDailyItemMutationRequestsRef.current.delete(dailyItemId);
        }
      });
      if (dailyItemMutationMountedRef.current) {
        setPendingDailyItemMutationItemIds(
          new Set(pendingDailyItemMutationRequestsRef.current.keys()),
        );
      }
    }
  };

  const updateShortageCount = async (itemId: string, nextCount: number) => {
    if (dailyMode === "local") {
      setShortageCounts((current) => {
        const nextCounts = { ...current, [itemId]: nextCount };
        appRepository.saveCheckCounts(nextCounts);
        return nextCounts;
      });
      return;
    }

    const currentSharedSession = getCurrentSharedDailySession();
    if (!currentSharedSession) {
      return;
    }

    const lockerItem = lockerItems.find((item) => item.id === itemId);
    const dailyItemId = lockerItem?.dailyItemId;
    if (!dailyItemId || lockerItem.dailyItemVersion === undefined) {
      return;
    }

    const canonicalItem = currentSharedSession.items.find(
      (item) => item.dailyItemId === dailyItemId,
    );
    if (
      !canonicalItem ||
      canonicalItem.version !== lockerItem.dailyItemVersion ||
      (canonicalItem.observedQuantity ?? 0) === nextCount
    ) {
      return;
    }

    const input: UpdateDailyItemInput = {
      action: "set_observed_quantity",
      familyId: currentSharedSession.familyId,
      childId: currentSharedSession.childId,
      sessionDate: currentSharedSession.sessionDate,
      dailySessionId: currentSharedSession.dailySessionId,
      dailyItemId,
      expectedVersion: lockerItem.dailyItemVersion,
      requiredQuantity: lockerItem.requiredCount,
      observedQuantity: nextCount,
    };
    const inputError = validateUpdateDailyItemInput(input);
    if (inputError) {
      setDailyItemMutationError(
        getHomeDailyItemMutationErrorView(
          { status: "client_error", error: inputError },
          "quantity",
        ),
      );
      return;
    }

    await runSharedDailyItemMutation(input, "quantity");
  };

  const toggleRoughState = async (itemId: string) => {
    if (!roughStateEditable) {
      return;
    }

    if (roughStateSaveInFlightItemIdsRef.current.has(itemId)) {
      return;
    }

    const currentStates = roughStatesRef.current;
    const currentState = currentStates[itemId] ?? "十分";
    const currentIndex = roughStateOrder.indexOf(currentState);
    const nextState =
      roughStateOrder[(currentIndex + 1) % roughStateOrder.length];
    const nextStates = applyHomeRoughStateChange(
      currentStates,
      itemId,
      nextState,
    );

    roughStateSaveInFlightItemIdsRef.current.add(itemId);
    setRoughStateSavingItemIds((current) => [...current, itemId]);
    setRoughStateSaveError(null);

    try {
      await saveHomeRoughState(dataSource, itemId, nextState, nextStates, {
        applyRoughStates: (states) => {
          roughStatesRef.current = applyHomeRoughStateChange(
            roughStatesRef.current,
            itemId,
            states[itemId],
          );
          setRoughStates((current) => ({
            ...current,
            [itemId]: states[itemId],
          }));
        },
        saveLocalRoughStates: appRepository.saveRoughStates,
        saveSharedRoughState: (input) =>
          saveSharedRoughState(createSupabaseClient(), input),
      });
    } catch (error) {
      console.error("Failed to save rough state", error);
      setRoughStateSaveError("保存できませんでした。もう一度お試しください");
    } finally {
      roughStateSaveInFlightItemIdsRef.current.delete(itemId);
      setRoughStateSavingItemIds((current) =>
        current.filter((savingItemId) => savingItemId !== itemId),
      );
    }
  };

  const updateSpotAdditions = (nextAdditions: SpotAddition[]) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    setSpotAdditions(nextAdditions);
    setSelectedTodayOnlyIds(nextAdditions.map((addition) => addition.itemId));
    appRepository.saveSpotAdditions(nextAdditions);
  };

  const updateSpotDeadlines = (nextDeadlines: Record<string, string>) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    setSpotDeadlines(nextDeadlines);
    appRepository.saveSpotDeadlines(nextDeadlines);
  };

  const updateTemporaryTodayOnlyItems = (nextItems: TodayOnlyTemporaryItem[]) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    setTemporaryTodayOnlyItems(nextItems);
    appRepository.saveTodayOnlyTemporaryItems(nextItems);
  };

  const addSpotItem = (itemId: string, dueDate: string | null = null) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    const nextAdditions = [
      ...spotAdditions.filter((addition) => addition.itemId !== itemId),
      { itemId, dueDate },
    ];

    updateSpotAdditions(nextAdditions);
  };

  const removeSpotItem = (itemId: string) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    updateSpotAdditions(
      spotAdditions.filter((addition) => addition.itemId !== itemId),
    );
  };

  const toggleSpotItem = (itemId: string) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    if (selectedTodayOnlyIds.includes(itemId)) {
      removeSpotItem(itemId);
      return;
    }

    addSpotItem(itemId, spotDeadlines[itemId] ?? null);
  };

  const saveSpotDeadline = (itemId: string, dueDate: string) => {
    if (!canRunLocalDailyMutation || !dueDate) {
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
    if (!canRunLocalDailyMutation) {
      return;
    }

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
    if (!canRunLocalDailyMutation) {
      return;
    }

    const initialDate = spotDeadlines[itemId] ?? getTomorrowDateKey();

    setSpotDeadlinePicker({
      itemId,
      temporaryDate: initialDate,
      visibleMonth: getMonthKey(parseDateKey(initialDate)),
    });
  };

  const selectSpotDeadlineDate = (dateKey: string) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

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
    if (!canRunLocalDailyMutation) {
      return;
    }

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
    if (!canRunLocalDailyMutation || !spotDeadlinePicker) {
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
    if (!canRunLocalDailyMutation) {
      return;
    }

    swipeStartXRef.current = clientX;
    setSwipingTodayOnlyItemId(itemId);
    setTodayOnlySwipeOffset(swipedTodayOnlyItemId === itemId ? 88 : 0);
  };

  const moveTemporaryItemSwipe = (itemId: string, clientX: number) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    const startX = swipeStartXRef.current;

    if (startX === null || swipingTodayOnlyItemId !== itemId) {
      return;
    }

    const baseOffset = swipedTodayOnlyItemId === itemId ? 88 : 0;
    const nextOffset = Math.min(88, Math.max(0, baseOffset + startX - clientX));
    setTodayOnlySwipeOffset(nextOffset);
  };

  const endTemporaryItemSwipe = (itemId: string) => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    const offset = todayOnlySwipeOffset;
    swipeStartXRef.current = null;
    setSwipingTodayOnlyItemId(null);
    setTodayOnlySwipeOffset(0);

    setSwipedTodayOnlyItemId(offset > 44 ? itemId : null);
  };

  const addTemporaryTodayOnlyItem = () => {
    if (!canRunLocalDailyMutation) {
      return;
    }

    const trimmedName = todayOnlyInputValue.trim();

    if (!trimmedName) {
      setIsTodayOnlyInputOpen(false);
      setTodayOnlyInputValue("");
      return;
    }

    const newItem = appRepository.createTodayOnlyTemporaryItem(
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
    if (!canRunLocalDailyMutation) {
      return;
    }

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

  const runSharedCompleteCheck = async () => {
    const currentSharedSession = getCurrentSharedDailySession();
    const currentSharedState = sharedDailyState;
    if (
      !canRunCompleteCheckMutation ||
      dataSource.mode !== "shared" ||
      !currentSharedSession ||
      currentSharedState?.status !== "success" ||
      currentSharedSession.isChecked ||
      currentSharedSession.checkedAt !== null ||
      currentSharedSession.isCompleted ||
      currentSharedSession.completedAt !== null ||
      !Number.isInteger(currentSharedSession.version) ||
      currentSharedSession.version < 1 ||
      currentSharedSession.version >= 2_147_483_647 ||
      pendingDailyItemMutationRequestsRef.current.size > 0 ||
      sharedSessionMutationRequestRef.current
    ) {
      return;
    }

    const requestScopeKey = dailyItemMutationScopeKeyRef.current;
    const requestScopeGeneration =
      dailyItemMutationScopeGenerationRef.current;
    const input = {
      familyId: currentSharedSession.familyId,
      childId: currentSharedSession.childId,
      sessionDate: currentSharedSession.sessionDate,
      expectedSessionVersion: currentSharedSession.version,
    };
    const request: SharedSessionMutationRequest = {
      operation: "complete_check",
      token: Symbol("complete-check"),
      scopeKey: requestScopeKey,
      generation: requestScopeGeneration,
      startVersion: currentSharedSession.version,
    };
    sharedSessionMutationRequestRef.current = request;
    setSharedSessionMutationPendingOperation("complete_check");
    setDailyItemMutationError(null);
    let rpcSucceeded = false;

    try {
      const browserClient =
        dailyMutationBrowserClientRef.current ?? createSupabaseClient();
      dailyMutationBrowserClientRef.current = browserClient;
      if (!dailyCheckClientRef.current) {
        dailyCheckClientRef.current = {
          rpc(functionName, args) {
            return browserClient.rpc(functionName, args);
          },
        };
      }
      if (!dailyPreparationItemsClientRef.current) {
        dailyPreparationItemsClientRef.current = {
          rpc(functionName, args) {
            return browserClient.rpc(functionName, args);
          },
        };
      }

      const result = await completeDailyCheck(dailyCheckClientRef.current, input);
      if (
        !dailyItemMutationMountedRef.current ||
        sharedSessionMutationRequestRef.current !== request ||
        dailyItemMutationScopeKeyRef.current !== request.scopeKey ||
        dailyItemMutationScopeGenerationRef.current !== request.generation
      ) {
        return;
      }
      if (result.status !== "success") {
        setDailyItemMutationError(
          getHomeDailyItemMutationErrorView(result, "complete_check"),
        );
        return;
      }
      if (
        result.session.dailySessionId.toLowerCase() !==
        currentSharedSession.dailySessionId.toLowerCase()
      ) {
        setDailyItemMutationError({
          title: "確認結果を確認できませんでした",
          body: "最新の状態を確認するため、再読み込みしてください。",
          canReload: true,
        });
        return;
      }
      rpcSucceeded = true;

      const loaded = await loadDailyData(dailyPreparationItemsClientRef.current, {
        familyId: input.familyId,
        childId: input.childId,
        sessionDate: input.sessionDate,
      });
      if (
        !dailyItemMutationMountedRef.current ||
        sharedSessionMutationRequestRef.current !== request ||
        dailyItemMutationScopeKeyRef.current !== request.scopeKey ||
        dailyItemMutationScopeGenerationRef.current !== request.generation
      ) {
        return;
      }

      const loadedSession = loaded.status === "success" ? loaded.session : null;
      const scope = {
        familyId: input.familyId,
        childId: input.childId,
        sessionDate: input.sessionDate,
        dailySessionId: currentSharedSession.dailySessionId,
        expectedSessionVersion: request.startVersion,
        responseSessionVersion: result.session.version,
        changed: result.changed,
        requestScopeKey: request.scopeKey,
        currentScopeKey: dailyItemMutationScopeKeyRef.current,
        requestScopeGeneration: request.generation,
        currentScopeGeneration: dailyItemMutationScopeGenerationRef.current,
      };
      const nextState = loadedSession
        ? applyCheckedSessionToSharedDailyState(
            currentSharedState,
            scope,
            loadedSession,
          )
        : currentSharedState;
      if (!loadedSession || nextState === currentSharedState) {
        setDailyItemMutationError({
          title: "確認結果を確認できませんでした",
          body: "最新の状態を確認するため、再読み込みしてください。",
          canReload: true,
        });
        return;
      }

      sharedCompleteCheckNavigationRequestRef.current = {
        scopeKey: request.scopeKey,
        generation: request.generation,
        dailySessionId: currentSharedSession.dailySessionId,
        responseVersion: result.session.version,
        appliedSession: loadedSession,
      };
      setSharedDailyState((current) =>
        current
          ? applyCheckedSessionToSharedDailyState(current, scope, loadedSession)
          : current,
      );
      setDailyItemMutationError(null);
    } catch {
      if (
        dailyItemMutationMountedRef.current &&
        sharedSessionMutationRequestRef.current === request &&
        dailyItemMutationScopeKeyRef.current === request.scopeKey &&
        dailyItemMutationScopeGenerationRef.current === request.generation
      ) {
        setDailyItemMutationError(
          rpcSucceeded
            ? {
                title: "確認結果を確認できませんでした",
                body: "最新の状態を確認するため、再読み込みしてください。",
                canReload: true,
              }
            : {
                title: "通信に失敗しました",
                body: "通信環境を確認して、もう一度操作してください。",
                canReload: false,
              },
        );
      }
    } finally {
      if (sharedSessionMutationRequestRef.current === request) {
        sharedSessionMutationRequestRef.current = null;
        if (dailyItemMutationMountedRef.current) {
          setSharedSessionMutationPendingOperation(null);
        }
      }
    }
  };

  const completeCheck = () => {
    if (dailyMode === "shared-success") {
      void runSharedCompleteCheck();
      return;
    }
    if (!canRunLocalCompleteCheck) {
      return;
    }

    const nextSession = appRepository.createPreparationSession(
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

  const togglePreparationItem = async (itemId: string) => {
    if (dailyMode === "local") {
      if (!canRunLocalDailyMutation || !session) {
        return;
      }

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
        thanksSent:
          allChecked && !hasCarryoverItems ? session.thanksSent : false,
      };

      updateSession(nextSession);
      return;
    }

    if (!canRunPreparationItemMutation) {
      return;
    }
    const currentSharedSession = getCurrentSharedDailySession();
    const preparationItem = session?.items.find((item) => item.id === itemId);
    if (
      !currentSharedSession ||
      !preparationItem?.dailyItemId ||
      preparationItem.dailyItemVersion === undefined
    ) {
      return;
    }
    const canonicalItem = currentSharedSession.items.find(
      (item) => item.dailyItemId === preparationItem.dailyItemId,
    );
    if (
      !canonicalItem ||
      canonicalItem.version !== preparationItem.dailyItemVersion
    ) {
      return;
    }

    const nextPrepared = !canonicalItem.isPrepared;
    if (isPreparedDailyItemMutationNoOp(canonicalItem, nextPrepared)) {
      return;
    }
    const input: UpdateDailyItemInput = {
      action: "set_prepared",
      familyId: currentSharedSession.familyId,
      childId: currentSharedSession.childId,
      sessionDate: currentSharedSession.sessionDate,
      dailySessionId: currentSharedSession.dailySessionId,
      dailyItemId: canonicalItem.dailyItemId,
      expectedVersion: canonicalItem.version,
      nextPrepared,
      currentIsPrepared: canonicalItem.isPrepared,
      currentIsDeferred: canonicalItem.isDeferred,
    };
    const inputError = validateUpdateDailyItemInput(input);
    if (inputError) {
      setDailyItemMutationError(
        getHomeDailyItemMutationErrorView(
          { status: "client_error", error: inputError },
          "prepared",
        ),
      );
      return;
    }

    await runSharedDailyItemMutation(input, "prepared");
  };

  const checkAllPreparationItems = () => {
    if (dailyMode === "shared-success") {
      void runSharedDailyPreparationItemsMutation();
      return;
    }
    if (dailyMode !== "local" || !canRunLocalDailyMutation || !session) {
      return;
    }

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

  const togglePreparationItemLater = async (itemId: string) => {
    if (dailyMode === "local") {
      if (!canRunLocalDailyMutation || !session) {
        return;
      }

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
        thanksSent:
          allDone && !hasCarryoverItems ? session.thanksSent : false,
      };

      updateSession(nextSession);
      return;
    }

    if (!canRunPreparationItemMutation) {
      return;
    }
    const currentSharedSession = getCurrentSharedDailySession();
    const preparationItem = session?.items.find((item) => item.id === itemId);
    if (
      !currentSharedSession ||
      !preparationItem?.dailyItemId ||
      preparationItem.dailyItemVersion === undefined
    ) {
      return;
    }
    const canonicalItem = currentSharedSession.items.find(
      (item) => item.dailyItemId === preparationItem.dailyItemId,
    );
    if (
      !canonicalItem ||
      canonicalItem.version !== preparationItem.dailyItemVersion
    ) {
      return;
    }

    const nextDeferred = !canonicalItem.isDeferred;
    if (isDeferredDailyItemMutationNoOp(canonicalItem, nextDeferred)) {
      return;
    }
    const input: UpdateDailyItemInput = {
      action: "set_deferred",
      familyId: currentSharedSession.familyId,
      childId: currentSharedSession.childId,
      sessionDate: currentSharedSession.sessionDate,
      dailySessionId: currentSharedSession.dailySessionId,
      dailyItemId: canonicalItem.dailyItemId,
      expectedVersion: canonicalItem.version,
      nextDeferred,
      currentIsPrepared: canonicalItem.isPrepared,
      currentIsDeferred: canonicalItem.isDeferred,
    };
    const inputError = validateUpdateDailyItemInput(input);
    if (inputError) {
      setDailyItemMutationError(
        getHomeDailyItemMutationErrorView(
          { status: "client_error", error: inputError },
          "deferred",
        ),
      );
      return;
    }

    await runSharedDailyItemMutation(input, "deferred");
  };

  const runSharedCompletePreparation = async () => {
    const currentSharedSession = getCurrentSharedDailySession();
    const currentPreparationSession = session;
    if (
      !currentSharedSession ||
      !currentPreparationSession ||
      currentPreparationSession.items.length === 0 ||
      currentPreparationSession.completedAt ||
      !currentPreparationSession.items.every(
        (item) => item.checked || item.later,
      ) ||
      !currentSharedSession.isChecked ||
      !currentSharedSession.checkedAt ||
      currentSharedSession.isCompleted ||
      !Number.isInteger(currentSharedSession.version) ||
      currentSharedSession.version < 1 ||
      pendingDailyItemMutationRequestsRef.current.size > 0 ||
      sharedSessionMutationRequestRef.current
    ) {
      return;
    }

    const requestScopeKey = dailyItemMutationScopeKeyRef.current;
    const requestScopeGeneration =
      dailyItemMutationScopeGenerationRef.current;
    const requestToken = Symbol("complete-preparation");
    const input = {
      familyId: currentSharedSession.familyId,
      childId: currentSharedSession.childId,
      sessionDate: currentSharedSession.sessionDate,
      expectedSessionVersion: currentSharedSession.version,
    };
    sharedSessionMutationRequestRef.current = {
      operation: "complete_preparation",
      token: requestToken,
      scopeKey: requestScopeKey,
      generation: requestScopeGeneration,
      startVersion: currentSharedSession.version,
    };
    setSharedSessionMutationPendingOperation("complete_preparation");
    setDailyItemMutationError(null);

    try {
      if (!dailyPreparationItemsClientRef.current) {
        const browserClient =
          dailyMutationBrowserClientRef.current ?? createSupabaseClient();
        dailyMutationBrowserClientRef.current = browserClient;
        dailyPreparationItemsClientRef.current = {
          rpc(functionName, args) {
            return browserClient.rpc(functionName, args);
          },
        };
      }
      const client = dailyPreparationItemsClientRef.current;
      const result = await completeDailyPreparation(client, input);
      if (
        !dailyItemMutationMountedRef.current ||
        dailyItemMutationScopeKeyRef.current !== requestScopeKey ||
        dailyItemMutationScopeGenerationRef.current !==
          requestScopeGeneration ||
        sharedSessionMutationRequestRef.current?.token !== requestToken
      ) {
        return;
      }
      if (result.status !== "success") {
        setDailyItemMutationError(
          getHomeDailyItemMutationErrorView(
            result,
            "complete_preparation",
          ),
        );
        return;
      }

      const loaded = await loadDailyData(client, {
        familyId: input.familyId,
        childId: input.childId,
        sessionDate: input.sessionDate,
      });
      if (
        !dailyItemMutationMountedRef.current ||
        dailyItemMutationScopeKeyRef.current !== requestScopeKey ||
        dailyItemMutationScopeGenerationRef.current !==
          requestScopeGeneration ||
        sharedSessionMutationRequestRef.current?.token !== requestToken
      ) {
        return;
      }
      if (
        loaded.status !== "success" ||
        loaded.session.dailySessionId.toLowerCase() !==
          currentSharedSession.dailySessionId.toLowerCase() ||
        loaded.session.dailySessionId.toLowerCase() !==
          result.session.dailySessionId.toLowerCase() ||
        loaded.session.version !== result.session.version ||
        !loaded.session.isChecked ||
        !loaded.session.checkedAt ||
        !loaded.session.isCompleted ||
        !loaded.session.completedAt
      ) {
        setDailyItemMutationError({
          title: "完了結果を確認できませんでした",
          body: "最新の状態を確認するため、再読み込みしてください。",
          canReload: true,
        });
        return;
      }

      setSharedDailyState((current) =>
        current
          ? applyCompletedSessionToSharedDailyState(
              current,
              {
                familyId: input.familyId,
                childId: input.childId,
                sessionDate: input.sessionDate,
                dailySessionId: currentSharedSession.dailySessionId,
                expectedSessionVersion: input.expectedSessionVersion,
                completedSessionVersion: result.session.version,
                changed: result.changed,
              },
              loaded.session,
            )
          : current,
      );
      setDailyItemMutationError(null);
    } catch {
      if (
        dailyItemMutationMountedRef.current &&
        dailyItemMutationScopeKeyRef.current === requestScopeKey &&
        dailyItemMutationScopeGenerationRef.current ===
          requestScopeGeneration &&
        sharedSessionMutationRequestRef.current?.token === requestToken
      ) {
        setDailyItemMutationError({
          title: "通信に失敗しました",
          body: "通信環境を確認して、もう一度操作してください。",
          canReload: false,
        });
      }
    } finally {
      if (sharedSessionMutationRequestRef.current?.token === requestToken) {
        sharedSessionMutationRequestRef.current = null;
        if (dailyItemMutationMountedRef.current) {
          setSharedSessionMutationPendingOperation(null);
        }
      }
    }
  };

  const completePreparation = () => {
    if (dailyMode === "shared-success") {
      void runSharedCompletePreparation();
      return;
    }

    if (!canRunLocalDailyMutation || !session) {
      return;
    }

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

        appRepository.saveCheckCounts(nextCounts);
        return nextCounts;
      });
    }

    if (durableItemsEditable && preparedStockItemIds.size > 0) {
      setRoughStates((current) => {
        const nextStates = { ...current };

        preparedStockItemIds.forEach((itemId) => {
          nextStates[itemId] = "十分";
        });

        appRepository.saveRoughStates(nextStates);
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

  const runSharedSendThanks = async () => {
    const currentSharedSession = getCurrentSharedDailySession();
    if (
      !canRunSendThanksMutation ||
      dataSource.mode !== "shared" ||
      !currentSharedSession ||
      !currentSharedSession.isCompleted ||
      !currentSharedSession.completedAt ||
      currentSharedSession.thanksSent ||
      !currentSharedSession.completedByMemberId ||
      isHomeSharedThanksSelf(
        dataSource.currentMemberId,
        currentSharedSession.completedByMemberId,
      ) ||
      !Number.isInteger(currentSharedSession.version) ||
      currentSharedSession.version < 1 ||
      pendingDailyItemMutationRequestsRef.current.size > 0 ||
      sharedSessionMutationRequestRef.current
    ) {
      return;
    }

    const requestScopeKey = dailyItemMutationScopeKeyRef.current;
    const requestScopeGeneration =
      dailyItemMutationScopeGenerationRef.current;
    const requestToken = Symbol("send-thanks");
    const input = {
      familyId: currentSharedSession.familyId,
      childId: currentSharedSession.childId,
      sessionDate: currentSharedSession.sessionDate,
      expectedSessionVersion: currentSharedSession.version,
    };
    const request: SharedSessionMutationRequest = {
      operation: "send_thanks",
      token: requestToken,
      scopeKey: requestScopeKey,
      generation: requestScopeGeneration,
      startVersion: currentSharedSession.version,
    };
    sharedSessionMutationRequestRef.current = request;
    setSharedSessionMutationPendingOperation("send_thanks");
    setDailyItemMutationError(null);
    let rpcSucceeded = false;

    try {
      const browserClient =
        dailyMutationBrowserClientRef.current ?? createSupabaseClient();
      dailyMutationBrowserClientRef.current = browserClient;
      if (!dailyThanksClientRef.current) {
        dailyThanksClientRef.current = {
          rpc(functionName, args) {
            return browserClient.rpc(functionName, args);
          },
        };
      }
      if (!dailyPreparationItemsClientRef.current) {
        dailyPreparationItemsClientRef.current = {
          rpc(functionName, args) {
            return browserClient.rpc(functionName, args);
          },
        };
      }

      const result = await sendDailyThanks(dailyThanksClientRef.current, input);
      if (
        !dailyItemMutationMountedRef.current ||
        sharedSessionMutationRequestRef.current !== request ||
        dailyItemMutationScopeKeyRef.current !== request.scopeKey ||
        dailyItemMutationScopeGenerationRef.current !== request.generation
      ) {
        return;
      }
      if (result.status !== "success") {
        setDailyItemMutationError(
          getHomeDailyItemMutationErrorView(result, "send_thanks"),
        );
        return;
      }
      rpcSucceeded = true;

      const loaded = await loadDailyData(dailyPreparationItemsClientRef.current, {
        familyId: input.familyId,
        childId: input.childId,
        sessionDate: input.sessionDate,
      });
      if (
        !dailyItemMutationMountedRef.current ||
        sharedSessionMutationRequestRef.current !== request ||
        dailyItemMutationScopeKeyRef.current !== request.scopeKey ||
        dailyItemMutationScopeGenerationRef.current !== request.generation
      ) {
        return;
      }

      const loadedSession = loaded.status === "success" ? loaded.session : null;
      const isValidReload =
        loadedSession !== null &&
        loadedSession.familyId.toLowerCase() === input.familyId.toLowerCase() &&
        loadedSession.childId.toLowerCase() === input.childId.toLowerCase() &&
        loadedSession.sessionDate === input.sessionDate &&
        loadedSession.dailySessionId.toLowerCase() ===
          currentSharedSession.dailySessionId.toLowerCase() &&
        loadedSession.dailySessionId.toLowerCase() ===
          result.session.dailySessionId.toLowerCase() &&
        loadedSession.version === result.session.version &&
        loadedSession.isChecked &&
        Boolean(loadedSession.checkedAt) &&
        Boolean(loadedSession.checkedByMemberId) &&
        Boolean(loadedSession.checkedByUserId) &&
        loadedSession.checkedByDisplayName !== null &&
        loadedSession.isCompleted &&
        Boolean(loadedSession.completedAt) &&
        Boolean(loadedSession.completedByMemberId) &&
        Boolean(loadedSession.completedByUserId) &&
        loadedSession.completedByDisplayName !== null &&
        loadedSession.thanksSent &&
        Boolean(loadedSession.thanksSentAt) &&
        Boolean(loadedSession.thanksSentByMemberId) &&
        Boolean(loadedSession.thanksSentByUserId) &&
        loadedSession.thanksSentByDisplayName !== null &&
        Boolean(loadedSession.thanksReceivedByMemberId) &&
        Boolean(loadedSession.thanksReceivedByUserId) &&
        loadedSession.thanksReceivedByDisplayName !== null &&
        loadedSession.completedByMemberId?.toLowerCase() ===
          loadedSession.thanksReceivedByMemberId?.toLowerCase() &&
        loadedSession.thanksSentByMemberId?.toLowerCase() !==
          loadedSession.thanksReceivedByMemberId?.toLowerCase() &&
        loadedSession.items.every(
          (item) =>
            item.familyId.toLowerCase() === loadedSession.familyId.toLowerCase() &&
            item.dailySessionId.toLowerCase() ===
              loadedSession.dailySessionId.toLowerCase(),
        ) &&
        new Set(
          loadedSession.items.map((item) => item.dailyItemId.toLowerCase()),
        ).size === loadedSession.items.length;
      if (!isValidReload || !loadedSession) {
        setDailyItemMutationError({
          title: "送信結果を確認できませんでした",
          body: "最新の状態を確認するため、再読み込みしてください。",
          canReload: true,
        });
        return;
      }

      setSharedDailyState((current) =>
        current
          ? applyThanksSessionToSharedDailyState(
              current,
              {
                familyId: input.familyId,
                childId: input.childId,
                sessionDate: input.sessionDate,
                dailySessionId: currentSharedSession.dailySessionId,
                expectedSessionVersion: request.startVersion,
                responseSessionVersion: result.session.version,
                changed: result.changed,
                requestScopeKey: request.scopeKey,
                currentScopeKey: dailyItemMutationScopeKeyRef.current,
                requestScopeGeneration: request.generation,
                currentScopeGeneration:
                  dailyItemMutationScopeGenerationRef.current,
              },
              loadedSession,
            )
          : current,
      );
      setDailyItemMutationError(null);
    } catch {
      if (
        dailyItemMutationMountedRef.current &&
        sharedSessionMutationRequestRef.current === request &&
        dailyItemMutationScopeKeyRef.current === request.scopeKey &&
        dailyItemMutationScopeGenerationRef.current === request.generation
      ) {
        setDailyItemMutationError(
          rpcSucceeded
            ? {
                title: "送信結果を確認できませんでした",
                body: "最新の状態を確認するため、再読み込みしてください。",
                canReload: true,
              }
            : {
                title: "通信に失敗しました",
                body: "通信環境を確認して、もう一度操作してください。",
                canReload: false,
              },
        );
      }
    } finally {
      if (sharedSessionMutationRequestRef.current === request) {
        sharedSessionMutationRequestRef.current = null;
        if (dailyItemMutationMountedRef.current) {
          setSharedSessionMutationPendingOperation(null);
        }
      }
    }
  };

  const sendThanks = () => {
    if (dailyMode === "shared-success") {
      void runSharedSendThanks();
      return;
    }
    if (!canRunLocalDailyMutation || !session) {
      return;
    }

    updateSession({
      ...session,
      thanksSent: !session.thanksSent,
    });
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
    if (!childProfileEditable) {
      return;
    }

    setActiveEditingSectionId(childSettingsSectionId);
    childNameEditor.startEdit();
  };

  const completeChildNameEdit = async () => {
    if (!childProfileEditable) {
      return;
    }

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

  const addCustomItem = async (
    category: CustomItemCategory,
    draft: CustomItemDraft,
  ) => {
    if (!canAddHomeDurableItem(dataSource, category)) {
      return false;
    }

    if (customItemAddInFlightRef.current) {
      return false;
    }

    setCustomItemAddError(null);
    const trimmedName = draft.name.trim();

    if (!trimmedName) {
      return false;
    }

    const parsedCount = draft.count === "" ? 0 : Number(draft.count);
    const count = Number.isNaN(parsedCount) ? 0 : parsedCount;
    const unit =
      category === "ざっくり管理"
        ? draft.unit
        : category === "スポット追加"
          ? "個"
          : "枚";

    customItemAddInFlightRef.current = true;
    setIsAddingCustomItem(true);

    try {
      const result = await saveHomeCustomItemAdd(
        dataSource,
        customItems,
        roughStatesRef.current,
        {
          name: trimmedName,
          count,
          unit,
          category,
          weekdays: category === "スポット追加" ? draft.weekdays : [],
        },
        "十分",
        {
          createLocalItemId: () => `custom-${Date.now()}`,
          saveLocalCustomItems: appRepository.saveCustomItems,
          saveLocalRoughStates: appRepository.saveRoughStates,
          saveSharedItemTemplateAdd: (input) =>
            saveSharedItemTemplateAdd(
              createSupabaseClient() as unknown as SharedItemTemplateAddClient,
              input,
            ),
        },
      );

      setCustomItems((currentItems) =>
        appendHomeCustomItemToCategory(currentItems, result.item),
      );
      if (dataSource.mode === "local" && category === "持ち物") {
        setShortageCounts((current) => {
          const nextCounts = { ...current, [result.item.id]: 0 };
          appRepository.saveCheckCounts(nextCounts);
          return nextCounts;
        });
      }

      if (result.initialRoughState !== null) {
        roughStatesRef.current = applyHomeRoughStateChange(
          roughStatesRef.current,
          result.item.id,
          result.initialRoughState,
        );
        setRoughStates((currentStates) =>
          applyHomeRoughStateChange(
            currentStates,
            result.item.id,
            result.initialRoughState,
          ),
        );
      }

      return true;
    } catch (error) {
      console.error("Failed to add custom item", error);
      setCustomItemAddError("保存できませんでした。もう一度お試しください");
      return false;
    } finally {
      customItemAddInFlightRef.current = false;
      setIsAddingCustomItem(false);
    }
  };

  const applyCustomItemDeletion = (
    itemId: string,
    saveLocalDailyCleanup: boolean,
  ) => {
    setCustomItems((current) => current.filter((item) => item.id !== itemId));
    setRoughStates((current) => {
      const nextStates = { ...current };
      delete nextStates[itemId];
      roughStatesRef.current = nextStates;
      if (saveLocalDailyCleanup) {
        appRepository.saveRoughStates(nextStates);
      }
      return nextStates;
    });

    if (saveLocalDailyCleanup) {
      setSelectedTodayOnlyIds((current) =>
        current.filter((selectedId) => selectedId !== itemId),
      );
      setShortageCounts((current) => {
        const nextCounts = { ...current };
        delete nextCounts[itemId];
        appRepository.saveCheckCounts(nextCounts);
        return nextCounts;
      });
      setSpotAdditions((current) => {
        const nextAdditions = current.filter(
          (addition) => addition.itemId !== itemId,
        );
        appRepository.saveSpotAdditions(nextAdditions);
        return nextAdditions;
      });
      setLocalSession((current) => {
        if (!current) {
          return current;
        }

        const nextSession = {
          ...current,
          items: current.items.filter((item) => item.id !== itemId),
        };
        appRepository.savePreparationSession(nextSession);
        return nextSession;
      });
      setSpotDeadlines((current) => {
        const nextDeadlines = { ...current };
        delete nextDeadlines[itemId];
        appRepository.saveSpotDeadlines(nextDeadlines);
        return nextDeadlines;
      });
      setSpotDeadlinePicker((current) =>
        current?.itemId === itemId ? null : current,
      );
    }
    setExpandedWeekdayItemId((current) =>
      current === itemId ? null : current,
    );

    if (editingCustomItemId === itemId) {
      cancelCustomItemEditing();
    }

    setCustomItemDeleteError((current) =>
      current?.itemId === itemId ? null : current,
    );
  };

  const deleteCustomItem = async (itemId: string) => {
    if (!durableItemsDeletable) {
      return;
    }

    if (customItemDeleteInFlightItemIdsRef.current.has(itemId)) {
      return;
    }

    customItemDeleteInFlightItemIdsRef.current.add(itemId);
    setCustomItemDeletingItemIds((current) => {
      const next = new Set(current);
      next.add(itemId);
      return next;
    });
    setCustomItemDeleteError((current) =>
      current?.itemId === itemId ? null : current,
    );

    try {
      const saveResult = saveHomeCustomItemDelete(
        dataSource,
        itemId,
        customItems.filter((item) => item.id !== itemId),
        {
          saveLocalCustomItems: appRepository.saveCustomItems,
          saveSharedItemTemplateDelete: (input) =>
            saveSharedItemTemplateDelete(createSupabaseClient(), input),
        },
      );

      if (saveResult) {
        await saveResult;
      }

      applyCustomItemDeletion(itemId, dataSource.mode === "local");
    } catch (error) {
      console.error("Failed to delete custom item", error);
      setCustomItemDeleteError({
        itemId,
        message: "保存できませんでした。もう一度お試しください",
      });
    } finally {
      customItemDeleteInFlightItemIdsRef.current.delete(itemId);
      setCustomItemDeletingItemIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  };

  const requestCustomItemDelete = (itemId: string) => {
    if (customItemDeleteInFlightItemIdsRef.current.has(itemId)) {
      return;
    }

    if (dataSource.mode === "shared") {
      setCustomItemDeleteConfirmItemId(itemId);
      return;
    }

    void deleteCustomItem(itemId);
  };

  const confirmCustomItemDelete = () => {
    const itemId = customItemDeleteConfirmItemId;
    if (!itemId || customItemDeleteInFlightItemIdsRef.current.has(itemId)) {
      return;
    }

    setCustomItemDeleteConfirmItemId(null);
    void deleteCustomItem(itemId);
  };

  const toggleNewCustomItemWeekday = (weekday: number) => {
    if (!newItemWeekdaysSelectable) {
      return;
    }

    setCustomItemAddError(null);
    setNewCustomItemDraft((current) => {
      const nextWeekdays = current.weekdays.includes(weekday)
        ? current.weekdays.filter((day) => day !== weekday)
        : current.weekdays.length >= 7
          ? current.weekdays
        : [...current.weekdays, weekday].sort((a, b) => a - b);

      return {
        ...current,
        weekdays: nextWeekdays,
      };
    });
  };

  const toggleDraftWeekday = (
    draft: CustomItemDraft,
    weekday: number,
  ): CustomItemDraft => {
    if (!itemWeekdaysEditable) {
      return draft;
    }

    const nextWeekdays = draft.weekdays.includes(weekday)
      ? draft.weekdays.filter((day) => day !== weekday)
      : draft.weekdays.length >= 7
        ? draft.weekdays
        : [...draft.weekdays, weekday].sort((a, b) => a - b);

    return {
      ...draft,
      weekdays: nextWeekdays,
    };
  };

  const formatItemSettingsWeekdays = (weekdays: number[] = []) =>
    itemSettingsWeekdayOptions
      .filter((weekday) => weekdays.includes(weekday.value))
      .map((weekday) => weekday.label)
      .join("・");

  const getCustomItemDraft = (item: CustomizableItem): CustomItemDraft => ({
    name: item.name,
    count: String(item.count),
    unit: item.unit,
    weekdays: item.weekdays ?? [],
  });

  const startCustomItemEditing = (item: CustomizableItem) => {
    if (!existingItemDetailsEditable || !canInterruptCustomItemSorting()) {
      return;
    }

    setAddingCategory(null);
    setCustomItemAddError(null);
    setSortingCategory(null);
    setExpandedWeekdayItemId(null);
    setCustomItemEditError(null);
    setEditingCustomItemId(item.id);
    setCustomItemEditDraft(getCustomItemDraft(item));
  };

  const cancelCustomItemEditing = () => {
    setEditingCustomItemId(null);
    setExpandedWeekdayItemId(null);
    setCustomItemEditError(null);
    setCustomItemEditDraft({
      name: "",
      count: "1",
      unit: "",
      weekdays: [],
    });
  };

  const saveCustomItemEditing = async (item: CustomizableItem) => {
    if (!existingItemDetailsEditable) {
      return;
    }

    if (customItemSaveInFlightRef.current) {
      return;
    }

    const trimmedName = customItemEditDraft.name.trim();

    if (!trimmedName) {
      setCustomItemEditError("名前を入力してください");
      return;
    }

    const parsedCount =
      customItemEditDraft.count === "" ? 0 : Number(customItemEditDraft.count);
    const nextCount = Number.isNaN(parsedCount) ? 0 : parsedCount;
    const nextChanges: Partial<Omit<CustomizableItem, "id">> = {
      name: trimmedName,
      count: nextCount,
      unit:
        item.category === "ざっくり管理" && roughItemUnitEditable
          ? customItemEditDraft.unit
          : item.unit,
      weekdays:
        item.category === "スポット追加" && itemWeekdaysEditable
          ? customItemEditDraft.weekdays
          : (item.weekdays ?? []),
    };
    const nextItems = customItems.map((customItem) =>
      customItem.id === item.id ? { ...customItem, ...nextChanges } : customItem,
    );
    const sharedChanges = {
      name: trimmedName,
      count: nextCount,
      ...(item.category === "ざっくり管理" && roughItemUnitEditable
        ? { unit: customItemEditDraft.unit }
        : {}),
      ...(item.category === defaultCustomItems[6].category && itemWeekdaysEditable
        ? { weekdays: customItemEditDraft.weekdays }
        : {}),
    };

    customItemSaveInFlightRef.current = true;
    setSavingCustomItemId(item.id);
    setCustomItemEditError(null);

    try {
      await saveHomeCustomItemEdit(dataSource, item.id, nextItems, sharedChanges, {
        applyCustomItems: setCustomItems,
        saveLocalCustomItems: appRepository.saveCustomItems,
        saveSharedItemTemplateEdit: (input) =>
          saveSharedItemTemplateEdit(createSupabaseClient(), input),
      });

      if (nextCount === 0 && item.count !== 0) {
        showZeroQuantityToast();
      }

      cancelCustomItemEditing();
    } catch (error) {
      console.error("Failed to save custom item", error);
      setCustomItemEditError("保存できませんでした。もう一度お試しください");
    } finally {
      customItemSaveInFlightRef.current = false;
      setSavingCustomItemId(null);
    }
  };

  const reorderDraftCustomItemsInCategory = (
    category: CustomItemCategory,
    activeItemId: string,
    targetIndex: number,
  ) => {
    if (!durableItemsSortable || customItemSortOrderSaveInFlightRef.current) {
      return;
    }

    setSortingDraftItems((currentItems) => {
      const sourceItems = currentItems ?? customItems;
      const nextItems = reorderHomeCustomItemsInCategory(
        sourceItems,
        category,
        activeItemId,
        targetIndex,
      );

      return nextItems === sourceItems ? currentItems : nextItems;
    });
  };

  const moveCustomItemByPointer = (
    category: CustomItemCategory,
    activeItemId: string,
    pointerId: number,
    clientY: number,
  ) => {
    const dragTarget = activeCustomItemDragTargetRef.current;

    if (
      !dragTarget ||
      dragTarget.itemId !== activeItemId ||
      dragTarget.category !== category ||
      dragTarget.pointerId !== pointerId
    ) {
      return;
    }

    const rowElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-custom-item-category="${category}"][data-custom-item-id]`,
      ),
    ).filter(
      (element) => element.dataset.customItemId !== activeItemId,
    );
    const dragCenterY = getHomeCustomItemDragCenterY({
      pointerY: clientY,
      pointerOffsetY: dragTarget.pointerOffsetY,
      rowHeight: dragTarget.rowHeight,
    });
    const targetIndex = getHomeCustomItemDragTargetIndex({
      pointerY: dragCenterY,
      rowRects: rowElements.map((element) => element.getBoundingClientRect()),
      currentTargetIndex: dragTarget.targetIndex,
      lastMoveDirection: dragTarget.lastMoveDirection,
    });

    if (targetIndex === dragTarget.targetIndex) {
      return;
    }

    dragTarget.lastMoveDirection =
      targetIndex > dragTarget.targetIndex ? "down" : "up";
    dragTarget.targetIndex = targetIndex;
    reorderDraftCustomItemsInCategory(category, activeItemId, targetIndex);
  };

  const scheduleCustomItemDragFrame = () => {
    if (customItemDragFrameRef.current !== null) {
      return;
    }

    customItemDragFrameRef.current = window.requestAnimationFrame(() => {
      customItemDragFrameRef.current = null;

      if (
        !durableItemsSortable ||
        customItemSortOrderSaveInFlightRef.current
      ) {
        return;
      }

      const dragTarget = activeCustomItemDragTargetRef.current;

      if (!dragTarget) {
        return;
      }

      const clientY = dragTarget.latestClientY;

      setCustomItemDragState((current) =>
        current &&
        current.itemId === dragTarget.itemId &&
        current.pointerId === dragTarget.pointerId
          ? { ...current, currentY: clientY }
          : current,
      );
      moveCustomItemByPointer(
        dragTarget.category,
        dragTarget.itemId,
        dragTarget.pointerId,
        clientY,
      );
    });
  };

  const clearPendingCustomItemDrag = () => {
    if (customItemDragStartTimeoutRef.current !== null) {
      window.clearTimeout(customItemDragStartTimeoutRef.current);
      customItemDragStartTimeoutRef.current = null;
    }

    pendingCustomItemDragRef.current = null;
  };

  const beginCustomItemDrag = () => {
    const pendingDrag = pendingCustomItemDragRef.current;

    if (!pendingDrag || sortingCategory !== pendingDrag.category) {
      return;
    }

    const sourceItems = sortingDraftItems ?? customItems;
    const activeIndex = sourceItems
      .filter((item) => item.category === pendingDrag.category)
      .findIndex((item) => item.id === pendingDrag.itemId);

    if (activeIndex === -1) {
      return;
    }

    const rect = pendingDrag.element.getBoundingClientRect();
    setDraggingCustomItemId(pendingDrag.itemId);
    setCustomItemDragState({
      itemId: pendingDrag.itemId,
      pointerId: pendingDrag.pointerId,
      offsetY: pendingDrag.clientY - rect.top,
      currentY: pendingDrag.clientY,
      left: rect.left,
      width: rect.width,
    });
    activeCustomItemDragTargetRef.current = {
      itemId: pendingDrag.itemId,
      category: pendingDrag.category,
      pointerId: pendingDrag.pointerId,
      targetIndex: activeIndex,
      lastMoveDirection: null,
      latestClientY: pendingDrag.clientY,
      pointerOffsetY: pendingDrag.clientY - rect.top,
      rowHeight: rect.height,
    };
    customItemDragStartTimeoutRef.current = null;
  };

  const scheduleCustomItemDrag = (
    event: PointerEvent<HTMLElement>,
    item: CustomizableItem,
    isSorting: boolean,
  ) => {
    if (!durableItemsSortable || customItemSortOrderSaveInFlightRef.current) {
      return;
    }

    if (!isSorting || sortingCategory !== item.category) {
      return;
    }

    clearPendingCustomItemDrag();
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingCustomItemDragRef.current = {
      itemId: item.id,
      category: item.category,
      pointerId: event.pointerId,
      clientY: event.clientY,
      element: event.currentTarget,
    };
    customItemDragStartTimeoutRef.current = window.setTimeout(
      beginCustomItemDrag,
      event.pointerType === "mouse" ? 120 : 220,
    );
  };

  const updateCustomItemDrag = (
    event: PointerEvent<HTMLElement>,
    item: CustomizableItem,
  ) => {
    if (!durableItemsSortable || customItemSortOrderSaveInFlightRef.current) {
      return;
    }

    const pendingDrag = pendingCustomItemDragRef.current;

    if (pendingDrag?.itemId === item.id) {
      const distance = Math.abs(event.clientY - pendingDrag.clientY);

      if (distance > 8 && customItemDragStartTimeoutRef.current !== null) {
        beginCustomItemDrag();
      }
    }

    const dragTarget = activeCustomItemDragTargetRef.current;

    if (
      !dragTarget ||
      !canUpdateHomeCustomItemDragPointer({
        activeCategory: dragTarget.category,
        activePointerId: dragTarget.pointerId,
        eventCategory: item.category,
        eventPointerId: event.pointerId,
      })
    ) {
      return;
    }

    dragTarget.latestClientY = event.clientY;
    scheduleCustomItemDragFrame();
  };

  const finishCustomItemDrag = (event?: PointerEvent<HTMLElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    cancelCustomItemDragFrame();
    clearPendingCustomItemDrag();
    activeCustomItemDragTargetRef.current = null;
    setDraggingCustomItemId(null);
    setCustomItemDragState(null);
  };

  const startCustomItemSorting = (category: CustomItemCategory) => {
    if (!durableItemsSortable || !canInterruptCustomItemSorting()) {
      return;
    }

    setAddingCategory(null);
    setCustomItemAddError(null);
    setCustomItemSortOrderError(null);
    cancelCustomItemEditing();
    setSortingCategory(category);
    setSortingDraftItems(customItems);
    cancelCustomItemDragFrame();
    activeCustomItemDragTargetRef.current = null;
    setDraggingCustomItemId(null);
    setCustomItemDragState(null);
  };

  const finishCustomItemSorting = async () => {
    if (!durableItemsSortable || customItemSortOrderSaveInFlightRef.current) {
      return;
    }

    finishCustomItemDrag();

    const nextItems = sortingDraftItems;

    if (!nextItems) {
      setSortingCategory(null);
      setSortingDraftItems(null);
      setDraggingCustomItemId(null);
      setCustomItemDragState(null);
      return;
    }

    customItemSortOrderSaveInFlightRef.current = true;
    setIsSavingCustomItemSortOrder(true);
    setCustomItemSortOrderError(null);

    try {
      await saveHomeCustomItemSortOrder(dataSource, nextItems, {
        applyCustomItems: setCustomItems,
        saveLocalCustomItems: appRepository.saveCustomItems,
        saveSharedItemTemplateSortOrders: (input) =>
          saveSharedItemTemplateSortOrders(
            createSupabaseClient() as unknown as SharedItemTemplateSortOrderClient,
            input,
          ),
      });

      setSortingCategory(null);
      setSortingDraftItems(null);
      setDraggingCustomItemId(null);
      setCustomItemDragState(null);
    } catch (error) {
      console.error("Failed to save custom item sort order", error);
      setCustomItemSortOrderError("保存できませんでした。もう一度お試しください");
    } finally {
      customItemSortOrderSaveInFlightRef.current = false;
      setIsSavingCustomItemSortOrder(false);
    }
  };

  const startCustomItemAdding = (category: CustomItemCategory) => {
    if (
      !canAddHomeDurableItem(dataSource, category) ||
      !canInterruptCustomItemSorting()
    ) {
      return;
    }

    if (customItemAddInFlightRef.current) {
      return;
    }

    setCustomItemAddError(null);
    setCustomItemSortOrderError(null);
    setSortingCategory(null);
    cancelCustomItemEditing();
    setAddingCategory(category);
    setExpandedWeekdayItemId(null);
    setNewCustomItemDraft({
      name: "",
      count: "1",
      unit: "",
      weekdays: [],
    });
  };

  const finishCustomItemAdding = async (category: CustomItemCategory) => {
    if (!canAddHomeDurableItem(dataSource, category)) {
      return;
    }

    const added = await addCustomItem(category, newCustomItemDraft);

    if (!added) {
      return;
    }

    setAddingCategory(null);
    setCustomItemAddError(null);
    setNewCustomItemDraft({
      name: "",
      count: "1",
      unit: "",
      weekdays: [],
    });
    setExpandedWeekdayItemId(null);
  };

  const cancelCustomItemAdding = () => {
    setAddingCategory(null);
    setCustomItemAddError(null);
    setNewCustomItemDraft({
      name: "",
      count: "1",
      unit: "",
      weekdays: [],
    });
    setExpandedWeekdayItemId(null);
  };

  const closeItemSettings = () => {
    if (!canInterruptCustomItemSorting()) {
      return;
    }

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
    setCustomItemAddError(null);
    setCustomItemSortOrderError(null);
    setSortingCategory(null);
    setSortingDraftItems(null);
    setAddingCategory(null);
    setExpandedWeekdayItemId(null);
    finishCustomItemDrag();
    cancelCustomItemEditing();
  };

  const toggleChildSettings = () => {
    if (!canInterruptCustomItemSorting()) {
      return;
    }

    if (isChildSettingsOpen) {
      requestCloseChildSettings();
      return;
    }

    setIsChildSettingsOpen(true);
    setIsItemSettingsOpen(false);
    setSelectedItemSettingsCategory(null);
    setCustomItemAddError(null);
    setCustomItemSortOrderError(null);
    setSortingCategory(null);
    setSortingDraftItems(null);
    setAddingCategory(null);
    setExpandedWeekdayItemId(null);
    finishCustomItemDrag();
    cancelCustomItemEditing();
    childNameEditor.discardChanges();
    setActiveEditingSectionId(null);
  };

  const closeCustomItemEdit = () => {
    if (!canInterruptCustomItemSorting()) {
      return;
    }

    setSelectedItemSettingsCategory(null);
    setCustomItemAddError(null);
    setCustomItemSortOrderError(null);
    setSortingCategory(null);
    setSortingDraftItems(null);
    setAddingCategory(null);
    setExpandedWeekdayItemId(null);
    finishCustomItemDrag();
    cancelCustomItemEditing();
  };

  const customItemRowColumns = (
    category: CustomItemCategory,
    mode: "view" | "edit" | "add" | "sort",
  ) => {
    if (category === "スポット追加") {
      if (mode === "edit" || mode === "add") {
        return "grid-cols-[minmax(80px,1fr)_40px_64px_36px_36px]";
      }

      if (mode === "sort") {
        return "grid-cols-[minmax(72px,1fr)_40px_minmax(72px,88px)_36px]";
      }

      return "grid-cols-[minmax(72px,1fr)_40px_minmax(72px,88px)_36px]";
    }

    if (category === "ざっくり管理") {
      if (mode === "edit" || mode === "add") {
        return "grid-cols-[minmax(80px,1fr)_40px_56px_36px_36px]";
      }

      if (mode === "sort") {
        return "grid-cols-[minmax(80px,1fr)_40px_56px_36px]";
      }

      return "grid-cols-[minmax(80px,1fr)_40px_56px_36px]";
    }

    if (mode === "edit" || mode === "add") {
      return "grid-cols-[minmax(80px,1fr)_44px_36px_36px]";
    }

    if (mode === "sort") {
      return "grid-cols-[minmax(80px,1fr)_44px_36px]";
    }

    return "grid-cols-[minmax(80px,1fr)_44px_36px]";
  };

  const renderFlatActionButton = ({
    label,
    children,
    onClick,
    tone = "default",
    disabled = false,
  }: {
    label: string;
    children: ReactNode;
    onClick: () => void;
    tone?: "default" | "primary" | "danger";
    disabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) {
          return;
        }

        onClick();
      }}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-button text-number font-normal transition active:scale-95 disabled:text-text-tertiary disabled:shadow-none disabled:ring-border-soft ${
        tone === "primary"
          ? "bg-primary text-surface shadow-button"
          : tone === "danger"
            ? "bg-surface text-danger ring-1 ring-danger/20"
            : "bg-surface text-icon-today ring-1 ring-border-soft"
      }`}
    >
      {children}
    </button>
  );

  const renderWeekdayPicker = ({
    selectedWeekdays,
    onToggle,
    placement = "center",
  }: {
    selectedWeekdays: number[];
    onToggle: (weekday: number) => void;
    placement?: "center" | "add-row";
  }) => {
    const pickerPositionClass =
      placement === "add-row"
        ? "right-[-2.75rem] w-[min(17.5rem,calc(100vw-2rem))]"
        : "left-1/2 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2";

    return (
      <div
        className={`absolute top-11 z-30 rounded-section bg-surface p-1.5 shadow-floating ring-1 ring-danger/20 sm:p-2 ${pickerPositionClass}`}
      >
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {itemSettingsWeekdayOptions.map((weekday) => {
            const isSelected = selectedWeekdays.includes(weekday.value);

            return (
              <button
                key={weekday.value}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(weekday.value);
                }}
                className={`grid h-10 min-w-0 place-items-center rounded-button text-caption font-normal ring-1 transition active:scale-95 ${
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
  };

  const renderWeekdayField = ({
    id,
    weekdays,
    placeholder,
    onToggle,
    pickerPlacement,
  }: {
    id: string;
    weekdays: number[];
    placeholder: string;
    onToggle: (weekday: number) => void;
    pickerPlacement?: "center" | "add-row";
  }) => {
    const label = formatItemSettingsWeekdays(weekdays);
    const isOpen = expandedWeekdayItemId === id;

    return (
      <div className="relative">
        <button
          type="button"
          aria-label="曜日を設定"
          onClick={(event) => {
            event.stopPropagation();
            setExpandedWeekdayItemId((current) => (current === id ? null : id));
          }}
          className={`h-9 w-16 overflow-hidden rounded-button px-1 text-caption font-normal transition active:scale-95 ${
            isOpen || label
              ? "bg-card-today text-danger ring-1 ring-danger/30"
              : "bg-surface text-text-tertiary ring-1 ring-border-soft"
          }`}
        >
          <span
            className={`block truncate whitespace-nowrap text-center ${
              label.length >= 6 ? "text-[10px]" : ""
            }`}
          >
            {label || placeholder}
          </span>
        </button>
        {isOpen
          ? renderWeekdayPicker({
              selectedWeekdays: weekdays,
              onToggle,
              placement: pickerPlacement,
            })
          : null}
      </div>
    );
  };

  const renderFlatTextInput = ({
    value,
    placeholder,
    onChange,
    inputMode,
    className = "",
  }: {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    inputMode?: "numeric";
    className?: string;
  }) => (
    <input
      type={inputMode === "numeric" ? "number" : "text"}
      inputMode={inputMode}
      min={inputMode === "numeric" ? 0 : undefined}
      max={inputMode === "numeric" ? homeItemQuantityMax : undefined}
      step={inputMode === "numeric" ? 1 : undefined}
      value={value}
      placeholder={placeholder}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 min-w-0 rounded-button bg-surface px-2 text-number font-normal text-hoiku-ink outline-none ring-1 ring-[#edf3ef] focus:ring-hoiku-green ${className}`}
    />
  );

  const renderCustomItemAddRow = (category: CustomItemCategory) => {
    const isSpotCategory = category === "スポット追加";
    const isRoughCategory = category === "ざっくり管理";

    return (
      <div
        className={`grid h-14 items-center gap-[6px] border-b border-[#edf3ef] bg-card-today/50 px-0 ${customItemRowColumns(
          category,
          "add",
        )}`}
      >
        {renderFlatTextInput({
          value: newCustomItemDraft.name,
          placeholder: "持ち物名",
          onChange: (name) => {
            setCustomItemAddError(null);
            setNewCustomItemDraft((current) => ({ ...current, name }));
          },
          className: "min-w-[80px]",
        })}
        {renderFlatTextInput({
          value: newCustomItemDraft.count,
          placeholder: "数量",
          inputMode: "numeric",
          onChange: (count) => {
            if (!/^\d*$/.test(count)) {
              return;
            }

            setCustomItemAddError(null);
            setNewCustomItemDraft((current) => ({ ...current, count }));
          },
          className: "px-1 text-center",
        })}
        {isSpotCategory
          ? renderWeekdayField({
              id: "__new__",
              weekdays: newCustomItemDraft.weekdays,
              placeholder: "曜日",
              onToggle: toggleNewCustomItemWeekday,
              pickerPlacement: "add-row",
            })
          : null}
        {isRoughCategory
          ? renderFlatTextInput({
              value: newCustomItemDraft.unit,
              placeholder: "単位",
              onChange: (unit) => {
                setCustomItemAddError(null);
                setNewCustomItemDraft((current) => ({ ...current, unit }));
              },
              className: "px-1 text-center",
            })
          : null}
        {renderFlatActionButton({
          label: "追加",
          onClick: () => finishCustomItemAdding(category),
          tone: "primary",
          disabled: isAddingCustomItem,
          children: "＋",
        })}
        {renderFlatActionButton({
          label: "キャンセル",
          onClick: cancelCustomItemAdding,
          disabled: isAddingCustomItem,
          children: <X size={17} strokeWidth={2.4} />,
        })}
      </div>
    );
  };

  const renderCustomItemEditRow = (customItem: CustomizableItem) => {
    const isSpotItem = customItem.category === "スポット追加";
    const isRoughItem = customItem.category === "ざっくり管理";
    const isSaving = savingCustomItemId === customItem.id;

    return (
      <div key={customItem.id} className="contents">
        <div
          data-custom-item-id={customItem.id}
          data-custom-item-category={customItem.category}
          className={`grid h-14 items-center gap-[6px] border-b border-[#edf3ef] bg-card-today/60 px-0 ${customItemRowColumns(
            customItem.category,
            "edit",
          )}`}
        >
          {renderFlatTextInput({
            value: customItemEditDraft.name,
            placeholder: "持ち物名",
            onChange: (name) => {
              setCustomItemEditError(null);
              setCustomItemEditDraft((current) => ({ ...current, name }));
            },
            className: "min-w-[80px]",
          })}
          {renderFlatTextInput({
            value: customItemEditDraft.count,
            placeholder: "数量",
            inputMode: "numeric",
            onChange: (count) => {
              if (!/^\d*$/.test(count)) {
                return;
              }

              setCustomItemEditError(null);
              setCustomItemEditDraft((current) => ({ ...current, count }));
            },
            className: "px-1 text-center",
          })}
          {isSpotItem ? (
            itemWeekdaysEditable ? (
              renderWeekdayField({
                id: customItem.id,
                weekdays: customItemEditDraft.weekdays,
                placeholder: "曜日",
                onToggle: (weekday) =>
                  setCustomItemEditDraft((current) =>
                    toggleDraftWeekday(current, weekday),
                  ),
              })
            ) : (
              <span className="whitespace-nowrap text-center text-caption font-normal text-text-secondary">
                {formatItemSettingsWeekdays(customItem.weekdays ?? [])}
              </span>
            )
          ) : null}
          {isRoughItem ? (
            roughItemUnitEditable ? (
              renderFlatTextInput({
                value: customItemEditDraft.unit,
                placeholder: "単位",
                onChange: (unit) => {
                  setCustomItemEditError(null);
                  setCustomItemEditDraft((current) => ({ ...current, unit }));
                },
                className: "px-1 text-center",
              })
            ) : (
              <span className="min-w-0 text-center text-text-secondary">
                <HomeItemUnitText unit={customItem.unit} />
              </span>
            )
          ) : null}
          {renderFlatActionButton({
            label: "保存",
            onClick: () => saveCustomItemEditing(customItem),
            tone: "primary",
            disabled: isSaving,
            children: "✓",
          })}
          {renderFlatActionButton({
            label: "キャンセル",
            onClick: cancelCustomItemEditing,
            disabled: isSaving,
            children: <X size={17} strokeWidth={2.4} />,
          })}
        </div>
        {customItemEditError ? (
          <p className="px-1 py-2 text-status font-normal text-danger">
            {customItemEditError}
          </p>
        ) : null}
      </div>
    );
  };

  const renderCustomItemRow = (
    customItem: CustomizableItem,
    isSorting: boolean,
  ) => {
    const isSpotItem = customItem.category === "スポット追加";
    const isRoughItem = customItem.category === "ざっくり管理";
    const isEditing = editingCustomItemId === customItem.id;
    const isDragging = draggingCustomItemId === customItem.id;
    const isDeleting = customItemDeletingItemIds.has(customItem.id);
    const canInteract =
      existingItemDetailsEditable && !isSorting && !isDeleting;

    if (isEditing && !isSorting) {
      return renderCustomItemEditRow(customItem);
    }

    return (
      <div key={customItem.id} className="contents">
        <div
          data-custom-item-id={customItem.id}
          data-custom-item-category={customItem.category}
          role={canInteract ? "button" : undefined}
          tabIndex={canInteract ? 0 : undefined}
          onClick={() => {
            if (canInteract) {
              startCustomItemEditing(customItem);
            }
          }}
          onKeyDown={(event) => {
            if (canInteract && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              startCustomItemEditing(customItem);
            }
          }}
          onPointerDown={(event) =>
            scheduleCustomItemDrag(event, customItem, isSorting)
          }
          onPointerMove={(event) => updateCustomItemDrag(event, customItem)}
          onPointerUp={finishCustomItemDrag}
          onPointerCancel={finishCustomItemDrag}
          className={`grid h-14 items-center gap-[6px] border-b border-[#edf3ef] px-0 text-number font-normal transition-[transform,background-color,box-shadow] duration-200 ease-out will-change-transform ${customItemRowColumns(
            customItem.category,
            isSorting ? "sort" : "view",
          )} ${
            isSorting
              ? "touch-none cursor-grab active:cursor-grabbing"
              : canInteract
                ? "cursor-pointer"
                : "cursor-default"
          } ${
            isDragging
              ? "bg-card-today/60 text-transparent ring-1 ring-danger/20 [&_*]:opacity-0"
              : "bg-transparent"
          }`}
        >
          <span className="min-w-[80px] truncate text-hoiku-ink">
            {customItem.name}
          </span>
          <span className="whitespace-nowrap text-center text-text-secondary">
            {customItem.count}
          </span>
          {isSpotItem ? (
            <span className="min-w-0 whitespace-normal break-words text-center text-caption font-normal leading-tight text-text-secondary">
              {formatItemSettingsWeekdays(customItem.weekdays ?? [])}
            </span>
          ) : null}
          {isRoughItem ? (
            <span className="min-w-0 text-center text-text-secondary">
              <HomeItemUnitText unit={customItem.unit} />
            </span>
          ) : null}
          {isSorting ? (
            <span
              aria-hidden="true"
              className="grid h-9 w-9 touch-none place-items-center text-icon-today"
            >
              <GripVertical size={18} strokeWidth={2} />
            </span>
          ) : durableItemsDeletable ? (
            renderFlatActionButton({
              label: "削除",
              tone: "danger",
              onClick: () => requestCustomItemDelete(customItem.id),
              disabled: isDeleting,
              children: <Trash2 size={18} strokeWidth={2.2} />,
            })
          ) : (
            <span className="h-9 w-9" aria-hidden="true" />
          )}
        </div>
        {customItemDeleteError?.itemId === customItem.id ? (
          <p className="px-1 py-2 text-status font-normal text-danger">
            {customItemDeleteError.message}
          </p>
        ) : null}
      </div>
    );
  };

  const renderItemSettingsHeader = (title: string) => (
    <div className="flex min-h-[44px] items-center gap-3">
      <button
        type="button"
        aria-label="戻る"
        onClick={closeCustomItemEdit}
        disabled={isSavingCustomItemSortOrder}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-button bg-surface text-text-tertiary transition active:scale-95 disabled:opacity-50"
      >
        <ChevronRight size={20} strokeWidth={2.2} className="rotate-180" />
      </button>
      <h3 className="min-w-0 flex-1 truncate text-center text-list-item font-semibold text-hoiku-ink">
        {title}
      </h3>
      <span className="h-10 w-10 shrink-0" aria-hidden="true" />
    </div>
  );

  const renderCustomItemDragOverlay = (items: CustomizableItem[]) => {
    if (!customItemDragState) {
      return null;
    }

    const draggedItem = items.find((item) => item.id === customItemDragState.itemId);

    if (!draggedItem) {
      return null;
    }

    const isSpotItem = draggedItem.category === "スポット追加";
    const isRoughItem = draggedItem.category === "ざっくり管理";

    return (
      <div
        className={`pointer-events-none fixed z-50 grid h-14 scale-[1.02] items-center gap-[6px] rounded-section bg-surface px-0 text-number font-normal shadow-[0_14px_28px_rgba(38,53,45,0.18)] ring-1 ring-danger/20 ${customItemRowColumns(
          draggedItem.category,
          "sort",
        )}`}
        style={{
          left: customItemDragState.left,
          top: customItemDragState.currentY - customItemDragState.offsetY,
          width: customItemDragState.width,
        }}
      >
        <span className="min-w-[80px] truncate text-hoiku-ink">
          {draggedItem.name}
        </span>
        <span className="whitespace-nowrap text-center text-text-secondary">
          {draggedItem.count}
        </span>
        {isSpotItem ? (
          <span className="whitespace-nowrap text-center text-caption font-normal text-text-secondary">
            {formatItemSettingsWeekdays(draggedItem.weekdays ?? [])}
          </span>
        ) : null}
        {isRoughItem ? (
          <span className="min-w-0 text-center text-text-secondary">
            <HomeItemUnitText unit={draggedItem.unit} />
          </span>
        ) : null}
        <span className="grid h-9 w-9 place-items-center text-danger">
          <GripVertical size={18} strokeWidth={2} />
        </span>
      </div>
    );
  };

  const renderCustomItemCategory = (category: CustomItemCategory) => {
    const isSorting = sortingCategory === category;
    const isAdding = !isSorting && addingCategory === category;
    const durableItemAddable = canAddHomeDurableItem(dataSource, category);
    const itemSource = isSorting && sortingDraftItems ? sortingDraftItems : customItems;
    const categoryItems = itemSource.filter((item) => item.category === category);

    return (
      <section key={category} className="space-y-3 px-0">
        {renderItemSettingsHeader(`${category}を編集`)}

        {durableItemAddable || durableItemsSortable ? (
          <div className="flex h-11 items-center justify-end gap-2 text-number font-normal">
            {isSorting ? (
              <button
                type="button"
                onClick={finishCustomItemSorting}
                disabled={isSavingCustomItemSortOrder}
                className="h-10 px-1 text-number font-normal text-danger transition active:scale-95"
              >
                完了
              </button>
            ) : (
              <>
                {durableItemsSortable ? (
                  <IconButton
                    label="並び替え"
                    onClick={() => startCustomItemSorting(category)}
                    className="h-10 w-10 text-text-secondary"
                  >
                    <GripVertical size={18} strokeWidth={2} />
                  </IconButton>
                ) : null}
                {durableItemAddable ? (
                  <IconButton
                    label="追加"
                    disabled={isAddingCustomItem}
                    onClick={() =>
                      isAdding ? cancelCustomItemAdding() : startCustomItemAdding(category)
                    }
                    className={`h-10 w-10 ${
                      isAdding
                        ? "bg-card-today text-danger ring-1 ring-danger/20"
                        : "text-text-secondary"
                    }`}
                  >
                    <Plus size={19} strokeWidth={2.2} />
                  </IconButton>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        <div className="mx-0 divide-y-0 overflow-visible">
          {isAdding ? renderCustomItemAddRow(category) : null}
          {isAdding && customItemAddError ? (
            <p className="px-1 py-2 text-status font-normal text-danger">
              {customItemAddError}
            </p>
          ) : null}
          {isSorting && customItemSortOrderError ? (
            <p className="px-1 py-2 text-status font-normal text-danger">
              {customItemSortOrderError}
            </p>
          ) : null}
          {categoryItems.map((customItem) =>
            renderCustomItemRow(customItem, isSorting),
          )}
        </div>
        {renderCustomItemDragOverlay(categoryItems)}
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
            session && (activeTab === "check" || activeTab === "items") ? (
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
            session && activeTab === "items" && shouldShowThanksButton ? (
              <button
                type="button"
                onClick={sendThanks}
                disabled={
                  dailyMode === "local"
                    ? !canRunLocalDailyMutation
                    : isSharedThanksButtonDisabled
                }
                aria-busy={isSendThanksPending || undefined}
                className="rounded-button bg-tab-active px-3 py-1 text-status font-normal text-danger ring-1 ring-[#ffd1dc] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {session.thanksSent
                  ? "✓ ありがとう済み"
                  : isSendThanksPending
                    ? "送信中…"
                    : "♡ ありがとう"}
              </button>
            ) : null
          }
        />

        {activeTab !== "settings" &&
        dailyMode === "shared-non-success" &&
        sharedDailyStatusView ? (
          <SectionCard appearance="current" className="mt-5">
            <h2 className="text-card-title font-semibold text-text-primary">
              {sharedDailyStatusView.title}
            </h2>
            <p className="mt-2 text-status font-normal leading-relaxed text-text-secondary">
              {sharedDailyStatusView.body}
            </p>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-4 h-11 rounded-button bg-primary px-5 text-button font-bold text-surface shadow-button transition active:scale-[0.99]"
            >
              再読み込み
            </button>
          </SectionCard>
        ) : null}

        {activeTab !== "settings" &&
        dailyMode === "shared-success" &&
        displayedDailyItemMutationError ? (
          <div
            role="alert"
            className="mt-5 rounded-section bg-card-today px-4 py-3 text-status text-text-secondary ring-1 ring-border-soft"
          >
            <p className="font-semibold text-text-primary">
              {displayedDailyItemMutationError.title}
            </p>
            <p className="mt-1 leading-relaxed">
              {displayedDailyItemMutationError.body}
            </p>
            {displayedDailyItemMutationError.canReload ? (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="mt-3 rounded-button bg-primary px-4 py-2 font-bold text-surface shadow-button transition active:scale-[0.99]"
              >
                再読み込み
              </button>
            ) : null}
          </div>
        ) : null}

        {activeTab === "check" && session ? (
          <div className={`${cardStackClassName} pb-24`}>
            <ShortageInputList
              items={lockerItems}
              onChange={updateShortageCount}
              disabled={
                !canRunObservedQuantityMutation ||
                isSharedSessionMutationPending ||
                isSharedDailyPreparationCompleted
              }
              disabledItemIds={disabledObservedQuantityItemIds}
            />

            <ReusableCard
              title="スポット追加"
              icon={<CalendarDays size={22} strokeWidth={2.1} />}
              tone="pink"
              action={
                <button
                  type="button"
                  disabled={!canRunLocalDailyMutation}
                  onClick={() => {
                    if (canRunLocalDailyMutation) {
                      setIsTodayOnlySheetOpen(true);
                    }
                  }}
                  className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-button bg-surface/80 px-4 text-status font-normal text-danger ring-1 ring-danger/20 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
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
              {roughItems.map((item) => {
                const isSaving = roughStateSavingItemIds.includes(item.id);

                return (
                  <CardListRow
                    key={item.id}
                    as={roughStateEditable && !isSaving ? "button" : "div"}
                    onClick={
                      roughStateEditable && !isSaving
                        ? () => toggleRoughState(item.id)
                        : undefined
                    }
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
                            {isSaving ? "保存中" : (roughStates[item.id] ?? "十分")}
                          </span>
                        </div>
                      </div>
                    }
                    right={
                      <HomeItemQuantityText count={item.count} unit={item.unit} />
                    }
                    indicatorWidth={roughIndicatorColumnWidth}
                    valueColumnWidth={roughValueColumnWidth}
                  />
                );
              })}
              {roughStateSaveError ? (
                <p className="px-1 py-2 text-status font-normal text-danger">
                  {roughStateSaveError}
                </p>
              ) : null}
            </ReusableCard>
          </div>
        ) : null}

        {activeTab === "items" && session ? (
          <div className={cardStackClassName}>
            <PreparationChecklist
              items={session.items}
              completedAt={preparationCompletedAt}
              onToggle={togglePreparationItem}
              onCheckAll={checkAllPreparationItems}
              onToggleLater={togglePreparationItemLater}
              onComplete={completePreparation}
              itemActionsDisabled={
                !canRunPreparationItemMutation ||
                isSharedSessionMutationPending ||
                isSharedDailyPreparationCompleted
              }
              bulkActionDisabled={isPreparationBulkDisabled}
              completeActionDisabled={
                dailyMode === "local"
                  ? !canRunCompletePreparationMutation
                  : !canRunSharedCompletePreparation
              }
              completeActionPending={isCompletePreparationPending}
              disabledItemIds={disabledPreparationItemIds}
            />
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <div className={settingsSectionStackClassName}>
            <SectionCard appearance="current">
              <h2 className="text-card-title font-semibold tracking-normal text-hoiku-ink">
                設定
              </h2>
              {!existingItemDetailsEditable ? (
                <p className="mt-3 rounded-section bg-card-today px-4 py-3 text-status font-normal leading-relaxed text-text-secondary ring-1 ring-border-soft">
                  {sharedSettingsReadonlyMessage}
                </p>
              ) : null}
              <div className="mt-4 divide-y divide-[#edf3ef]">
                {settingsItems.map((item) => (
                  <div key={item.id}>
                    <button
                      type="button"
                      disabled={!item.enabled || isSavingCustomItemSortOrder}
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
                            ) : childProfileEditable ? (
                              <IconButton label="編集" onClick={startChildNameEdit}>
                                <Pencil size={20} strokeWidth={2.1} />
                              </IconButton>
                            ) : (
                              <span className="h-10 w-10 shrink-0" aria-hidden="true" />
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
                                disabled={isSavingCustomItemSortOrder}
                                onClick={() => {
                                  if (!canInterruptCustomItemSorting()) {
                                    return;
                                  }

                                  setSelectedItemSettingsCategory(category);
                                  setCustomItemAddError(null);
                                  setCustomItemSortOrderError(null);
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

      {activeTab === "check" && shouldRenderCompleteCheckAction ? (
        <div className="fixed inset-x-0 bottom-[calc(88px_+_env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-[430px] px-6">
          <button
            type="button"
            onClick={completeCheck}
            disabled={
              dailyMode === "local"
                ? !canRunLocalCompleteCheck
                : !canRunSharedCompleteCheck
            }
            aria-busy={isCompleteCheckPending || undefined}
            className="h-[52px] w-full rounded-button bg-primary text-button font-bold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45"
          >
            {dailyMode === "shared-success" && sharedDailyState?.status === "success"
              ? sharedDailyState.session.isChecked
                ? "✓ 確認済み"
                : isCompleteCheckPending
                  ? "保存中…"
                  : "確認完了"
              : "確認完了"}
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

      {customItemDeleteConfirmItemId ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-6">
          <div className="w-full max-w-[340px] rounded-card bg-surface p-5 shadow-floating ring-1 ring-border-soft">
            <h3 className="text-list-item font-medium text-text-primary">
              この項目を削除しますか？
            </h3>
            <p className="mt-2 text-number font-normal leading-relaxed text-text-secondary">
              家族の画面からも削除されます。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCustomItemDeleteConfirmItemId(null)}
                className="h-11 rounded-button bg-card-today text-number font-normal text-text-secondary ring-1 ring-border-soft transition active:scale-95"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmCustomItemDelete}
                className="h-11 rounded-button bg-primary text-number font-normal text-surface shadow-button transition active:scale-95"
              >
                削除する
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
                              disabled={!canRunLocalDailyMutation}
                              aria-label={`${item.name}の期限を解除`}
                              onClick={() => clearSpotDeadline(item.id)}
                              className="grid h-8 w-8 place-items-center rounded-full bg-primary text-surface ring-1 ring-primary/30 transition active:scale-95"
                            >
                              <CalendarDays size={16} strokeWidth={2.2} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canRunLocalDailyMutation}
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
                          disabled={!canRunLocalDailyMutation}
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
                    onPointerDown={
                      canRunLocalDailyMutation
                        ? (event) =>
                            startTemporaryItemSwipe(item.id, event.clientX)
                        : undefined
                    }
                    onPointerMove={
                      canRunLocalDailyMutation
                        ? (event) =>
                            moveTemporaryItemSwipe(item.id, event.clientX)
                        : undefined
                    }
                    onPointerUp={
                      canRunLocalDailyMutation
                        ? () => endTemporaryItemSwipe(item.id)
                        : undefined
                    }
                    onPointerCancel={
                      canRunLocalDailyMutation
                        ? () => {
                            swipeStartXRef.current = null;
                            setSwipingTodayOnlyItemId(null);
                            setTodayOnlySwipeOffset(0);
                          }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      disabled={!canRunLocalDailyMutation}
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
                    disabled={!canRunLocalDailyMutation}
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
                    disabled={!canRunLocalDailyMutation}
                  />
                  <button
                    type="button"
                    disabled={!canRunLocalDailyMutation}
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
                  disabled={!canRunLocalDailyMutation}
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
                disabled={!canRunLocalDailyMutation}
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
