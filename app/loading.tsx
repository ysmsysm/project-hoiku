import {
  sharedSettingsPreviewCacheKey,
} from "../src/lib/family-sharing/shared-settings-preview-cache";

const sharedSettingsPreviewBootstrapScript = `(() => {
  try {
    const serialized = window.localStorage.getItem(${JSON.stringify(sharedSettingsPreviewCacheKey)});
    if (!serialized) return;
    const value = JSON.parse(serialized);
    const categories = ["持ち物", "スポット追加", "ざっくり管理"];
    const roughStates = ["十分", "少ない", "補充"];
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const validText = (text, max) =>
      typeof text === "string" && text.trim().length > 0 && Array.from(text).length <= max;
    const validWeekdays = (items) =>
      Array.isArray(items) && items.length <= 7 && items.every((day, index) =>
        Number.isInteger(day) && day >= 0 && day <= 6 && items.indexOf(day) === index
      );
    const validItem = (item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      if (!validText(item.id, 128) || !validText(item.name, 80)) return false;
      if (typeof item.unit !== "string" || Array.from(item.unit).length > 16) return false;
      if (!Number.isInteger(item.count) || item.count < 0 || item.count > 999) return false;
      if (!categories.includes(item.category) || !validWeekdays(item.weekdays)) return false;
      if (item.category !== "スポット追加" && item.weekdays.length > 0) return false;
      if (item.category === "スポット追加" && item.count > 5) return false;
      const hasRoughState = roughStates.includes(item.roughState);
      return item.category === "ざっくり管理" ? hasRoughState : item.roughState === null;
    };
    if (
      !value ||
      value.version !== 1 ||
      !validText(value.childName, 8) ||
      !Array.isArray(value.items) ||
      value.items.length > 500 ||
      !value.items.every(validItem) ||
      new Set(value.items.map((item) => item.id)).size !== value.items.length
    ) return;

    const root = document.querySelector("[data-shared-preview-root]");
    const name = root?.querySelector("[data-shared-preview-name]");
    const namePlaceholder = root?.querySelector("[data-shared-preview-name-placeholder]");
    const message = root?.querySelector("[data-shared-preview-message]");
    const title = root?.querySelector("[data-shared-preview-title]");
    const itemContainer = root?.querySelector("[data-shared-preview-items]");
    const itemTemplate = root?.querySelector("[data-shared-preview-item-template]");
    const emptyTemplate = root?.querySelector("[data-shared-preview-empty-template]");
    if (!root || !name || !namePlaceholder || !message || !title || !itemContainer || !itemTemplate) return;

    name.textContent = value.childName;
    name.hidden = false;
    namePlaceholder.hidden = true;
    message.textContent = "最新の確認状況を読み込んでいます";
    title.textContent = "持ち物設定";

    const rows = document.createDocumentFragment();
    value.items.slice(0, 6).forEach((item) => {
      const row = itemTemplate.content.cloneNode(true);
      const itemName = row.querySelector("[data-shared-preview-item-name]");
      const detail = row.querySelector("[data-shared-preview-item-detail]");
      const quantity = "設定 " + item.count + item.unit;
      let detailText = quantity;
      if (item.category === "スポット追加" && item.weekdays.length > 0) {
        detailText = item.weekdays.map((day) => weekdays[day]).join("・") + " / " + quantity;
      } else if (item.category === "ざっくり管理") {
        detailText = item.roughState + " / " + quantity;
      }
      itemName.textContent = item.name;
      detail.textContent = detailText;
      rows.appendChild(row);
    });
    if (value.items.length === 0 && emptyTemplate) {
      rows.appendChild(emptyTemplate.content.cloneNode(true));
    }
    itemContainer.replaceChildren(rows);
    root.setAttribute("data-shared-preview-ready", "true");
  } catch {
    // Invalid or unavailable preview data leaves the server-rendered skeleton intact.
  }
})();`;

export default function HomeLoading() {
  return (
    <>
      <main
        aria-busy="true"
        data-shared-preview-root
        className="pointer-events-none min-h-dvh select-none bg-[#FFFBF2] text-hoiku-ink"
      >
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-[calc(98px_+_env(safe-area-inset-bottom))] pt-5">
        <header className="mb-4 w-full rounded-card bg-surface p-4 shadow-card ring-1 ring-border-soft">
          <div className="grid grid-cols-1 items-start gap-3 min-[400px]:grid-cols-[minmax(0,10.75rem)_1px_minmax(0,1fr)]">
            <div className="grid h-16 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3">
              <div className="h-12 w-12 rounded-avatar bg-[#e9e8e4]" />
              <div className="space-y-2">
                <p
                  hidden
                  data-shared-preview-name
                  className="truncate text-[22px] font-bold text-text-primary"
                />
                <div
                  data-shared-preview-name-placeholder
                  className="h-5 w-24 max-w-full rounded-full bg-[#e9e8e4]"
                />
                <div className="h-3 w-16 rounded-full bg-[#f0efec]" />
              </div>
            </div>
            <div className="h-px w-full bg-divider min-[400px]:h-auto min-[400px]:min-h-16 min-[400px]:w-px min-[400px]:self-stretch" />
            <div className="flex min-h-16 min-w-0 flex-col justify-center gap-2 text-[13px] text-text-tertiary">
              {[
                { label: "確認", badgeWidth: "w-10" },
                { label: "準備", badgeWidth: "w-12" },
              ].map(({ label, badgeWidth }) => (
                <div
                  key={label}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <div className="h-4 w-4 shrink-0 rounded-full bg-[#e5e4e0]" />
                  <span className="shrink-0">{label}</span>
                  <div
                    className={`h-5 shrink-0 rounded-full bg-[#ecebe7] ${badgeWidth}`}
                  />
                  <div className="ml-auto h-3 w-16 min-w-0 rounded-full bg-[#ecebe7]" />
                </div>
              ))}
            </div>
          </div>
        </header>

        <p
          data-shared-preview-message
          className="mb-3 text-center text-[13px] text-text-tertiary"
        >
          今日の持ち物を確認しています
        </p>

        <section className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-border-soft">
          <div className="flex h-14 items-center gap-3 border-b border-divider px-5">
            <div className="h-8 w-8 rounded-full bg-[#e7e6e2]" />
            <span
              data-shared-preview-title
              className="text-card-title font-semibold text-text-tertiary"
            >
              持ち物
            </span>
          </div>
          <div data-shared-preview-items className="divide-y divide-divider px-5">
            {["item-1", "item-2", "item-3", "item-4"].map((item) => (
              <div key={item} className="flex h-[68px] items-center gap-3">
                <div className="h-4 min-w-0 flex-1 rounded-full bg-[#ecebe7]" />
                <div className="flex shrink-0 gap-2">
                  <div className="h-7 w-7 rounded-full bg-[#e5e4e0]" />
                  <div className="h-7 w-7 rounded-full bg-[#e5e4e0]" />
                  <div className="h-7 w-7 rounded-full bg-[#e5e4e0]" />
                </div>
                <div className="h-4 w-9 shrink-0 rounded-full bg-[#ecebe7]" />
              </div>
            ))}
          </div>
          <template data-shared-preview-item-template>
            <div className="flex min-h-[58px] items-center gap-3 py-2">
              <span
                data-shared-preview-item-name
                className="min-w-0 flex-1 truncate text-number font-medium text-text-primary"
              />
              <span
                data-shared-preview-item-detail
                className="max-w-[48%] shrink-0 text-right text-caption leading-tight text-text-secondary"
              />
            </div>
          </template>
          <template data-shared-preview-empty-template>
            <p className="py-5 text-center text-status text-text-tertiary">
              設定済みの持ち物はありません
            </p>
          </template>
        </section>

        <section className="mt-4 overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-border-soft">
          <div className="flex h-14 items-center gap-3 border-b border-divider px-5">
            <div className="h-8 w-8 rounded-full bg-[#e7e6e2]" />
            <span className="text-card-title font-semibold text-text-tertiary">
              準備
            </span>
          </div>
          <div className="p-3">
            <div className="h-12 rounded-button bg-[#ecebe7]" />
          </div>
        </section>
      </div>

      <nav
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2"
      >
        <div className="grid grid-cols-3 gap-1 rounded-card bg-surface p-2 shadow-card ring-1 ring-border-soft">
          {["確認", "持ち物", "設定"].map((label) => (
            <div
              key={label}
              className="flex h-12 flex-col items-center justify-center gap-1 text-[12px] font-bold text-text-tertiary"
            >
              <div className="h-[18px] w-[18px] rounded-full bg-[#e5e4e0]" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </nav>
      </main>
      <script
        dangerouslySetInnerHTML={{
          __html: sharedSettingsPreviewBootstrapScript,
        }}
      />
    </>
  );
}
