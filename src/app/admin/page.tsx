import { Money } from "@/components/ui/Money";
import { ledgerTotals } from "@/lib/data/contributions";

export default async function AdminDashboard() {
  const totals = await ledgerTotals();

  const cards = [
    { label: "Collected", value: totals.collectedPaise },
    { label: "Given out", value: totals.disbursedPaise },
    { label: "In hand", value: totals.balancePaise },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">{card.label}</p>
            <p className="pt-1 text-2xl font-semibold">
              <Money paise={card.value} compact />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
