import type { Item } from "../types/item";

export const defaultItems: Item[] = [
  {
    id: "diaper",
    name: "おむつ",
    requiredCount: 5,
    unit: "枚",
    category: "消耗品",
  },
  {
    id: "change-clothes",
    name: "着替え",
    requiredCount: 2,
    unit: "組",
    category: "衣類",
  },
  {
    id: "meal-apron",
    name: "食事エプロン",
    requiredCount: 3,
    unit: "枚",
    category: "食事",
  },
  {
    id: "mouth-towel",
    name: "口拭きタオル",
    requiredCount: 3,
    unit: "枚",
    category: "食事",
  },
  {
    id: "plastic-bag",
    name: "ビニール袋",
    requiredCount: 2,
    unit: "枚",
    category: "消耗品",
  },
];
