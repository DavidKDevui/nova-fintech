/**
 * Icônes SVG partagées de la landing ActiDec.
 * Le style (stroke / fill / taille) est piloté par le CSS du contexte parent
 * (.btn svg, .feat .ic svg, .testi .stars svg, …), donc chaque icône ne rend
 * que le <svg viewBox="0 0 24 24"> + ses tracés.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      {children}
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icon>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

/** Symbole « € / flux d'argent » — provisions, salaire à se verser. */
export function IconEuroFlow(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M5 8h11a3 3 0 010 6H9a3 3 0 000 6h11" />
    </Icon>
  );
}

/** Courbe ascendante — trésorerie / évolution. */
export function IconTrend(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17l5-5 4 4 8-9" />
      <path d="M14 7h6v6" />
    </Icon>
  );
}

export function IconStar(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
    </Icon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Silhouette « utilisateur » — placeholder portrait témoignage. */
export function IconUser(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0114 0v1" />
    </Icon>
  );
}
