import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages ではサブパス (/cc-inflation-game-01/) で公開されるので、相対パスで出力する
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
