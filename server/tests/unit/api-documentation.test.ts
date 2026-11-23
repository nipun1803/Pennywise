import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registeredRoutes } from './registered-routes';

test('feature tables document every registered endpoint exactly once', () => {
  // Tests execute from server/.test-dist/tests/unit after TypeScript compilation.
  const server = path.resolve(__dirname, '../../..');
  const documentation = readFileSync(path.join(server, '../docs/api.md'), 'utf8');
  const expected = registeredRoutes().map(({ method, path }) => `${method.toUpperCase()} ${path}`);
  const documented = [...documentation.matchAll(/^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)` \|/gm)]
    .map(match => `${match[1]} ${match[2]}`);
  expect(expected).toHaveLength(35);
  expect(new Set(documented).size).toBe(documented.length);
  expect(documented.sort()).toEqual(expected.sort());
});
