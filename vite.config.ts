import { defineConfig, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const tagMiddleware = (req: any, res: any, next: any) => {
  if (req.method === 'POST' && req.url === '/api/tags') {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { sportPath, folderName, clipNum, date, tags } = JSON.parse(body);
        console.log(`Saving tags for ${sportPath}/${folderName} clip ${clipNum}`);
        
        // Resolve the manifest path. We know public/media -> /Volumes/Data/Videos
        const mediaRoot = '/Volumes/Data/Videos';
        const manifestPath = path.join(mediaRoot, sportPath, folderName, 'manifest.json');
        
        console.log(`Resolved manifest path: ${manifestPath}`);

        if (!fs.existsSync(manifestPath)) {
          console.error(`Manifest not found at ${manifestPath}`);
          res.statusCode = 404;
          res.end(JSON.stringify({ error: `Manifest not found at ${manifestPath}` }));
          return;
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const videoIndex = manifest.videos.findIndex((v: any) => v.clip_num === clipNum && v.date === date);
        
        if (videoIndex === -1) {
          console.error(`Video clip ${clipNum} on ${date} not found in manifest`);
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Video not found in manifest' }));
          return;
        }

        manifest.videos[videoIndex].tags = tags;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
        console.log(`Successfully saved tags to ${manifestPath}`);
        
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        console.error('Error in tag-server:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }));
      }
    });
  } else {
    next();
  }
};

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
    })(),
    {
      name: 'tag-server',
      configureServer(server) {
        server.middlewares.use(tagMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(tagMiddleware);
      }
    }
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
