import Link from "next/link";

export function Logo({ size = "default", variant = "dark" }: { size?: "small" | "default" | "large"; variant?: "dark" | "light" }) {
  const dimensions = {
    small: { width: 124, height: 33 },
    default: { width: 164, height: 44 },
    large: { width: 220, height: 59 },
  };

  const { width, height } = dimensions[size];
  // Lettres en violet de marque sur fond clair, blanc sur fond sombre (charte ActiDec v3)
  const textColor = variant === "light" ? "#FFFFFF" : "#5C3A8A";
  // Orange CTA — capitales A/D + point "pouls" (charte : couleur d'accent du wordmark)
  const accent = "#EC6C12";

  return (
    <Link href="/" className="inline-block select-none" draggable={false}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 180 48"
        width={width}
        height={height}
        aria-label="ActiDec"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@700');`}</style>
        <text
          x="2"
          y="35"
          fontFamily="'DM Sans', system-ui, -apple-system, sans-serif"
          fontWeight="700"
          fontSize="30"
          letterSpacing="-1.5"
        >
          <tspan fill={accent}>A</tspan>
          <tspan fill={textColor}>cti</tspan>
          <tspan fill={accent}>D</tspan>
          <tspan fill={textColor}>ec</tspan>
        </text>
        {/* Point "pouls" rond (charte ActiDec v3) — cercle vectoriel, jamais un glyphe carré */}
        <circle className="logo-pulse" cx="123" cy="31" r="3.4" fill={accent} />
      </svg>
    </Link>
  );
}
