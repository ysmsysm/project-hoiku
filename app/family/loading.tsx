import { SectionCard } from "../../src/components/ui/SectionCard";

export default function FamilyLoading() {
  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-hoiku-ink">
      <div className="mx-auto w-full max-w-[430px] space-y-5">
        <header className="pt-2">
          <p className="text-status font-normal text-text-secondary">
            家族共有
          </p>
          <h1 className="mt-1 text-app-title font-bold tracking-normal text-hoiku-ink">
            読み込み中
          </h1>
        </header>

        <SectionCard>
          <div className="space-y-3">
            <div className="h-4 w-24 rounded-full bg-card-today" />
            <div className="h-6 w-40 rounded-full bg-card-today" />
            <div className="h-[92px] rounded-section bg-card-stock ring-1 ring-border-soft" />
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
