// Génère favicon.ico (multi-tailles, PNG embarqué) à partir de src/app/icon.svg.
// Usage : node scripts/gen-favicon.cjs
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const svgPath = path.join(root, "src/app/icon.svg");
const svg = fs.readFileSync(svgPath);
const sizes = [16, 32, 48, 64];

(async () => {
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(svg, { density: 384 })
        .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    ),
  );

  // Aperçu pour vérification visuelle
  await sharp(svg, { density: 384 }).resize(128, 128).png().toFile(path.join(root, "scripts/_favicon-preview.png"));

  // En-tête ICONDIR
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + 16 * sizes.length;
  pngs.forEach((png, i) => {
    const s = sizes[i];
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0); // width
    e.writeUInt8(s >= 256 ? 0 : s, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8); // size of image data
    e.writeUInt32LE(offset, 12); // offset
    offset += png.length;
    entries.push(e);
  });

  const ico = Buffer.concat([header, ...entries, ...pngs]);
  fs.writeFileSync(path.join(root, "src/app/favicon.ico"), ico);
  console.log(`favicon.ico écrit : ${ico.length} octets, tailles ${sizes.join(", ")}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
