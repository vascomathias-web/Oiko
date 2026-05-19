// Génère icon.ico en écrivant le format ICO manuellement (PNG embarqué)
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const svg = `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
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

// Génère PNG 256×256
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } });
const pngBuf = resvg.render().asPng();
console.log('✅ PNG généré:', pngBuf.length, 'bytes');

// Format ICO : header + directory + PNG data
// ICO header (6 bytes)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);   // réservé
header.writeUInt16LE(1, 2);   // type = 1 (ICO)
header.writeUInt16LE(1, 4);   // nombre d'images = 1

// Directory entry (16 bytes)
const dir = Buffer.alloc(16);
dir.writeUInt8(0, 0);         // largeur 0 = 256
dir.writeUInt8(0, 1);         // hauteur 0 = 256
dir.writeUInt8(0, 2);         // nb couleurs palette (0 = pas de palette)
dir.writeUInt8(0, 3);         // réservé
dir.writeUInt16LE(1, 4);      // plans couleur
dir.writeUInt16LE(32, 6);     // bits par pixel
dir.writeUInt32LE(pngBuf.length, 8);  // taille de l'image
dir.writeUInt32LE(6 + 16, 12);        // offset de l'image (après header + dir)

const icoBuf = Buffer.concat([header, dir, pngBuf]);
const icoPath = path.join('build-resources', 'icon.ico');
fs.writeFileSync(icoPath, icoBuf);
console.log('✅ icon.ico généré :', icoBuf.length, 'bytes →', icoPath);
