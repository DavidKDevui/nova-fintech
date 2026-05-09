import Link from "next/link";

export function Logo({ size = "default", variant = "dark" }: { size?: "small" | "default" | "large"; variant?: "dark" | "light" }) {
  const dimensions = {
    small: { width: 150, height: 40 },
    default: { width: 200, height: 52 },
    large: { width: 270, height: 70 },
  };

  const { width, height } = dimensions[size];
  const textColor = variant === "light" ? "white" : "#1a1a1f";
  const subColor = variant === "light" ? "#EC6C12" : "#9060B6";

  return (
    <Link href="/" className="inline-block select-none" draggable={false}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 340 72"
        width={width}
        height={height}
        aria-label="Actidec"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;800');`}</style>
        <text
          x="10"
          y="42"
          fontFamily="'Manrope', system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="42"
          fill={textColor}
          letterSpacing="-2"
        >
          actidec
        </text>
        <text
          x="10"
          y="60"
          fontFamily="'Manrope', system-ui, -apple-system, sans-serif"
          fontWeight="300"
          fontSize="12"
          fill={subColor}
        >
          Votre expert-comptable digital
        </text>
      </svg>
    </Link>
  );
}
