import Image from "next/image";
import { IconStar } from "./icons";

export function Testimonial() {
  return (
    <section className="block">
      <div className="wrap testi">
        <div className="photo">
          {/* Photo Unsplash (licence Unsplash, libre d'usage commercial) — /public/temoignage-soignante.jpg */}
          <Image
            src="/temoignage-soignante.jpg"
            alt="Camille Lefort, infirmière libérale à Lyon"
            fill
            sizes="(max-width: 960px) 100vw, 40vw"
            className="ph"
            priority={false}
          />
        </div>
        <div>
          <div className="stars">
            {Array.from({ length: 5 }).map((_, i) => (
              <IconStar key={i} />
            ))}
          </div>
          <p className="quote">
            «&nbsp;Avant, je découvrais le montant de l&apos;URSSAF la veille du
            prélèvement. Maintenant,{" "}
            <span className="hl">tout est provisionné automatiquement</span>{" "}
            et je sais exactement ce que je peux me verser chaque mois.&nbsp;»
          </p>
          <div className="who">
            <div>
              <div className="nm">Camille Lefort</div>
              <div className="ro">Infirmière libérale · Lyon</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
