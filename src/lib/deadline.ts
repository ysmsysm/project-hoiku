export const isSpotDeadlineEnabled = true;

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const fromDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const getTodayDateKey = () => toDateKey(new Date());

export const getTomorrowDateKey = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toDateKey(tomorrow);
};

export type DeadlineDisplay =
  | { label: "明日まで"; tone: "muted" }
  | { label: "今日まで"; tone: "coral" }
  | { label: "提出期限を過ぎています"; tone: "danger" };

export function getDeadlineDisplay(
  dueDate?: string | null,
): DeadlineDisplay | null {
  if (!isSpotDeadlineEnabled || !dueDate) {
    return null;
  }

  const today = fromDateKey(getTodayDateKey());
  const deadline = fromDateKey(dueDate);
  const diffDays = Math.round(
    (deadline.getTime() - today.getTime()) / 86_400_000,
  );

  if (diffDays > 1) {
    return null;
  }

  if (diffDays === 1) {
    return { label: "明日まで", tone: "muted" };
  }

  if (diffDays === 0) {
    return { label: "今日まで", tone: "coral" };
  }

  return { label: "提出期限を過ぎています", tone: "danger" };
}
