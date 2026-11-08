import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

function buildIdentity() {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() ? '-dirty' : '';
    return `${commit}${dirty}@${new Date().toISOString()}`;
  } catch { return null; }
}

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  define: { __TINANAI_BUILD_ID__: JSON.stringify(buildIdentity()) },
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: [
      {
        find: /^\.\/(?:generated\/)?api\.schemas$/,
        replacement: path.resolve(import.meta.dirname, '../../lib/api-client-react/src/generated/api.schemas.ts'),
      },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
      { find: '@assets', replacement: path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ) },
    ],
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    // The wallet provider is an intentional lazy chunk; the build script enforces
    // separate initial-route and wallet-specific budgets.
    chunkSizeWarningLimit: 1800,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
