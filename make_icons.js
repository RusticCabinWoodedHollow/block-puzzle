const fs = require('fs');
const path = require('path');
const cells = [
  ['#00f0ff', 0, 0, 1], ['#4dff9e', 1, 0, 1], ['#00f0ff', 2, 0, 1],
  ['#e64dff', 0, 1, 1], ['#ffe14d', 1, 1, 1], ['#00f0ff', 2, 1, 1],
  ['#4dff9e', 0, 2, 1], ['#00f0ff', 1, 2, 1], ['#e64dff', 2, 2, 1],
];
function svg(size, fullBleed) {
  const u = size / 512;
  const bg = fullBleed ? '#040a16' : '#040a16';
  const R = fullBleed ? 0 : 96 * u;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">`;
  s += `<rect width="512" height="512" rx="${R}" fill="${bg}"/>`;
  s += `<rect x="${40*u}" y="${40*u}" width="${432*u}" height="${432*u}" rx="${52*u}" fill="none" stroke="#00f0ff" stroke-opacity="0.55" stroke-width="${8*u}"/>`;
  for (const [c, cx, cy, op] of cells) {
    const x = (96 + cx * 112) * u, y = (96 + cy * 112) * u;
    s += `<rect x="${x}" y="${y}" width="${96*u}" height="${96*u}" rx="${20*u}" fill="${c}" opacity="${op}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="${3*u}"/>`;
  }
  s += '</svg>';
  return s;
}
const icons = path.join(__dirname, 'icons');
fs.mkdirSync(icons, { recursive: true });
fs.writeFileSync(path.join(icons, 'icon-512.svg'), svg(512, false));
fs.writeFileSync(path.join(icons, 'icon-maskable-512.svg'), svg(512, true));
fs.writeFileSync(path.join(icons, 'favicon.svg'), svg(32, false));
console.log('svg ok');
