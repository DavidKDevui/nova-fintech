import Link from "next/link";

export function Logo({ size = "default" }: { size?: "small" | "default" | "large" }) {
  const dimensions = {
    small: { width: 170, height: 44 },
    default: { width: 220, height: 58 },
    large: { width: 300, height: 78 },
  };

  const { width, height } = dimensions[size];

  return (
    <Link href="/" className="inline-block select-none" draggable={false}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 340 80"
        width={width}
        height={height}
        aria-label="Actidec"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <text
          x="10"
          y="58"
          fontFamily="'Sora', system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="52"
          fill="none"
          stroke="#0f172a"
          strokeWidth="1.5"
          letterSpacing="-2"
        >
          actidec
        </text>
        <text
          x="10"
          y="58"
          fontFamily="'Sora', system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="52"
          fill="#EC6C12"
          letterSpacing="-2"
          opacity="0.15"
        >
          actidec
        </text>
      </svg>
    </Link>
  );
}
