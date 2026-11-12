import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
export default defineConfig({
  // Keep renderer dependencies cacheable separately from application updates.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /three[\\/]build[\\/]three.core.js$/ },
            {
              name: 'three-renderer',
              test: /three[\\/]build[\\/]three.module.js$/,
            },
          ],
        },
      },
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: '127.0.0.1',
    port: 4317,
    watch: { useFsEvents: false, usePolling: true },
  },
  plugins: [vinext()],
});
