import type { FC } from "react";
import { useState, useEffect, useRef } from "react";
import {
  Folder,
  Video,
  Download,
  X,
  ChevronDown,
  Info,
  Trophy,
} from "lucide-react";
import type { VideoMetadata, FolderManifest, Sport } from "./types";

const MEDIA_ROOT = "/media";

const App: FC = () => {
  const [sports, setSports] = useState<Sport[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [folders, setFolders] = useState<FolderManifest[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderManifest | null>(
    null,
  );
  const [selectedVideo, setSelectedVideo] = useState<VideoMetadata | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load sports list once
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        // Fetch Announcement
        fetch(`${MEDIA_ROOT}/announcement.txt`)
          .then((res) => (res.ok ? res.text() : null))
          .then((text) => {
            if (text && text.trim()) setAnnouncement(text.trim());
          })
          .catch(() => {});

        const res = await fetch(`${MEDIA_ROOT}/sports.json`);
        if (!res.ok) throw new Error("Could not load sports.json");
        const sportsList = await res.json();
        setSports(sportsList);
        if (sportsList.length > 0) {
          const firstWithContent = sportsList.find((s: Sport) => s.has_content);
          setSelectedSport(firstWithContent || sportsList[0]);
        }
      } catch (err) {
        console.error("Failed to load sports:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBaseData();
  }, []);

  // Load folders when selectedSport changes
  useEffect(() => {
    if (!selectedSport) return;

    const fetchSportData = async () => {
      try {
        const res = await fetch(
          `${MEDIA_ROOT}/${selectedSport.path}/folders.json`,
        );
        if (!res.ok)
          throw new Error(`Could not load folders for ${selectedSport.name}`);
        const foldersList = await res.json();

        const detailedFolders = await Promise.all(
          foldersList.map(
            async (f: { name: string; manifest_path: string }) => {
              const mRes = await fetch(
                `${MEDIA_ROOT}/${selectedSport.path}/${f.name}/manifest.json`,
              );
              if (!mRes.ok) return null;
              return await mRes.json();
            },
          ),
        );

        const validFolders = detailedFolders.filter(
          Boolean,
        ) as FolderManifest[];

        setFolders(validFolders);
        if (validFolders.length > 0) {
          setSelectedFolder(validFolders[0]);
        } else {
          setSelectedFolder(null);
        }
      } catch (err) {
        console.error("Failed to load sport manifests:", err);
      }
    };
    fetchSportData();
  }, [selectedSport]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) return <div className="loading">Loading videos...</div>;

  return (
    <div className="app-container">
      {announcement && (
        <div className="announcement-banner">
          <Info size={18} className="icon" />
          <span>{announcement}</span>
        </div>
      )}
      <div className="main-layout">
        <aside className="sidebar">
          <h2>
            <Video className="icon-blue" /> WAHS <span>Vault</span>
          </h2>

          <div className="sidebar-section">
            <h3 className="section-title">
              <Trophy size={16} /> Sports
            </h3>
            <nav className="sport-list">
              {sports
                .filter((s) => s.has_content)
                .map((sport) => (
                  <div
                    key={sport.id}
                    className={`sport-item ${selectedSport?.id === sport.id ? "active" : ""}`}
                    onClick={() => setSelectedSport(sport)}
                  >
                    {sport.name}
                  </div>
                ))}
            </nav>
          </div>

          <div className="sidebar-section">
            <h3 className="section-title">
              <Folder size={16} /> Collections
            </h3>
            <nav className="folder-list">
              {folders.map((folder) => (
                <div
                  key={folder.name}
                  className={`folder-item ${selectedFolder?.name === folder.name ? "active" : ""}`}
                  onClick={() => setSelectedFolder(folder)}
                >
                  <span>{folder.name}</span>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="content">
          <header className="header">
            <div>
              <h1>{selectedFolder?.name || "Clips"}</h1>
              <p>{selectedFolder?.videos.length || 0} videos</p>
            </div>
          </header>

          <div className="video-grid">
            {selectedFolder?.videos
              .filter((v) => Object.keys(v.versions).length > 0)
              .map((vid) => (
                <div
                  key={`${vid.clip_num}-${vid.date}`}
                  className="video-card"
                  onClick={() => setSelectedVideo(vid)}
                >
                  <div className="thumbnail-container">
                    <img
                      src={`${MEDIA_ROOT}/${selectedSport?.path}/${selectedFolder.name}/${vid.thumbnail}`}
                      alt={vid.opponent}
                    />
                    <div className="duration-badge">
                      {formatDuration(
                        (
                          vid.versions["60fps"] ||
                          vid.versions[Object.keys(vid.versions)[0]]
                        ).duration,
                      )}
                    </div>
                    {vid.versions["120fps"] && (
                      <div className="fps-badge">Slo-mo</div>
                    )}
                  </div>
                  <div className="card-info">
                    <h3>
                      Clip #{vid.clip_num} vs {vid.opponent}
                    </h3>
                    <p className="metadata">{vid.date}</p>
                  </div>
                </div>
              ))}
          </div>

          {selectedVideo && selectedFolder && (
            <VideoOverlay
              video={selectedVideo}
              folderName={selectedFolder.name}
              sportPath={selectedSport?.path || ""}
              onClose={() => setSelectedVideo(null)}
            />
          )}
        </main>
      </div>
    </div>
  );
};

const VideoOverlay: FC<{
  video: VideoMetadata;
  folderName: string;
  sportPath: string;
  onClose: () => void;
}> = ({ video, folderName, sportPath, onClose }) => {
  const [currentMode, setCurrentMode] = useState<"60fps" | "120fps">(
    video.versions["60fps"] ? "60fps" : "120fps",
  );
  const [playing, setPlaying] = useState(true);
  const [showDownload, setShowDownload] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetSeekTime = useRef<number | null>(null);

  const availableVersions = Object.keys(video.versions);

  const switchToMode = (mode: "60fps" | "120fps") => {
    if (
      !videoRef.current ||
      mode === currentMode ||
      !video.versions[mode] ||
      !video.versions[currentMode]
    )
      return;

    const oldTime = videoRef.current.currentTime;
    const oldStretch = video.versions[currentMode].stretch_factor;
    const newStretch = video.versions[mode].stretch_factor;

    const factor = newStretch / oldStretch;
    const newTime = oldTime * factor;

    setCurrentMode(mode);
    targetSeekTime.current = newTime;
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v && targetSeekTime.current !== null) {
      v.currentTime = targetSeekTime.current;
      targetSeekTime.current = null;
      if (playing) v.play();
    }
  };

  return (
    <div className="player-overlay">
      <button className="player-close" onClick={onClose}>
        <X />
      </button>
      <div className="player-main">
        <div className="video-wrapper">
          <video
            ref={videoRef}
            src={`${MEDIA_ROOT}/${sportPath}/${folderName}/${video.versions[currentMode]?.filename}`}
            controls
            autoPlay
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>

        <div className="player-controls">
          <div className="clip-details">
            <h2>
              vs {video.opponent} (#{video.clip_num})
            </h2>
            <p>{video.date}</p>
          </div>

          {video.versions["60fps"] && video.versions["120fps"] && (
            <div className="toggle-group">
              <button
                className={`toggle-btn ${currentMode === "60fps" ? "active" : ""}`}
                onClick={() => switchToMode("60fps")}
                disabled={!video.versions["60fps"]}
              >
                Regular (60fps)
              </button>
              <button
                className={`toggle-btn ${currentMode === "120fps" ? "active" : ""}`}
                onClick={() => switchToMode("120fps")}
                disabled={!video.versions["120fps"]}
              >
                Slow-mo (120fps)
              </button>
            </div>
          )}

          <div className="download-dropdown">
            <button
              className="download-btn"
              onClick={() => setShowDownload(!showDownload)}
            >
              <Download size={20} /> Download <ChevronDown size={16} />
            </button>
            {showDownload && (
              <div className="dropdown-menu">
                {availableVersions.map((v) => (
                  <div
                    key={v}
                    className="dropdown-item"
                    onClick={() => {
                      window.open(
                        `${MEDIA_ROOT}/${sportPath}/${folderName}/${video.versions[v].filename}`,
                        "_blank",
                      );
                      setShowDownload(false);
                    }}
                  >
                    Download {v} version
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
