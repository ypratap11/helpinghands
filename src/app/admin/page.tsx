import { Money } from "@/components/ui/Money";
import { ledgerTotals } from "@/lib/data/contributions";

export default async function AdminDashboard() {
  const totals = await ledgerTotals();

  const cards = [
    {
      label: "Collected",
      value: totals.collectedPaise,
      note: "Everything contributed so far",
      accent: false,
    },
    {
      label: "Given out",
      value: totals.disbursedPaise,
      note: "Help disbursed to date",
      accent: false,
    },
    {
      label: "In hand",
      value: totals.balancePaise,
      note: "Available to give right now",
      accent: true,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Overview</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
          The ledger, at a glance
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border p-6 lift ${
              card.accent
                ? "border-forest/20 bg-forest text-white"
                : "border-line bg-surface text-ink"
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-wide ${
                card.accent ? "text-white/70" : "text-muted"
              }`}
            >
              {card.label}
            </p>
            <p className="mt-3 font-display text-4xl font-semibold tracking-tight">
              <Money paise={card.value} compact />
            </p>
            <p className={`mt-2 text-sm ${card.accent ? "text-white/75" : "text-muted"}`}>
              {card.note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
