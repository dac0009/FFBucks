import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a project site from /<repo>/. The deploy workflow sets
// BASE_PATH from the repository name, so renaming the repo just works.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/FFBucks/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
