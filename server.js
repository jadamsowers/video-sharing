import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const MEDIA_ROOT = process.env.MEDIA_ROOT || '/srv/docker/media/';

// Middleware to parse JSON bodies
app.use(express.json());

// Security headers for FFmpeg (Cross-Origin isolation)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Health check to verify production server is active
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is healthy', mode: 'production' });
});

// API: Save Tags
app.post('/api/tags', (req, res) => {
  try {
    const { sportPath, folderName, clipNum, date, tags } = req.body;
    console.log(`Saving tags for ${sportPath}/${folderName} clip ${clipNum}`);
    
    const manifestPath = path.join(MEDIA_ROOT, sportPath, folderName, 'manifest.json');
    console.log(`Resolved manifest path: ${manifestPath}`);

    if (!fs.existsSync(manifestPath)) {
      console.error(`Manifest not found at ${manifestPath}`);
      return res.status(404).json({ error: `Manifest not found at ${manifestPath}` });
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const videoIndex = manifest.videos.findIndex((v) => v.clip_num === clipNum && v.date === date);
    
    if (videoIndex === -1) {
      console.error(`Video clip ${clipNum} on ${date} not found in manifest`);
      return res.status(404).json({ error: 'Video not found in manifest' });
    }

    manifest.videos[videoIndex].tags = tags;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
    console.log(`Successfully saved tags to ${manifestPath}`);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/tags:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// API: Create Clip
app.post('/api/clip', async (req, res) => {
  try {
    const { sportPath, folderName, filename, start, duration } = req.body;
    const inputPath = path.join(MEDIA_ROOT, sportPath, folderName, filename);
    const outputFilename = `clip_${Date.now()}.mp4`;
    const outputPath = path.join('/tmp', outputFilename);

    console.log(`Clipping: ${inputPath} from ${start}s for ${duration}s`);

    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'Source video not found' });
    }

    // Run native ffmpeg
    // We use fast-start and copy codecs if possible for speed
    const ffmpeg = spawn('ffmpeg', [
      '-ss', start.toString(),
      '-t', duration.toString(),
      '-i', inputPath,
      '-c', 'copy', // Copy instead of re-encoding for near-instant clipping
      '-movflags', '+faststart',
      outputPath,
      '-y'
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        res.download(outputPath, outputFilename, (err) => {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      } else {
        console.error(`ffmpeg failed with code ${code}`);
        res.status(500).json({ error: 'Clipping failed' });
      }
    });
  } catch (err) {
    console.error('Error in /api/clip:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Serve Media folder directly (Cloudflare tunnel friendly)
app.use('/media', express.static(MEDIA_ROOT));

// Serve built frontend
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for SPA (Single Page App)
app.get('/:path*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`WAHS Vault server running on http://localhost:${PORT}`);
  console.log(`Media root: ${MEDIA_ROOT}`);
});
