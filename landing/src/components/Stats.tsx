"use client";

import { useEffect, useRef, useState } from "react";

const STATS = [
  {
    to: 2700,
    decimals: 0,
    unit: "€",
    label: "d'économies moyennes par an et par praticien",
  },
  {
    to: 0,
    decimals: 0,
    unit: "€",
    label: "de découvert imprévu signalé par nos utilisateurs",
  },
  {
    to: 5,
    decimals: 0,
    unit: "min",
    label: "pour relier son compte et tout configurer",
  },
  {
    to: 4.8,
    decimals: 1,
    unit: "/5",
    label: "note moyenne des soignants accompagnés",
  },
];

const numberFormat = new Intl.NumberFormat("fr-FR");
const DURATION = 1400;

function format(value: number, decimals: number) {
  if (decimals > 0) return value.toFixed(decimals).replace(".", ",");
  return numberFormat.format(Math.round(value));
}

function Counter({ to, decimals }: { to: number; decimals: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(() => format(0, decimals));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let started = false;

    const run = () => {
      let start: number | null = null;
      const step = (ts: number) => {
        if (start === null) start = ts;
        const p = Math.min((ts - start) / DURATION, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(format(to * eased, decimals));
        if (p < 1) frame = requestAnimationFrame(step);
        else setDisplay(format(to, decimals));
      };
      frame = requestAnimationFrame(step);
    };

    if (typeof IntersectionObserver === "undefined") {
      run();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            run();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, decimals]);

  return (
    <span ref={ref} className="count">
      {display}
    </span>
  );
}

export function Stats() {
  return (
    <section className="block stats-band">
      <div className="wrap">
        <div className="stats">
          {STATS.map((stat) => (
            <div key={stat.label} className="stat">
              <div className="v">
                <Counter to={stat.to} decimals={stat.decimals} />
                <span className="u">{stat.unit}</span>
              </div>
              <div className="l">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
