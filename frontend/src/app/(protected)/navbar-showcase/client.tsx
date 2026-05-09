"use client";

const demoItems = [
  { label: "Dashboard", active: true },
  { label: "Facturation", active: false },
  { label: "Transactions", active: false },
  { label: "Échéances", active: false },
  { label: "Aide", active: false },
];

const icon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="9" rx="1.5" fill="currentColor" opacity="0.6" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" fill="currentColor" opacity="0.3" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" fill="currentColor" opacity="0.45" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" fill="currentColor" opacity="0.2" />
  </svg>
);

const smallIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="7" height="9" rx="1.5" fill="currentColor" opacity="0.6" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" fill="currentColor" opacity="0.3" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" fill="currentColor" opacity="0.45" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" fill="currentColor" opacity="0.2" />
  </svg>
);

function Label({ n, title }: { n: number; title: string }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">#{n} — {title}</p>;
}

function UserAvatar({ className }: { className?: string }) {
  return <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${className || "bg-white/20 text-white"}`}>JD</div>;
}

function LogoText({ className }: { className?: string }) {
  return <span className={`text-lg font-extrabold tracking-tight ${className || "text-white"}`}>actidec</span>;
}

export function NavbarShowcase() {
  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Navbar — 10 variantes</h1>
        <p className="text-sm text-gray-500 mt-1">Choisis celle qui te plaît, je l'applique.</p>
      </div>

      {/* 1 — Current (dark) */}
      <div>
        <Label n={1} title="Actuelle (dark flat)" />
        <nav className="flex items-center justify-between bg-[#2A2A2E] px-6 h-[4.5rem] rounded-xl">
          <div className="flex items-center gap-6">
            <LogoText />
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-md text-[11px] font-medium ${item.active ? "bg-white/20 text-white" : "text-white/70"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar />
            <span className="text-sm font-medium text-white">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 2 — Glass morphism */}
      <div>
        <Label n={2} title="Glass morphism" />
        <nav className="flex items-center justify-between bg-white/10 border border-white/30 backdrop-blur-2xl px-6 h-[4.5rem] rounded-2xl shadow-lg">
          <div className="flex items-center gap-6">
            <LogoText className="text-gray-900" />
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-[11px] font-medium ${item.active ? "bg-white/60 text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar className="bg-gray-900 text-white" />
            <span className="text-sm font-medium text-gray-700">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 3 — Gradient purple */}
      <div>
        <Label n={3} title="Gradient violet" />
        <nav className="flex items-center justify-between bg-gradient-to-r from-[#7C4FA0] to-[#9060B6] px-6 h-[4.5rem] rounded-xl shadow-lg shadow-purple-200/50">
          <div className="flex items-center gap-6">
            <LogoText />
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-md text-[11px] font-medium ${item.active ? "bg-white/25 text-white" : "text-white/65"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar />
            <span className="text-sm font-medium text-white">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 4 — White minimal */}
      <div>
        <Label n={4} title="Blanc minimal" />
        <nav className="flex items-center justify-between bg-white border border-gray-200 px-6 h-[4.5rem] rounded-xl shadow-sm">
          <div className="flex items-center gap-6">
            <LogoText className="text-gray-900" />
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-md text-[11px] font-medium ${item.active ? "bg-gray-100 text-gray-900" : "text-gray-400"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar className="bg-gray-100 text-gray-700" />
            <span className="text-sm font-medium text-gray-700">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 5 — Brand orange */}
      <div>
        <Label n={5} title="Brand orange (doux)" />
        <nav className="flex items-center justify-between bg-gradient-to-r from-[#A0522D] to-[#B8632E] px-6 h-[4.5rem] rounded-xl shadow-lg shadow-orange-900/20">
          <div className="flex items-center gap-6">
            <LogoText />
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-md text-[11px] font-medium ${item.active ? "bg-white/25 text-white" : "text-white/70"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar />
            <span className="text-sm font-medium text-white">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 6 — Pill tabs */}
      <div>
        <Label n={6} title="Pill tabs (dark)" />
        <nav className="flex items-center justify-between bg-[#1a1a1f] px-6 h-[4.5rem] rounded-full">
          <div className="flex items-center gap-6">
            <LogoText />
            <div className="flex items-center gap-2 bg-white/10 rounded-full p-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all ${item.active ? "bg-white text-gray-900" : "text-white/60"}`}>
                  {smallIcon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar />
            <span className="text-sm font-medium text-white">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 7 — Bottom border accent */}
      <div>
        <Label n={7} title="Underline accent" />
        <nav className="flex items-center justify-between bg-white px-6 h-[4.5rem] rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-6">
            <LogoText className="text-gray-900" />
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 text-[11px] font-medium border-b-2 ${item.active ? "border-[#EC6C12] text-gray-900" : "border-transparent text-gray-400"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar className="bg-[#EC6C12] text-white" />
            <span className="text-sm font-medium text-gray-700">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 8 — Soft gradient light */}
      <div>
        <Label n={8} title="Soft gradient clair" />
        <nav className="flex items-center justify-between bg-gradient-to-r from-white via-gray-50 to-white border border-gray-200/60 px-6 h-[4.5rem] rounded-xl">
          <div className="flex items-center gap-6">
            <LogoText className="text-gray-900" />
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-[11px] font-medium ${item.active ? "bg-[#EC6C12]/10 text-[#EC6C12]" : "text-gray-400"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar className="bg-gray-900 text-white" />
            <span className="text-sm font-medium text-gray-700">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 9 — Floating dark with glow */}
      <div>
        <Label n={9} title="Floating dark + glow" />
        <nav className="flex items-center justify-between bg-[#18181b] px-6 h-[4.5rem] rounded-2xl shadow-xl shadow-black/20 ring-1 ring-white/10">
          <div className="flex items-center gap-6">
            <LogoText className="text-[#EC6C12]" />
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-[11px] font-medium ${item.active ? "bg-[#EC6C12] text-white shadow-md shadow-orange-500/30" : "text-zinc-400"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <UserAvatar className="bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700" />
            <span className="text-sm font-medium text-zinc-300">Jean Dupont</span>
          </div>
        </nav>
      </div>

      {/* 10 — Two-tone split */}
      <div>
        <Label n={10} title="Two-tone split" />
        <nav className="flex items-center justify-between h-[4.5rem] rounded-xl overflow-hidden">
          <div className="flex items-center gap-6 bg-[#2A2A2E] px-6 h-full">
            <LogoText />
          </div>
          <div className="flex-1 flex items-center justify-between bg-white/80 backdrop-blur-xl border-y border-r border-gray-200 px-6 h-full rounded-r-xl">
            <div className="flex items-center gap-1">
              {demoItems.map((item) => (
                <div key={item.label} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-md text-[11px] font-medium ${item.active ? "bg-gray-100 text-gray-900" : "text-gray-400"}`}>
                  {icon}
                  {item.label}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <UserAvatar className="bg-[#2A2A2E] text-white" />
              <span className="text-sm font-medium text-gray-700">Jean Dupont</span>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}
