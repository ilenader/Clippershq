const sharp = require('sharp');

/**
 * Generate a rounded-corner icon with a visually centered equilateral triangle.
 *
 * For an equilateral triangle pointing up, the centroid (visual center) is
 * 1/3 of the height from the base. To make it LOOK centered, we position
 * the centroid at the canvas center, which means the top vertex is higher
 * and the base is lower than a naive center.
 */
function iconSvg(size) {
  const r = Math.round(size * 0.22); // corner radius (22%)
  const triW = Math.round(size * 0.58); // base width (58% of canvas)
  const triH = Math.round(triW * 0.866); // equilateral height = width * sqrt(3)/2

  const cx = size / 2; // horizontal center

  // Centroid of equilateral triangle is at 1/3 height from the base.
  // We want the centroid at canvas center (size/2).
  // centroid_y = topY + (2/3)*triH = size/2
  // topY = size/2 - (2/3)*triH
  const topY = Math.round(size / 2 - (2 / 3) * triH);
  const botY = topY + triH;
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
