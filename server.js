import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const MEDIA_ROOT = process.env.MEDIA_ROOT || '/srv/docker/media/';
const DATA_DIR = process.env.DATA_DIR || '/data';
const CLIPS_DIR = path.join(DATA_DIR, 'clips');
const DB_PATH = path.join(DATA_DIR, 'vault.db');

// Ensure persistent directories exist
fs.mkdirSync(CLIPS_DIR, { recursive: true });

// --- Database Setup ---
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS saved_clips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT NOT NULL,
    sport_path  TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    source_clip TEXT NOT NULL,
    opponent    TEXT,
    clip_date   TEXT,
    start_time  REAL NOT NULL,
    duration    REAL NOT NULL,
    label       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id          TEXT PRIMARY KEY,
    sport_path  TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    clip_num    TEXT NOT NULL,
    clip_date   TEXT,
    label       TEXT NOT NULL,
    type        TEXT NOT NULL,
    time        REAL NOT NULL,
    jersey_num  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertClip = db.prepare(`
  INSERT INTO saved_clips (filename, sport_path, folder_name, source_clip, opponent, clip_date, start_time, duration, label)
  VALUES (@filename, @sportPath, @folderName, @sourceClip, @opponent, @clipDate, @startTime, @duration, @label)
`);

const getAllClips = db.prepare(`
  SELECT * FROM saved_clips ORDER BY created_at DESC
`);

const deleteClip = db.prepare(`
  DELETE FROM saved_clips WHERE id = ?
`);

const upsertTags = db.prepare(`
  INSERT OR REPLACE INTO tags (id, sport_path, folder_name, clip_num, clip_date, label, type, time, jersey_num)
  VALUES (@id, @sportPath, @folderName, @clipNum, @clipDate, @label, @type, @time, @jerseyNum)
`);

const deleteMissingTags = db.prepare(`
  DELETE FROM tags WHERE sport_path = ? AND folder_name = ? AND clip_num = ? AND id NOT IN (SELECT value FROM json_each(?))
`);

// --- Middleware ---
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// --- Health ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is healthy', mode: 'production' });
});

// --- Tags ---
app.post('/api/tags', (req, res) => {
  try {
    const { sportPath, folderName, clipNum, date, tags } = req.body;
    console.log(`Saving tags for ${sportPath}/${folderName} clip ${clipNum}`);

    // Write to manifest.json for backwards compatibility
    const manifestPath = path.join(MEDIA_ROOT, sportPath, folderName, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const videoIndex = manifest.videos.findIndex((v) => v.clip_num === clipNum && v.date === date);
      if (videoIndex !== -1) {
        manifest.videos[videoIndex].tags = tags;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
      }
    }

    // Persist tags to SQLite
    const syncTags = db.transaction((tagList) => {
      for (const tag of tagList) {
        upsertTags.run({
          id: tag.id,
          sportPath,
          folderName,
          clipNum,
          clipDate: date,
          label: tag.label,
          type: tag.type,
          time: tag.time,
          jerseyNum: tag.jerseyNumber || null,
        });
      }
      // Remove tags that are no longer in the list
      const ids = JSON.stringify(tagList.map((t) => t.id));
      deleteMissingTags.run(sportPath, folderName, clipNum, ids);
    });
    syncTags(tags);

    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/tags:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// --- Saved Clips: List ---
app.get('/api/clips', (req, res) => {
  try {
    const clips = getAllClips.all();
    res.json(clips);
  } catch (err) {
    console.error('Error in GET /api/clips:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// --- Saved Clips: Delete ---
app.delete('/api/clips/:id', (req, res) => {
  try {
    const { id } = req.params;
    const clip = db.prepare('SELECT * FROM saved_clips WHERE id = ?').get(id);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });

    // Remove the file
    const filePath = path.join(CLIPS_DIR, clip.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    deleteClip.run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/clips/:id:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// --- Create & Save Clip ---
app.post('/api/clip', async (req, res) => {
  try {
    const { sportPath, folderName, filename, start, duration, opponent, clipDate, sourceClip, label } = req.body;
    const inputPath = path.join(MEDIA_ROOT, sportPath, folderName, filename);
    const outputFilename = `clip_${Date.now()}.mp4`;
    const outputPath = path.join(CLIPS_DIR, outputFilename);

    console.log(`Clipping: ${inputPath} from ${start}s for ${duration}s`);

    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ error: `Source video not found: ${inputPath}` });
    }

    const ffmpeg = spawn('ffmpeg', [
      '-ss', start.toString(),
      '-t', duration.toString(),
      '-i', inputPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
      '-y'
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });

    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        // Record in database
        const result = insertClip.run({
          filename: outputFilename,
          sportPath,
          folderName,
          sourceClip: sourceClip || filename,
          opponent: opponent || null,
          clipDate: clipDate || null,
          startTime: start,
          duration,
          label: label || null,
        });

        res.json({
          success: true,
          clip: {
            id: result.lastInsertRowid,
            filename: outputFilename,
            url: `/clips/${outputFilename}`,
          },
        });
      } else {
        console.error(`ffmpeg failed (code ${code}): ${stderr}`);
        res.status(500).json({ error: 'Clipping failed' });
      }
    });
  } catch (err) {
    console.error('Error in /api/clip:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// --- Serve Saved Clips ---
app.use('/clips', express.static(CLIPS_DIR));

// --- Serve Media ---
app.use('/media', express.static(MEDIA_ROOT));

// --- Serve Built Frontend ---
app.use(express.static(path.join(__dirname, 'dist')));

// --- SPA Fallback ---
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`WAHS Vault server running on http://localhost:${PORT}`);
  console.log(`Media root: ${MEDIA_ROOT}`);
  console.log(`Data dir:   ${DATA_DIR}`);
  console.log(`DB path:    ${DB_PATH}`);
});
