const sharp = require('sharp');

async function generateIcon(size, outPath) {
  const r = Math.round(size * 0.22); // corner radius
  const triW = Math.round(size * 0.60); // triangle base = 60% of canvas
  const triH = Math.round(triW * 0.866); // equilateral: h = w * sqrt(3)/2

  const cx = size / 2;
  // Centroid at 1/3 from base. Place centroid at canvas center.
  // centroidY = topY + 2/3 * triH = size/2  =>  topY = size/2 - 2/3 * triH
  const topY = Math.round(size / 2 - (2 / 3) * triH);
  const botY = topY + triH;
  const leftX = Math.round(cx - triW / 2);
  const rightX = Math.round(cx + triW / 2);

  console.log(`[${size}px] triangle: top=${topY} bot=${botY} left=${leftX} right=${rightX} triW=${triW} triH=${triH} radius=${r}`);

  // Step 1: Create full square icon (no rounding yet)
  const iconSvg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0a0d12"/>
  <polygon points="${cx},${topY} ${rightX},${botY} ${leftX},${botY}" fill="#ffffff"/>
</svg>`;

  const iconBuffer = await sharp(Buffer.from(iconSvg))
    .flatten({ background: { r: 10, g: 13, b: 18 } })
    .png()
    .toBuffer();

  // Step 2: Create rounded-rect mask (white rounded rect on transparent)
  const maskSvg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/>
</svg>`;

  const maskBuffer = await sharp(Buffer.from(maskSvg)).png().toBuffer();

  // Step 3: Composite with dest-in to clip corners
  const result = await sharp(iconBuffer)
    .composite([{ input: maskBuffer, blend: 'dest-in' }])
    .png()
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  const stats = require('fs').statSync(outPath);
  console.log(`${outPath}: ${meta.width}x${meta.height}, ${stats.size} bytes, channels=${meta.channels}, hasAlpha=${meta.hasAlpha}`);
}

async function main() {
  await generateIcon(512, 'public/icon-512.png');
  await generateIcon(192, 'public/icon-192.png');
  await generateIcon(48, 'public/favicon-48.png');
  await generateIcon(32, 'public/favicon.png');
  console.log('Done!');
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
