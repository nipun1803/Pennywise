const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  mocks = { 'expo-constants': { default: {} }, ...mocks };
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`); return mocks[name]; }, process: { env: {} }, setTimeout, clearTimeout, AbortController, ...globals }, { filename: file });
  return exports;
}
const invite = load('lib/invite.ts', { 'expo-linking': { createURL: () => '' }, 'react-native': { Share: {} }, '@/lib/api': { errorMessage: () => '' }, '@/lib/format': load('lib/format.ts') });
const { palette } = load('theme/palette.ts');

test('scanned codes accept bare codes and join links but reject malformed escapes', () => {
  assert.equal(invite.codeFromScan(' k7m2qx '), 'K7M2QX');
  assert.equal(invite.codeFromScan('pennywise://join?code=k7m2qx'), 'K7M2QX');
  assert.equal(invite.codeFromScan('exp://host/--/join?x=1&code=%4B7M2QX#top'), 'K7M2QX');
  for (const invalid of ['pennywise://join?code=%', 'pennywise://join?code=%E0%A4%A', 'pennywise://join?code=I0O1LZ', 'https://example.com', '']) assert.equal(invite.codeFromScan(invalid), null);
});
test('light positive text meets WCAG AA contrast on every light surface', () => {
  const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const surface of ['background', 'surface', 'raised', 'tint', 'segment']) assert.ok(contrast(palette.light.positive, palette.light[surface]) >= 4.5, `${surface} ${contrast(palette.light.positive, palette.light[surface]).toFixed(2)}`);
});
