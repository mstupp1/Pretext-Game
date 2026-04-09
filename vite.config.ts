import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop'

  return {
    base: isDesktop ? './' : '/Pretext-Game/',
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
      watch: {
        ignored: ['**/electron-dist/**', '**/release/**'],
      },
    },
    build: {
      outDir: isDesktop ? 'dist-desktop' : 'dist',
      assetsInlineLimit: 0,
    },
  }
})
