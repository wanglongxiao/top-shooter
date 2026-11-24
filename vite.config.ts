import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: {
    // The offline edition intentionally embeds Three.js and the game in one bundle.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
