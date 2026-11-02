import { readFileSync, writeFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), {
    name: 'fixodds-offline-assets',
    apply: 'build',
    closeBundle() {
      // Precache the shell's actual hashed imports. Lazy features are cached on use.
      const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
      const assets = new Set<string>();
      function visit(key: string) {
        const row = manifest[key];
        if (!row || assets.has('./' + row.file)) return;
        assets.add('./' + row.file);
        for (const file of [...(row.css || []), ...(row.assets || [])]) assets.add('./' + file);
        for (const imported of row.imports || []) visit(imported);
      }
      visit('index.html');
      const worker = readFileSync('public/sw.js', 'utf8').replace('/* BUILD_ASSETS */ []', JSON.stringify([...assets]));
      writeFileSync('dist/sw.js', worker);
    },
  }],
  build: { manifest: true },
  test: { include: ['src/**/*.test.ts'] },
});
