export type LockerItem = {
  id: string;
  name: string;
  unit: string;
  requiredCount: number;
  shortageCount: number;
};

export type PreparationItem = {
  id: string;
  name: string;
  unit: string;
  count: number;
  checked: boolean;
  later?: boolean;
};

export type PreparationSession = {
  checkedBy: string;
  confirmedAt: string | null;
  completedAt: string | null;
  items: PreparationItem[];
  thanksSent: boolean;
};

export type AppTab = "check" | "items" | "settings";

export type CustomItemCategory = "持ち物" | "今日だけ追加" | "ざっくり管理";

export type CustomizableItem = {
  id: string;
  name: string;
  unit: string;
  count: number;
  category: CustomItemCategory;
};

export type TodayOnlyTemporaryItem = CustomizableItem & {
  date: string;
};
