import { createApp } from '../../src/app';

interface Layer {
  rawPath?: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
}

const join = (prefix: string, path: string) => prefix + (path === '/' ? '' : path);

// Walks the live Express router tree, so tests see exactly what the app serves
// no matter how routes are split across files or mounted.
export function registeredRoutes() {
  const app = createApp({ jwtSecret: 'x'.repeat(32), corsOrigins: [] });
  const found: { method: string; path: string }[] = [];
  const walk = (stack: Layer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) found.push({ method, path: join(prefix, layer.route.path) || '/' });
      } else if (layer.handle.stack) {
        walk(layer.handle.stack, join(prefix, layer.rawPath ?? '/'));
      }
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack, '');
  return found;
}
