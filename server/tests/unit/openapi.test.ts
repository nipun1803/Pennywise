import { openapi } from '../../src/openapi';
import { registeredRoutes } from './registered-routes';

test('OpenAPI documents every registered backend operation', () => {
  const expected = registeredRoutes().map(({ method, path }) => `${method} ${path.replace(/:([a-z]+)/g, '{$1}')}`);
  const actual = Object.entries(openapi.paths).flatMap(([route, operations]) => Object.keys(operations).map(method => `${method} ${route}`));
  expect(actual.sort()).toEqual(expected.sort());
});
