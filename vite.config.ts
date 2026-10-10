import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * GitHub Pages serves a project site from /<repo>/. The repo is "snake-game";
 * override with BASE_PATH=/ for a user site or a custom domain.
 */
const base = process.env.BASE_PATH ?? '/snake-game/';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * The service worker (public/sw.js) is hand-written. After the build this
 * plugin fills in the list of files to precache and a version derived from
 * their contents, so a new deploy replaces the old cache and the game works
 * offline right after the first visit.
 */
function serviceWorkerPrecache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'snake:sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js');
      const files = listFiles(outDir)
        .map((file) => relative(outDir, file).split(sep).join('/'))
        .filter((file) => file !== 'sw.js' && !file.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      const version = hash.digest('hex').slice(0, 12);

      const source = readFileSync(swPath, 'utf8');
      if (!source.includes('self.__PRECACHE_MANIFEST__') || !source.includes('__BUILD_VERSION__')) {
        throw new Error('sw.js is missing its precache placeholders');
      }
      const output = source
        .replace('self.__PRECACHE_MANIFEST__', JSON.stringify(files))
        .replace('__BUILD_VERSION__', version);
      writeFileSync(swPath, output);
    },
  };
}

export default defineConfig({
  base,
  plugins: [serviceWorkerPrecache()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
