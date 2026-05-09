"use client";

function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-10 flex flex-col items-center gap-5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">#{n} — {title}</p>
      <div className="flex items-center justify-center min-h-[100px]">{children}</div>
    </div>
  );
}

function DarkCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#1a1a1f] p-10 flex flex-col items-center gap-5">
      <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">#{n} — {title}</p>
      <div className="flex items-center justify-center min-h-[100px]">{children}</div>
    </div>
  );
}

/* ——— 1. Raleway — thin élégant + barre ——— */
function Logo1() {
  return (
    <svg width="310" height="72" viewBox="0 0 470 100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@100;800');`}</style>
      <text x="10" y="60" fontFamily="'Raleway', sans-serif" fontWeight="100" fontSize="54" fill="#1a1a1f" letterSpacing="6">acti</text>
      <text x="210" y="60" fontFamily="'Raleway', sans-serif" fontWeight="800" fontSize="54" fill="#C2580F" letterSpacing="6">dec</text>
    </svg>
  );
}
function Logo1D() {
  return (
    <svg width="310" height="72" viewBox="0 0 470 100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@100;800');`}</style>
      <text x="10" y="60" fontFamily="'Raleway', sans-serif" fontWeight="100" fontSize="54" fill="white" letterSpacing="6">acti</text>
      <text x="210" y="60" fontFamily="'Raleway', sans-serif" fontWeight="800" fontSize="54" fill="#EC6C12" letterSpacing="6">dec</text>
    </svg>
  );
}

/* ——— 2. Poppins — rounded friendly ——— */
function Logo2() {
  return (
    <svg width="280" height="78" viewBox="0 0 420 110">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700');`}</style>
      <defs>
        <linearGradient id="v5p" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#EC6C12" />
          <stop offset="100%" stopColor="#9060B6" />
        </linearGradient>
      </defs>
      <rect x="6" y="16" width="8" height="60" rx="4" fill="url(#v5p)" />
      <text x="26" y="62" fontFamily="'Poppins', sans-serif" fontWeight="700" fontSize="48" fill="#1a1a1f" letterSpacing="-1">actidec</text>
      <text x="26" y="82" fontFamily="'Poppins', sans-serif" fontWeight="700" fontSize="11" fill="#9060B6" letterSpacing="2">comptabilité intelligente</text>
    </svg>
  );
}
function Logo2D() {
  return (
    <svg width="280" height="78" viewBox="0 0 420 110">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700');`}</style>
      <defs>
        <linearGradient id="v5pd" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B98ADA" />
        </linearGradient>
      </defs>
      <rect x="6" y="16" width="8" height="60" rx="4" fill="url(#v5pd)" />
      <text x="26" y="62" fontFamily="'Poppins', sans-serif" fontWeight="700" fontSize="48" fill="white" letterSpacing="-1">actidec</text>
      <text x="26" y="82" fontFamily="'Poppins', sans-serif" fontWeight="700" fontSize="11" fill="#EC6C12" letterSpacing="2">comptabilité intelligente</text>
    </svg>
  );
}

/* ——— 3. Bebas Neue — condensed impact ——— */
function Logo3() {
  return (
    <svg width="280" height="72" viewBox="0 0 420 100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue');`}</style>
      <text x="10" y="72" fontFamily="'Bebas Neue', Impact, sans-serif" fontSize="76" fill="#1a1a1f" letterSpacing="8">ACTI</text>
      <text x="218" y="72" fontFamily="'Bebas Neue', Impact, sans-serif" fontSize="76" fill="#EC6C12" letterSpacing="8">DEC</text>
    </svg>
  );
}
function Logo3D() {
  return (
    <svg width="280" height="72" viewBox="0 0 420 100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue');`}</style>
      <text x="10" y="72" fontFamily="'Bebas Neue', Impact, sans-serif" fontSize="76" fill="white" letterSpacing="8">ACTI</text>
      <text x="218" y="72" fontFamily="'Bebas Neue', Impact, sans-serif" fontSize="76" fill="#EC6C12" letterSpacing="8">DEC</text>
    </svg>
  );
}

/* ——— 4. Crimson Pro — serif book + ornement ——— */
function Logo4() {
  return (
    <svg width="300" height="80" viewBox="0 0 460 115">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,700;1,300');`}</style>
      <text x="60" y="20" fontFamily="'Sora', sans-serif" fontWeight="300" fontSize="10" fill="#9060B6" letterSpacing="12" textAnchor="start">DEPUIS 2024</text>
      <line x1="30" y1="30" x2="300" y2="30" stroke="#E9D5FF" strokeWidth="0.8" />
      <text x="30" y="72" fontFamily="'Crimson Pro', Georgia, serif" fontWeight="700" fontSize="56" fill="#1a1a1f" letterSpacing="2">Actidec</text>
      <line x1="30" y1="82" x2="300" y2="82" stroke="#E9D5FF" strokeWidth="0.8" />
      <text x="80" y="100" fontFamily="'Crimson Pro', serif" fontWeight="300" fontStyle="italic" fontSize="16" fill="#C2580F">— gestion financière —</text>
    </svg>
  );
}
function Logo4D() {
  return (
    <svg width="300" height="80" viewBox="0 0 460 115">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,700;1,300');`}</style>
      <text x="60" y="20" fontFamily="'Sora', sans-serif" fontWeight="300" fontSize="10" fill="#EC6C12" letterSpacing="12" textAnchor="start">DEPUIS 2024</text>
      <line x1="30" y1="30" x2="300" y2="30" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
      <text x="30" y="72" fontFamily="'Crimson Pro', Georgia, serif" fontWeight="700" fontSize="56" fill="white" letterSpacing="2">Actidec</text>
      <line x1="30" y1="82" x2="300" y2="82" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
      <text x="80" y="100" fontFamily="'Crimson Pro', serif" fontWeight="300" fontStyle="italic" fontSize="16" fill="#EC6C12">— gestion financière —</text>
    </svg>
  );
}

/* ——— 5. Josefin Sans — art déco thin ——— */
function Logo5() {
  return (
    <svg width="320" height="68" viewBox="0 0 490 96">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@100;700');`}</style>
      <text x="10" y="58" fontFamily="'Josefin Sans', sans-serif" fontWeight="700" fontSize="46" fill="#1a1a1f" letterSpacing="14">ACTI</text>
      <text x="250" y="58" fontFamily="'Josefin Sans', sans-serif" fontWeight="100" fontSize="46" fill="#C2580F" letterSpacing="14">DEC</text>
      <line x1="238" y1="22" x2="238" y2="64" stroke="#9060B6" strokeWidth="1.5" />
    </svg>
  );
}
function Logo5D() {
  return (
    <svg width="320" height="68" viewBox="0 0 490 96">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@100;700');`}</style>
      <text x="10" y="58" fontFamily="'Josefin Sans', sans-serif" fontWeight="700" fontSize="46" fill="white" letterSpacing="14">ACTI</text>
      <text x="250" y="58" fontFamily="'Josefin Sans', sans-serif" fontWeight="100" fontSize="46" fill="#EC6C12" letterSpacing="14">DEC</text>
      <line x1="238" y1="22" x2="238" y2="64" stroke="#B98ADA" strokeWidth="1.5" />
    </svg>
  );
}

/* ——— 6. Fraunces — wonky serif expressif ——— */
function Logo6() {
  return (
    <svg width="280" height="78" viewBox="0 0 420 110">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,900;1,400');`}</style>
      <text x="10" y="68" fontFamily="'Fraunces', Georgia, serif" fontWeight="900" fontSize="60" fill="#1a1a1f" letterSpacing="-2">acti</text>
      <text x="196" y="68" fontFamily="'Fraunces', Georgia, serif" fontWeight="400" fontStyle="italic" fontSize="60" fill="#9060B6" letterSpacing="-2">dec</text>
      <circle cx="190" cy="72" r="4" fill="#EC6C12" />
    </svg>
  );
}
function Logo6D() {
  return (
    <svg width="280" height="78" viewBox="0 0 420 110">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,900;1,400');`}</style>
      <text x="10" y="68" fontFamily="'Fraunces', Georgia, serif" fontWeight="900" fontSize="60" fill="white" letterSpacing="-2">acti</text>
      <text x="196" y="68" fontFamily="'Fraunces', Georgia, serif" fontWeight="400" fontStyle="italic" fontSize="60" fill="#EC6C12" letterSpacing="-2">dec</text>
      <circle cx="190" cy="72" r="4" fill="#B98ADA" />
    </svg>
  );
}

/* ——— 7. Manrope — clean startup ——— */
function Logo7() {
  return (
    <svg width="300" height="68" viewBox="0 0 460 96">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;800');`}</style>
      <defs>
        <linearGradient id="v5m" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#EC6C12" />
          <stop offset="100%" stopColor="#7C4FA0" />
        </linearGradient>
        <filter id="v5ms">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#EC6C12" floodOpacity="0.15" />
        </filter>
      </defs>
      <rect x="6" y="18" width="44" height="44" rx="12" fill="url(#v5m)" filter="url(#v5ms)" />
      <text x="17" y="48" fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize="24" fill="white">a.</text>
      <text x="62" y="52" fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize="42" fill="#1a1a1f" letterSpacing="-2">actidec</text>
      <text x="62" y="70" fontFamily="'Manrope', sans-serif" fontWeight="300" fontSize="12" fill="#9060B6">Votre expert-comptable digital</text>
    </svg>
  );
}
function Logo7D() {
  return (
    <svg width="300" height="68" viewBox="0 0 460 96">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;800');`}</style>
      <defs>
        <linearGradient id="v5md" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B98ADA" />
        </linearGradient>
        <filter id="v5msd">
          <feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="#EC6C12" floodOpacity="0.4" />
        </filter>
      </defs>
      <rect x="6" y="18" width="44" height="44" rx="12" fill="url(#v5md)" filter="url(#v5msd)" />
      <text x="17" y="48" fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize="24" fill="white">a.</text>
      <text x="62" y="52" fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize="42" fill="white" letterSpacing="-2">actidec</text>
      <text x="62" y="70" fontFamily="'Manrope', sans-serif" fontWeight="300" fontSize="12" fill="#EC6C12">Votre expert-comptable digital</text>
    </svg>
  );
}

/* ——— 8. Bodoni Moda — haute couture ——— */
function Logo8() {
  return (
    <svg width="290" height="75" viewBox="0 0 440 105">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,900;1,400');`}</style>
      <text x="10" y="66" fontFamily="'Bodoni Moda', 'Didot', Georgia, serif" fontWeight="900" fontSize="62" fill="#1a1a1f" letterSpacing="-1">ACTIDEC</text>
      <rect x="10" y="76" width="60" height="2" fill="#EC6C12" />
      <rect x="76" y="76" width="20" height="2" fill="#9060B6" />
      <text x="10" y="96" fontFamily="'Bodoni Moda', serif" fontWeight="400" fontStyle="italic" fontSize="14" fill="#C2580F" letterSpacing="1">La finance, autrement.</text>
    </svg>
  );
}
function Logo8D() {
  return (
    <svg width="290" height="75" viewBox="0 0 440 105">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,900;1,400');`}</style>
      <text x="10" y="66" fontFamily="'Bodoni Moda', 'Didot', Georgia, serif" fontWeight="900" fontSize="62" fill="white" letterSpacing="-1">ACTIDEC</text>
      <rect x="10" y="76" width="60" height="2" fill="#EC6C12" />
      <rect x="76" y="76" width="20" height="2" fill="#B98ADA" />
      <text x="10" y="96" fontFamily="'Bodoni Moda', serif" fontWeight="400" fontStyle="italic" fontSize="14" fill="#EC6C12" letterSpacing="1">La finance, autrement.</text>
    </svg>
  );
}

/* ——— 9. Lexend — ultra lisible + badge pill ——— */
function Logo9() {
  return (
    <svg width="310" height="68" viewBox="0 0 470 96">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;900');`}</style>
      <text x="10" y="58" fontFamily="'Lexend', sans-serif" fontWeight="900" fontSize="48" fill="#1a1a1f" letterSpacing="-2">actidec</text>
      <rect x="280" y="30" width="80" height="28" rx="14" fill="#EC6C12" />
      <text x="296" y="50" fontFamily="'Lexend', sans-serif" fontWeight="400" fontSize="13" fill="white">PRO</text>
    </svg>
  );
}
function Logo9D() {
  return (
    <svg width="310" height="68" viewBox="0 0 470 96">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;900');`}</style>
      <text x="10" y="58" fontFamily="'Lexend', sans-serif" fontWeight="900" fontSize="48" fill="white" letterSpacing="-2">actidec</text>
      <rect x="280" y="30" width="80" height="28" rx="14" fill="#EC6C12" />
      <text x="296" y="50" fontFamily="'Lexend', sans-serif" fontWeight="400" fontSize="13" fill="white">PRO</text>
    </svg>
  );
}

/* ——— 10. Tenor Sans — minimaliste chic lowercase ——— */
function Logo10() {
  return (
    <svg width="300" height="72" viewBox="0 0 460 100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Tenor+Sans');`}</style>
      <defs>
        <linearGradient id="v5t" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EC6C12" />
          <stop offset="100%" stopColor="#7C4FA0" />
        </linearGradient>
      </defs>
      <text x="10" y="60" fontFamily="'Tenor Sans', sans-serif" fontSize="50" fill="#1a1a1f" letterSpacing="4">actidec</text>
      <line x1="10" y1="70" x2="340" y2="70" stroke="url(#v5t)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function Logo10D() {
  return (
    <svg width="300" height="72" viewBox="0 0 460 100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Tenor+Sans');`}</style>
      <defs>
        <linearGradient id="v5td" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B98ADA" />
        </linearGradient>
        <filter id="v5tg">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#EC6C12" floodOpacity="0.3" />
        </filter>
      </defs>
      <text x="10" y="60" fontFamily="'Tenor Sans', sans-serif" fontSize="50" fill="white" letterSpacing="4">actidec</text>
      <line x1="10" y1="70" x2="340" y2="70" stroke="url(#v5td)" strokeWidth="2.5" strokeLinecap="round" filter="url(#v5tg)" />
    </svg>
  );
}

const logos = [
  { n: 1, title: "Raleway — thin vs bold contrast", light: <Logo1 />, dark: <Logo1D /> },
  { n: 2, title: "Poppins — rounded + barre gradient", light: <Logo2 />, dark: <Logo2D /> },
  { n: 3, title: "Bebas Neue — condensed impact caps", light: <Logo3 />, dark: <Logo3D /> },
  { n: 4, title: "Crimson Pro — serif book ornementé", light: <Logo4 />, dark: <Logo4D /> },
  { n: 5, title: "Josefin Sans — art déco séparé", light: <Logo5 />, dark: <Logo5D /> },
  { n: 6, title: "Fraunces — wonky serif expressif", light: <Logo6 />, dark: <Logo6D /> },
  { n: 7, title: "Manrope — startup badge + tagline", light: <Logo7 />, dark: <Logo7D /> },
  { n: 8, title: "Bodoni Moda — haute couture caps", light: <Logo8 />, dark: <Logo8D /> },
  { n: 9, title: "Lexend — ultra lisible + pill PRO", light: <Logo9 />, dark: <Logo9D /> },
  { n: 10, title: "Tenor Sans — minimaliste + trait gradient", light: <Logo10 />, dark: <Logo10D /> },
];

export function LogoShowcase() {
  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Logo — 10 variantes v5</h1>
        <p className="text-sm text-gray-500 mt-1">Nouvelles fonts, nouveaux styles. Clair + sombre.</p>
      </div>

      {logos.map(({ n, title, light, dark }) => (
        <div key={n}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">#{n} — {title}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card n={n} title="clair">{light}</Card>
            <DarkCard n={n} title="sombre">{dark}</DarkCard>
          </div>
        </div>
      ))}
    </div>
  );
}
