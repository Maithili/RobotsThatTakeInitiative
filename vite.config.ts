import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the build works at https://<user>.github.io/<repo>/ with HashRouter.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
