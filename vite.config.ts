import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {exclude: ['@tldraw/assets/imports.vite']},
  server: {port: 5173},
  test: {include: ['src/**/*.test.ts']},
});
