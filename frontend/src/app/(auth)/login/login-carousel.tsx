"use client";

import { useState, useEffect } from "react";

const slides = [
  {
    image: "/login-bg.jpg",
    title: "Votre trésorerie, simplifiée.",
    text: "Actidec vous aide à visualiser vos revenus, anticiper vos charges et piloter votre activité en toute sérénité.",
  },
  {
    image: "/login-bg-2.jpg",
    title: "Anticipez vos cotisations.",
    text: "Estimation automatique URSSAF, CARPIMKO et IR en fonction de votre chiffre d'affaires en temps réel.",
  },
  {
    image: "/login-bg-3.jpg",
    title: "Un tableau de bord sur mesure.",
    text: "Suivez l'évolution de vos revenus, dépenses et solde mois par mois en un coup d'œil.",
  },
];

export function LoginCarousel() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const slide = slides[current]!;

  return (
    <div className="h-full w-full rounded-[2rem] overflow-hidden relative animate-slide-in-right">
      {slides.map((s, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{
            backgroundImage: `url('${s.image}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: i === current ? 1 : 0,
          }}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 p-10">
        <div
          key={current}
          className="animate-fade-up"
        >
          <h2 className="text-3xl font-bold leading-tight text-white">
            {slide.title}
          </h2>
          <p className="mt-3 text-base text-white/80 leading-relaxed">
            {slide.text}
          </p>
        </div>

        <div className="flex gap-2 mt-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === current ? "w-8 bg-white" : "w-4 bg-white/40 hover:bg-white/60"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
