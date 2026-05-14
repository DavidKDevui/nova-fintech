"use client";

type OptimCard = {
  title: string;
  tag: string;
  description: string;
  available: boolean;
};

const cards: OptimCard[] = [
  {
    title: "Plan Épargne Retraite",
    tag: "Optimisation fiscale",
    description: "Préparez votre retraite tout en réduisant votre impôt.",
    available: true,
  },
  {
    title: "Prévoyance Pro",
    tag: "Optimisation fiscale",
    description: "Protégez votre activité en cas d'accident.",
    available: true,
  },
  {
    title: "Frais de blanchisserie",
    tag: "Optimisation sociale",
    description: "Augmentez vos frais déductibles.",
    available: true,
  },
  {
    title: "Chèques-vacances",
    tag: "Optimisation fiscale",
    description: "Augmentez votre pouvoir d'achat.",
    available: true,
  },
  {
    title: "Passage en SELARL",
    tag: "En cours de construction",
    description: "test text here",
    available: false,
  },
  {
    title: "Comité d'entreprise",
    tag: "En cours de construction",
    description: "test text here",
    available: false,
  },
  {
    title: "Achat de matériel",
    tag: "En cours de construction",
    description: "test text here",
    available: false,
  },
  {
    title: "Gestion temps travail",
    tag: "En cours de construction",
    description: "test text here",
    available: false,
  },
];

export function OptimizationClient() {
  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold mb-2">Optimisation</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Pistes d&apos;optimisation fiscale et sociale pour votre activité.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <h2 className="text-sm font-bold text-gray-900 mb-4">
            Mes moyens d&apos;optimisation
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.map((card) => (
              <article
                key={card.title}
                className={`rounded-xl border p-5 transition-all ${
                  card.available
                    ? "border-gray-200 bg-white hover:border-brand-400 hover:shadow-md cursor-pointer"
                    : "border-gray-200 bg-gray-50 opacity-70"
                }`}
              >
                <span
                  className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-3 ${
                    card.available
                      ? card.tag === "Optimisation sociale"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-violet-100 text-violet-700"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {card.tag}
                </span>
                <h3 className="text-base font-bold text-gray-900 mb-1">
                  {card.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {card.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
