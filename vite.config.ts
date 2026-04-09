import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop'
  const isTauriBuild = isDesktop || Boolean(process.env.TAURI_ENV_PLATFORM)

  return {
    base: isDesktop ? '/' : '/Pretext-Game/',
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    build: {
      outDir: isDesktop ? 'dist-desktop' : 'dist',
      assetsInlineLimit: 0,
      target: isTauriBuild && process.env.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome105'
        : undefined,
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    },
  }
})
