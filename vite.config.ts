import { defineConfig, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    (() => {
      let config: ResolvedConfig;
      return {
        name: 'copy-pwa-assets',
        apply: 'build',
        configResolved(resolvedConfig: ResolvedConfig) {
          config = resolvedConfig
        },
        closeBundle() {
          const publicDir = config.publicDir
          const distDir = path.resolve(config.root, config.build.outDir)
          
          if (!fs.existsSync(publicDir)) return
          if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true })

          // Copy everything from public EXCEPT media
          const items = fs.readdirSync(publicDir)
          for (const item of items) {
            // Skip media and hidden files
            if (item === 'media' || item.startsWith('.')) continue
            
            const src = path.join(publicDir, item)
            const dest = path.join(distDir, item)
            
            fs.cpSync(src, dest, { recursive: true })
            console.log(`Copied ${item} to ${config.build.outDir}/`)
          }
        }
      }
    })()
  ],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    // We disable the default publicDir copy to avoid including the huge media symlinked folder.
    // The custom plugin above handles copying only the PWA files we need.
    copyPublicDir: false,
  }
})
