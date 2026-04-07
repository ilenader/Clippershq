const sharp = require('sharp');

const svg = (size) => {
  const triSize = Math.round(size * 0.35);
  const cx = size / 2;
  const cy = size / 2;
  const topY = Math.round(cy - triSize / 2);
  const botY = Math.round(cy + triSize / 2);
  const leftX = Math.round(cx - triSize / 2);
  const rightX = Math.round(cx + triSize / 2);

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0a0d12"/>
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${Math.round(size * 0.01)}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <polygon points="${cx},${topY} ${rightX},${botY} ${leftX},${botY}" fill="white" filter="url(#glow)"/>
</svg>`;
};

async function main() {
  await sharp(Buffer.from(svg(192))).png().toFile('public/icon-192.png');
  console.log('Generated public/icon-192.png');
  await sharp(Buffer.from(svg(512))).png().toFile('public/icon-512.png');
  console.log('Generated public/icon-512.png');
}

main().catch(console.error);
