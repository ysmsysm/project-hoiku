import type { CustomizableItem } from "../types/preparation";

export const defaultCustomItems: CustomizableItem[] = [
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
  {
    id: "today-letter",
    name: "おたより",
    unit: "枚",
    count: 1,
    category: "スポット追加",
  },
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
  {
    id: "rough-diaper",
    name: "おむつ",
    unit: "パック",
    count: 1,
    category: "ざっくり管理",
  },
  {
    id: "rough-wipe",
    name: "おしりふき",
    unit: "パック",
    count: 1,
    category: "ざっくり管理",
  },
  {
    id: "rough-bag",
    name: "ビニール袋",
    unit: "セット",
    count: 1,
    category: "ざっくり管理",
  },
  {
    id: "rough-tissue",
    name: "ティッシュ",
    unit: "個",
    count: 1,
    category: "ざっくり管理",
  },
];

export const defaultRoughStates = {
  "rough-diaper": "十分",
  "rough-wipe": "少ない",
  "rough-bag": "十分",
  "rough-tissue": "補充",
} as const satisfies Record<string, "十分" | "少ない" | "補充">;
