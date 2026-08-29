import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {cpSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

export default defineConfig({
  plugins: [react(), {
    name: 'self-host-excalidraw-fonts',
    closeBundle() {
      const target = resolve('dist/excalidraw-assets');
      mkdirSync(target, {recursive: true});
      cpSync(resolve('node_modules/@excalidraw-yjs/excalidraw/dist/prod/fonts'), target, {recursive: true});
    },
  }],
  server: {port: 5173},
  test: {include: ['src/**/*.test.ts']},
});
