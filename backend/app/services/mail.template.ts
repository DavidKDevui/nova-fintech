type BlockType = "title" | "text" | "button" | "divider";

interface TitleBlock {
  type: "title";
  content: string;
}

interface TextBlock {
  type: "text";
  content: string;
}

interface ButtonBlock {
  type: "button";
  label: string;
  url: string;
}

interface DividerBlock {
  type: "divider";
}

type Block = TitleBlock | TextBlock | ButtonBlock | DividerBlock;

function renderBlock(block: Block): string {
  switch (block.type) {
    case "title":
      return `<h1 style="color:#1a1a1a;font-size:24px;font-weight:700;margin:0 0 16px">${block.content}</h1>`;
    case "text":
      return `<p style="color:#4a4a4a;font-size:16px;line-height:1.5;margin:0 0 16px">${block.content}</p>`;
    case "button":
      return `<a href="${block.url}" style="display:inline-block;background:#2563eb;color:#fff;font-size:16px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;margin:16px 0">${block.label}</a>`;
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">`;
  }
}

export function buildMailHtml(blocks: Block[]): string {
  const content = blocks.map(renderBlock).join("\n");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:40px">
          <tr>
            <td>
              ${content}
            </td>
          </tr>
        </table>
        <p style="color:#999;font-size:12px;margin-top:24px">Nova Fintech</p>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
