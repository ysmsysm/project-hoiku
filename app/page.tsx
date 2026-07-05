"use client";

import { Baby, CalendarDays, Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useState } from "react";

type DailyItem = {
  id: string;
  name: string;
  detail: string;
  required: number;
};

type StockState = "enough" | "low" | "empty";

type RoughItem = {
  id: string;
  name: string;
  detail?: string;
  state: StockState;
};

const dailyItems: DailyItem[] = [
  { id: "tshirt", name: "半袖", detail: "3枚", required: 3 },
  { id: "underwear", name: "下着", detail: "3枚", required: 3 },
  { id: "pants", name: "ズボン", detail: "3枚", required: 3 },
  { id: "bib", name: "スタイ", detail: "2枚", required: 2 },
  { id: "apron", name: "お食事エプロン", detail: "1枚", required: 1 },
  { id: "socks", name: "靴下", detail: "2足", required: 2 },
];

const addOnlyTodayOptions = ["おたより", "水遊びカード", "布団セット"];

const roughItems: RoughItem[] = [
  { id: "diaper", name: "おむつ", detail: "1パック", state: "enough" },
  { id: "wipe", name: "おしりふき", detail: "1パック", state: "low" },
  { id: "bag", name: "ビニール袋", state: "enough" },
  { id: "tissue", name: "ティッシュ", state: "empty" },
];

const roughLabels: Record<StockState, string> = {
  enough: "十分",
  low: "少ない",
  empty: "補充",
};

const roughStateColors: Record<StockState, string> = {
  enough: "text-hoiku-green",
  low: "text-[#d6a51f]",
  empty: "text-[#d85b4a]",
};

const roughDotColors: Record<StockState, string> = {
  enough: "bg-[#bfe5ce]",
  low: "bg-[#f6df76]",
  empty: "bg-[#f3a1a8]",
};

const nextRoughState: Record<StockState, StockState> = {
  enough: "low",
  low: "empty",
  empty: "enough",
};

const getDailyCountColor = (current: number, required: number) => {
  const shortage = required - current;

  if (shortage === 0) {
    return "text-hoiku-green";
  }

  if (shortage === 1) {
    return "text-[#d98128]";
  }

  return "text-[#d85b4a]";
};

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

const formatJapaneseDate = (date: Date) =>
  `${date.getMonth() + 1}月${date.getDate()}日（${
    weekdays[date.getDay()]
  }）`;

const getMillisecondsUntilNextDay = () => {
  const now = new Date();
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, 0);

  return nextDay.getTime() - now.getTime();
};

const getDateOnlyTime = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const getElapsedBadgeLabel = (confirmedAt: Date, currentDate: Date) => {
  const diffDays = Math.max(
    0,
    Math.floor(
      (getDateOnlyTime(currentDate) - getDateOnlyTime(confirmedAt)) /
        86_400_000,
    ),
  );

  if (diffDays === 0) {
    return "今日";
  }

  if (diffDays === 1) {
    return "昨日確認";
  }

  return `${diffDays}日前確認`;
};

const lastConfirmedStorageKey = "project-hoiku:last-confirmed-at";

export default function Home() {
  const [checkedCounts, setCheckedCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(dailyItems.map((item) => [item.id, 0])),
  );
  const [roughStates, setRoughStates] = useState<Record<string, StockState>>(
    () => Object.fromEntries(roughItems.map((item) => [item.id, item.state])),
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [todayItems, setTodayItems] = useState<string[]>([]);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [lastConfirmedAt, setLastConfirmedAt] = useState(() => new Date());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextUpdate = () => {
      setCurrentDate(new Date());
      timeoutId = setTimeout(scheduleNextUpdate, getMillisecondsUntilNextDay());
    };

    const savedLastConfirmedAt = window.localStorage.getItem(
      lastConfirmedStorageKey,
    );

    if (savedLastConfirmedAt) {
      setLastConfirmedAt(new Date(savedLastConfirmedAt));
    }

    timeoutId = setTimeout(scheduleNextUpdate, getMillisecondsUntilNextDay());

    return () => clearTimeout(timeoutId);
  }, []);

  const toggleDailyCircle = (item: DailyItem, circleIndex: number) => {
    setCheckedCounts((current) => {
      const nextCount =
        current[item.id] === circleIndex + 1 ? circleIndex : circleIndex + 1;

      return {
        ...current,
        [item.id]: nextCount,
      };
    });
  };

  const addTodayItem = (itemName: string) => {
    setTodayItems((current) =>
      current.includes(itemName) ? current : [...current, itemName],
    );
    setIsSheetOpen(false);
  };

  const toggleRoughState = (itemId: string) => {
    setRoughStates((current) => ({
      ...current,
      [itemId]: nextRoughState[current[itemId]],
    }));
  };

  const completeCheck = () => {
    const completedAt = new Date();

    setLastConfirmedAt(completedAt);
    window.localStorage.setItem(
      lastConfirmedStorageKey,
      completedAt.toISOString(),
    );
  };

  const lastConfirmedDate = formatJapaneseDate(lastConfirmedAt);
  const elapsedBadgeLabel = getElapsedBadgeLabel(lastConfirmedAt, currentDate);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-5 pb-[calc(190px_+_env(safe-area-inset-bottom))] pt-4">
        <header className="pb-7 pt-5">
          <p className="text-[18px] font-bold text-hoiku-deep">
            Project Hoiku
          </p>
          <div className="mt-5 flex items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-hoiku-mint text-hoiku-deep">
              <Baby size={30} strokeWidth={2} />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <h1 className="shrink-0 text-[36px] font-bold leading-none tracking-normal text-hoiku-ink">
                そうた
              </h1>
              <div className="h-7 w-px shrink-0 bg-[#d7dfda]" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="w-fit rounded-md bg-hoiku-mint px-2 py-0.5 text-[12px] font-bold text-hoiku-deep">
                  確認日
                </span>
                <div className="flex min-w-0 items-center gap-1.5 text-[#65736b]">
                  <CalendarDays
                    className="shrink-0 text-hoiku-deep"
                    size={20}
                    strokeWidth={2.2}
                  />
                  <p className="shrink-0 text-[15px] font-semibold">
                    {lastConfirmedDate}
                  </p>
                  <span className="shrink-0 rounded-lg bg-hoiku-mint px-2.5 py-1 text-[13px] font-bold text-hoiku-deep">
                    {elapsedBadgeLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[28px] border border-[#edf3ef] bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold tracking-normal">
            持ち物
          </h2>

          <div className="mt-4 divide-y divide-[#edf3ef]">
            {dailyItems.map((item) => (
              <div
                key={item.id}
                className="grid min-h-[43px] grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 py-1.5 pr-12"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <p className="truncate text-[17px] font-semibold text-[#1f1f1f]">
                    {item.name}
                  </p>
                  <p
                    className={`shrink-0 text-[13px] font-semibold ${getDailyCountColor(
                      checkedCounts[item.id],
                      item.required,
                    )}`}
                  >
                    {checkedCounts[item.id]}/{item.required}
                  </p>
                </div>
                <div
                  className="flex w-28 shrink-0 items-center justify-start gap-2"
                  aria-label={`${item.name} ${checkedCounts[item.id]} / ${item.required}`}
                >
                  {Array.from({ length: item.required }).map((_, index) => {
                    const isChecked = index < checkedCounts[item.id];

                    return (
                      <button
                        key={index}
                        type="button"
                        aria-label={`${item.name} ${index + 1}個目`}
                        onClick={() => toggleDailyCircle(item, index)}
                        className={`h-8 w-8 rounded-full border-2 transition active:scale-95 ${
                          isChecked
                            ? "border-hoiku-green bg-hoiku-green"
                            : "border-[#cfdcd4] bg-white"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[28px] border border-[#edf3ef] bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold tracking-normal">今日だけ追加</h2>
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="inline-flex h-12 items-center gap-1.5 rounded-full bg-hoiku-mint px-5 text-[15px] font-bold text-hoiku-deep transition active:scale-95"
            >
              <Plus size={18} strokeWidth={2.5} />
              持ち物を追加
            </button>
          </div>

          {todayItems.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {todayItems.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-[#f4faf6] px-4 py-2 text-[15px] font-semibold text-hoiku-deep ring-1 ring-[#dcefe4]"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[15px] font-medium text-[#8a948e]">
              追加の持ち物はありません
            </p>
          )}
        </section>

        <section className="mt-5 rounded-[28px] border border-[#edf3ef] bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold tracking-normal">ざっくり管理</h2>

          <div className="mt-4 divide-y divide-[#edf3ef]">
            {roughItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleRoughState(item.id)}
                className="grid min-h-[50px] w-full grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-4 py-2.5 text-left"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <p className="truncate text-[17px] font-semibold text-hoiku-ink">
                    {item.name}
                  </p>
                  {item.detail ? (
                    <p className="shrink-0 text-[12px] font-medium text-[#a5aea8]">
                      {item.detail}
                    </p>
                  ) : null}
                </div>
                <div
                  className={`flex w-[7.5rem] shrink-0 items-center justify-start gap-2 text-[15px] font-bold ${
                    roughStateColors[roughStates[item.id]]
                  } transition-colors duration-200 ease-out`}
                >
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-full ${
                      roughDotColors[roughStates[item.id]]
                    } transition-colors duration-200 ease-out`}
                  />
                  {roughLabels[roughStates[item.id]]}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(86px_+_env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-[430px] px-5">
        <button
          type="button"
          onClick={completeCheck}
          className="h-[52px] w-full rounded-full bg-hoiku-green text-[17px] font-bold text-white shadow-[0_10px_22px_rgba(124,200,154,0.24)] transition active:scale-[0.99]"
        >
          確認完了
        </button>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[430px] border-t border-[#edf3ef] bg-white/95 px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="grid grid-cols-3 text-center text-[13px] font-bold">
          {["確認", "持ち物", "設定"].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`rounded-2xl py-3 transition active:scale-95 ${
                tab === "確認" ? "bg-hoiku-mint text-hoiku-deep" : "text-[#9aa49e]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {isSheetOpen ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="閉じる"
            className="absolute inset-0 h-full w-full bg-black/20"
            onClick={() => setIsSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto h-[68dvh] w-full max-w-[430px] rounded-t-[30px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_50px_rgba(38,53,45,0.18)]">
            <div className="mx-auto h-1.5 w-11 rounded-full bg-[#dce5df]" />
            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-hoiku-ink">
                今日だけ追加
              </h2>
              <button
                type="button"
                aria-label="シートを閉じる"
                onClick={() => setIsSheetOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full bg-[#f2f6f4] text-[#6e7a73] transition active:scale-95"
              >
                <ChevronDown size={22} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {addOnlyTodayOptions.map((item) => {
                const isAdded = todayItems.includes(item);

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => addTodayItem(item)}
                    className="flex h-14 w-full items-center justify-between rounded-2xl bg-[#f8fbf9] px-4 text-left text-[17px] font-bold text-hoiku-ink ring-1 ring-[#edf3ef] transition active:scale-[0.99]"
                  >
                    <span>{item}</span>
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full ${
                        isAdded
                          ? "bg-hoiku-green text-white"
                          : "bg-hoiku-mint text-hoiku-deep"
                      }`}
                    >
                      {isAdded ? (
                        <Check size={18} strokeWidth={2.6} />
                      ) : (
                        <Plus size={18} strokeWidth={2.6} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
