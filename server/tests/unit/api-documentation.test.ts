import { readFileSync } from 'node:fs';
import path from 'node:path';

test('feature tables document every registered endpoint exactly once', () => {
  // Tests execute from server/.test-dist/tests/unit after TypeScript compilation.
  const server = path.resolve(__dirname, '../../..');
  const routes = readFileSync(path.join(server, 'src/routes/index.ts'), 'utf8');
  const app = readFileSync(path.join(server, 'src/app.ts'), 'utf8');
  const documentation = readFileSync(path.join(server, '../docs/api.md'), 'utf8');
  const expected: string[] = [];
  for (const match of routes.matchAll(/\b(router|member)\.(get|post|put|patch|delete)\('([^']+)'/g)) {
    const prefix = match[1] === 'member' ? '/groups/:id' : '';
    expected.push(`${match[2]!.toUpperCase()} ${(prefix + match[3]!).replace(/\/$/, '')}`);
  }
  for (const match of app.matchAll(/\bapp\.(get|post|put|patch|delete)\('([^']+)'/g)) {
    expected.push(`${match[1]!.toUpperCase()} ${match[2]}`);
  }
  const documented = [...documentation.matchAll(/^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)` \|/gm)]
    .map(match => `${match[1]} ${match[2]}`);
  expect(expected).toHaveLength(35);
  expect(new Set(documented).size).toBe(documented.length);
  expect(documented.sort()).toEqual(expected.sort());
});
