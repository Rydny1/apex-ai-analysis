import { defineConfig } from 'vitest/config';
import path from 'path';

// Mirrors the "@/*" import alias from tsconfig.json so tests can import the same
// way the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
