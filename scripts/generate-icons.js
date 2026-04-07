const sharp = require('sharp');

/**
 * Generate a rounded-corner icon SVG with a large centered triangle.
 * Triangle takes ~62% of the canvas. Rounded corners are ~20% radius.
 */
function iconSvg(size) {
  const r = Math.round(size * 0.2); // corner radius
  const triH = Math.round(size * 0.52); // triangle height
  const triW = Math.round(size * 0.54); // triangle base width
  const cx = size / 2;
  const cy = size / 2 + Math.round(size * 0.03); // nudge down slightly for visual centering
  const topY = Math.round(cy - triH / 2);
  const botY = Math.round(cy + triH / 2);
  const leftX = Math.round(cx - triW / 2);
  const rightX = Math.round(cx + triW / 2);

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="rounded">
      <rect width="${size}" height="${size}" rx="${r}" ry="${r}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#rounded)">
    <rect width="${size}" height="${size}" fill="#0a0d12"/>
    <polygon points="${cx},${topY} ${rightX},${botY} ${leftX},${botY}" fill="#ffffff"/>
  </g>
</svg>`;
}

async function generate(size, outPath) {
  await sharp(Buffer.from(iconSvg(size)))
    .flatten({ background: { r: 10, g: 13, b: 18 } })
    .png()
    .toFile(outPath);
  const m = await sharp(outPath).metadata();
  console.log(`${outPath}: ${m.width}x${m.height}, channels=${m.channels}, hasAlpha=${m.hasAlpha}`);
}

async function main() {
  await generate(512, 'public/icon-512.png');
  await generate(192, 'public/icon-192.png');
  await generate(48, 'public/favicon-48.png');
  await generate(32, 'public/favicon.png');
}

main().catch(console.error);
