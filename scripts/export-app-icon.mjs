import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Render the SnapQuote brand mark as a 1024x1024 App Store icon.
// No transparency, no rounded corners — Apple's asset pipeline applies
// the rounded mask at display time.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3FA1F7"/>
      <stop offset="100%" stop-color="#174BB7"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="1024" fill="url(#bg)"/>
  <g transform="translate(512 512) scale(13) translate(-55 -44.5)">
    <path d="M50.5 18L35 48H51L42 71L75 36H59L68 18H50.5Z"
          fill="#ffffff" stroke="#ffffff" stroke-width="1" stroke-linejoin="round"/>
  </g>
</svg>`;

const out = resolve(process.cwd(), "AppIcon-1024.png");
const buf = await sharp(Buffer.from(svg))
  .flatten({ background: "#174BB7" })
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(out, buf);
console.log("wrote", out, buf.length, "bytes");
