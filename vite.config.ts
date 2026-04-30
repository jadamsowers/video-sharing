import { defineConfig, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const MEDIA_ROOT_DEV = '/Volumes/Data/Videos';

const sendJson = (res: any, status: number, data: object) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

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
        
        const manifestPath = path.join(MEDIA_ROOT_DEV, sportPath, folderName, 'manifest.json');
        console.log(`Resolved manifest path: ${manifestPath}`);

        if (!fs.existsSync(manifestPath)) {
          console.error(`Manifest not found at ${manifestPath}`);
          return sendJson(res, 404, { error: `Manifest not found at ${manifestPath}` });
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const videoIndex = manifest.videos.findIndex((v: any) => v.clip_num === clipNum && v.date === date);
        
        if (videoIndex === -1) {
          console.error(`Video clip ${clipNum} on ${date} not found in manifest`);
          return sendJson(res, 404, { error: 'Video not found in manifest' });
        }

        manifest.videos[videoIndex].tags = tags;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
        console.log(`Successfully saved tags to ${manifestPath}`);
        
        sendJson(res, 200, { success: true });
      } catch (err: any) {
        console.error('Error in tag-server:', err);
        sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' });
      }
    });
  } else {
    next();
  }
};

const clipMiddleware = (req: any, res: any, next: any) => {
  if (req.method === 'POST' && req.url === '/api/clip') {
    let body = '';
    req.on('data', (chunk: any) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { sportPath, folderName, filename, start, duration } = JSON.parse(body);
        const inputPath = path.join(MEDIA_ROOT_DEV, sportPath, folderName, filename);
        const outputFilename = `clip_${Date.now()}.mp4`;
        const outputPath = path.join('/tmp', outputFilename);

        console.log(`[clip-dev] Clipping: ${inputPath} from ${start}s for ${duration}s`);

        if (!fs.existsSync(inputPath)) {
          console.error(`[clip-dev] Source not found: ${inputPath}`);
          return sendJson(res, 404, { error: `Source video not found: ${inputPath}` });
        }

        const ffmpeg = spawn('ffmpeg', [
          '-ss', String(start),
          '-t', String(duration),
          '-i', inputPath,
          '-c', 'copy',
          '-movflags', '+faststart',
          outputPath,
          '-y'
        ]);

        let stderr = '';
        ffmpeg.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        ffmpeg.on('close', (code: number) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            const stat = fs.statSync(outputPath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
            res.setHeader('Content-Length', stat.size);
            const stream = fs.createReadStream(outputPath);
            stream.pipe(res);
            stream.on('close', () => {
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });
          } else {
            console.error(`[clip-dev] ffmpeg failed (code ${code}): ${stderr}`);
            sendJson(res, 500, { error: 'FFmpeg clipping failed' });
          }
        });
      } catch (err: any) {
        console.error('[clip-dev] Error:', err);
        sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' });
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
      name: 'api-dev-server',
      configureServer(server) {
        server.middlewares.use(tagMiddleware);
        server.middlewares.use(clipMiddleware);
        // Stub: return empty list in dev (no SQLite in Vite process)
        server.middlewares.use((req: any, res: any, next: any) => {
          if (req.method === 'GET' && req.url === '/api/clips') {
            res.setHeader('Content-Type', 'application/json');
            res.end('[]');
          } else {
            next();
          }
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use(tagMiddleware);
        server.middlewares.use(clipMiddleware);
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
