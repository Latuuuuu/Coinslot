import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve, type ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import { log } from '../log.js';

/**
 * Built frontend. Compiled: dist/web/server.js → dist/public. Under tsx (src/web)
 * the same build output is at ../../dist/public.
 */
export const DEFAULT_STATIC_DIR =
  ['../public', '../../dist/public']
    .map((rel) => fileURLToPath(new URL(rel, import.meta.url)))
    .find((dir) => existsSync(dir)) ?? fileURLToPath(new URL('../public', import.meta.url));

export function startWebServer(app: Hono, host: string, port: number): ServerType {
  return serve({ fetch: app.fetch, hostname: host, port }, (info) =>
    log.info(`Web UI listening on http://${host}:${info.port}`),
  );
}
