import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Pretext-Game/',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
})
