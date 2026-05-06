// ── Block types ──

interface TitleBlock {
  type: "title";
  content: string;
}

interface SubtitleBlock {
  type: "subtitle";
  content: string;
}

interface TextBlock {
  type: "text";
  content: string;
  muted?: boolean;
}

interface ButtonBlock {
  type: "button";
  label: string;
  url: string;
  icon?: "arrow-right" | "lock" | "check" | "mail";
  variant?: "primary" | "secondary";
}

interface DividerBlock {
  type: "divider";
}

interface InfoBlock {
  type: "info";
  content: string;
}

interface ListBlock {
  type: "list";
  items: string[];
}

interface SpacerBlock {
  type: "spacer";
  size?: "sm" | "md" | "lg";
}

export type Block =
  | TitleBlock
  | SubtitleBlock
  | TextBlock
  | ButtonBlock
  | DividerBlock
  | InfoBlock
  | ListBlock
  | SpacerBlock;

// ── Design tokens ──

const BRAND = {
  orange600: "#EC6C12",
  orange700: "#C2580F",
  orange50: "#FFF7ED",
  orange100: "#FFEDD5",
  orange200: "#FED7AA",
  slate900: "#0f172a",
  slate700: "#334155",
  slate500: "#64748b",
  slate200: "#e2e8f0",
  white: "#ffffff",
  bg: "#FFFCF9",
  font: "'Sora', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

// ── Logo SVG (inline, same as logo.tsx) ──

const LOGO_HTML = `<span style="font-family:${BRAND.font};font-size:28px;font-weight:800;letter-spacing:-0.04em;color:${BRAND.slate900};text-decoration:none">actidec</span>`;

// ── Icons (inline SVG, 14px) ──

function renderIcon(name: string, color: string): string {
  const s = `xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block"`;
  switch (name) {
    case "arrow-right":
      return `<svg ${s}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
    case "lock":
      return `<svg ${s}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    case "check":
      return `<svg ${s}><polyline points="20 6 9 17 4 12"/></svg>`;
    case "mail":
      return `<svg ${s}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
    default:
      return "";
  }
}

// ── Block renderers ──

const SPACER_PX = { sm: 8, md: 16, lg: 32 } as const;

function renderBlock(block: Block): string {
  switch (block.type) {
    case "title":
      return `<h1 style="color:${BRAND.slate900};font-family:${BRAND.font};font-size:24px;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em">${block.content}</h1>`;

    case "subtitle":
      return `<p style="color:${BRAND.slate500};font-family:${BRAND.font};font-size:14px;font-weight:500;margin:0 0 24px;letter-spacing:-0.01em">${block.content}</p>`;

    case "text":
      return `<p style="color:${block.muted ? BRAND.slate500 : BRAND.slate700};font-family:${BRAND.font};font-size:15px;line-height:1.6;margin:0 0 16px">${block.content}</p>`;

    case "button": {
      const isPrimary = block.variant !== "secondary";
      const bg = isPrimary ? BRAND.orange600 : "transparent";
      const color = isPrimary ? BRAND.white : BRAND.orange600;
      const border = isPrimary ? "none" : `2px solid ${BRAND.orange200}`;
      const iconColor = isPrimary ? BRAND.white : BRAND.orange600;
      const icon = renderIcon(block.icon ?? "arrow-right", iconColor);
      return `<table cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="border-radius:6px;background:${bg}" align="center">
        <a href="${block.url}" style="display:inline-block;font-family:${BRAND.font};font-size:13px;font-weight:600;color:${color};text-decoration:none;padding:10px 20px;border:${border};border-radius:6px">${block.label} &nbsp;${icon}</a>
      </td></tr></table>`;
    }

    case "divider":
      return `<hr style="border:none;border-top:1px solid ${BRAND.slate200};margin:24px 0">`;

    case "info":
      return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0"><tr>
        <td style="background:${BRAND.orange50};border-left:3px solid ${BRAND.orange600};border-radius:0 6px 6px 0;padding:14px 16px">
          <p style="color:${BRAND.slate700};font-family:${BRAND.font};font-size:14px;line-height:1.5;margin:0">${block.content}</p>
        </td>
      </tr></table>`;

    case "list":
      return `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px">
        ${block.items.map((item) => `<tr><td style="padding:4px 0;color:${BRAND.orange600};font-size:16px;vertical-align:top;padding-right:10px">&bull;</td><td style="color:${BRAND.slate700};font-family:${BRAND.font};font-size:15px;line-height:1.5;padding:4px 0">${item}</td></tr>`).join("")}
      </table>`;

    case "spacer":
      return `<div style="height:${SPACER_PX[block.size ?? "md"]}px"></div>`;
  }
}

// ── Main builder ──

export function buildMailHtml(blocks: Block[]): string {
  const content = blocks.map(renderBlock).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.font}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:40px 0">
    <tr>
      <td align="center">
        <!-- Logo -->
        <table width="600" cellpadding="0" cellspacing="0"><tr><td style="padding:0 0 32px">
          ${LOGO_HTML}
        </td></tr></table>

        <!-- Content card -->
        <table width="600" cellpadding="0" cellspacing="0" style="background:${BRAND.white};border-radius:12px;border:1px solid ${BRAND.slate200}">
          <tr>
            <td style="padding:40px 44px">
              ${content}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="600" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 0;text-align:center">
          <p style="color:${BRAND.slate500};font-family:${BRAND.font};font-size:12px;margin:0">Actidec &mdash; Trésorerie pour professionnels de santé</p>
        </td></tr></table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
