import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openapi } from '../../src/openapi';

test('OpenAPI documents every registered backend operation', () => {
  const server = path.resolve(__dirname, '../../..');
  const expected = [];
  const routes = readFileSync(path.join(server, 'src/routes/index.ts'), 'utf8');
  for (const match of routes.matchAll(/\b(router|member)\.(get|post|put|patch|delete)\('([^']+)'/g)) {
    const route = ((match[1] === 'member' ? '/groups/:id' : '') + match[3]).replace(/\/$/, '').replace(/:([a-z]+)/g, '{$1}');
    expected.push(`${match[2]} ${route}`);
  }
  const app = readFileSync(path.join(server, 'src/app.ts'), 'utf8');
  for (const match of app.matchAll(/\bapp\.(get|post|put|patch|delete)\('([^']+)'/g)) expected.push(`${match[1]} ${match[2]}`);
  const actual = Object.entries(openapi.paths).flatMap(([route, operations]) => Object.keys(operations).map(method => `${method} ${route}`));
  expect(actual.sort()).toEqual(expected.sort());
});
