export default function HomeLoading() {
  return (
    <main
      aria-busy="true"
      className="pointer-events-none min-h-dvh select-none bg-[#FFFBF2] text-hoiku-ink"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-[calc(98px_+_env(safe-area-inset-bottom))] pt-5">
        <header className="mb-4 w-full rounded-card bg-surface p-4 shadow-card ring-1 ring-border-soft">
          <div className="grid grid-cols-1 items-start gap-3 min-[400px]:grid-cols-[minmax(0,10.75rem)_1px_minmax(0,1fr)]">
            <div className="grid h-16 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3">
              <div className="h-12 w-12 rounded-avatar bg-[#e9e8e4]" />
              <div className="space-y-2">
                <div className="h-5 w-24 max-w-full rounded-full bg-[#e9e8e4]" />
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

        <p className="mb-3 text-center text-[13px] text-text-tertiary">
          今日の持ち物を確認しています
        </p>

        <section className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-border-soft">
          <div className="flex h-14 items-center gap-3 border-b border-divider px-5">
            <div className="h-8 w-8 rounded-full bg-[#e7e6e2]" />
            <span className="text-card-title font-semibold text-text-tertiary">
              持ち物
            </span>
          </div>
          <div className="divide-y divide-divider px-5">
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
  );
}
