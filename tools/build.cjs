const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const sources = ['server', 'shared/domain', 'js', 'css', 'data'].flatMap(dir => walk(path.join(root, dir)))
  .concat(fs.readdirSync(root).filter(f => f.endsWith('.html') || ['sw.js','package.json','package-lock.json'].includes(f)).map(f => path.join(root, f)));
for (const source of sources) {
  if (source.endsWith('.js') && !source.includes('/vendor/')) execFileSync(process.execPath, ['--check', source]);
  if (source.endsWith('.json')) JSON.parse(fs.readFileSync(source, 'utf8'));
  if (!source.endsWith('.html')) continue;
  const html = fs.readFileSync(source, 'utf8');
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=|type=["']application\/json/.test(script[1])) new vm.Script(script[2], { filename: source });
  }
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const target = match[1].split(/[?#]/)[0];
    if (!target || /^(https?:|data:|mailto:|tel:)/.test(target) || target.includes('${')) continue;
    if (!fs.existsSync(path.join(root, target))) throw new Error('Missing local reference: ' + target + ' in ' + source);
  }
}
fs.rmSync(output, { recursive: true, force: true });
for (const source of sources) {
  const target = path.join(output, path.relative(root, source));
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
}
const hash = crypto.createHash('sha256');
for (const source of sources.sort()) hash.update(path.relative(root, source)).update(fs.readFileSync(source));
const release = { version: require('../package.json').version, builtAt: new Date().toISOString(), files: sources.length, sha256: hash.digest('hex') };
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n');
console.log('Production build ready:', JSON.stringify(release));
