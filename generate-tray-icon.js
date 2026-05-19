const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');

const svg = `<svg width="64" height="64" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="256" y2="256" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#1e40af"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="52" fill="url(#g)"/>
  <line x1="88" y1="52"  x2="88"  y2="204" stroke="white"   stroke-width="22" stroke-linecap="round"/>
  <line x1="88" y1="128" x2="178" y2="52"  stroke="white"   stroke-width="22" stroke-linecap="round"/>
  <path d="M88,128 C118,158 152,182 182,200" stroke="#4ade80" stroke-width="22" stroke-linecap="round" fill="none"/>
</svg>`;

const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 64 } });
const pngBuf = resvg.render().asPng();
fs.writeFileSync('public/tray-icon.png', pngBuf);
console.log('✅ tray-icon.png généré (64×64)');
