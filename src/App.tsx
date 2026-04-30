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
  Menu,
  Scissors,
  Loader2,
  Check,
  Tag as TagIcon,
  Star,
  Shield,
  Zap,
  Search,
  Maximize,
  ChevronLeft,
} from "lucide-react";
import type { VideoMetadata, FolderManifest, Sport, Tag } from "./types";

const MEDIA_ROOT = "/media";

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileNavLevel, setMobileNavLevel] = useState<0 | 1 | 2>(0); // 0: Sports, 1: Folders, 2: Videos

  // Load sports list once
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        // Set default announcement if none exists (PWA prompt)
        const checkPWA = (current: string | null) => {
          if (!current) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const isStandalone = window.matchMedia(
              "(display-mode: standalone)",
            ).matches;
            if (!isStandalone) {
              return isIOS
                ? "Install WAHS Vault: Tap Share and 'Add to Home Screen'"
                : "Install WAHS Vault: Tap the browser menu and 'Install App'";
            }
          }
          return current;
        };

        // Fetch Announcement
        fetch(`${MEDIA_ROOT}/announcement.txt`)
          .then((res) => (res.ok ? res.text() : null))
          .then((text) => {
            let finalMsg = null;
            if (text && text.trim() && !text.trim().startsWith("<!")) {
              finalMsg = text.trim();
            }
            setAnnouncement(checkPWA(finalMsg));
          })
          .catch(() => {
            setAnnouncement(checkPWA(null));
          });

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
              // Normalize manifest path (remove leading ./)
              const relPath = f.manifest_path.replace(/^\.\//, "");
              const mRes = await fetch(
                `${MEDIA_ROOT}/${selectedSport.path}/${relPath}`,
              );
              if (!mRes.ok) return null;
              const data = await mRes.json();
              return {
                ...data,
                // Preserve the formatted name from the folders.json list
                name: f.name,
                // The folder path is the manifest path minus the filename
                folder_path: relPath.substring(0, relPath.lastIndexOf("/")),
              };
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


  if (loading) return <div className="loading">Loading videos...</div>;

  return (
    <div className="app-container">
      <div
        className={`sidebar-overlay ${isSidebarOpen ? "active" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {announcement && (
        <div className="announcement-banner">
          <div className="announcement-content">
            <Info size={18} className="icon" />
            <span>{announcement}</span>
          </div>
          <button
            className="announcement-close"
            onClick={() => setAnnouncement(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mobile-header">
        <button className="menu-toggle" onClick={() => setIsSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <div className="mobile-logo">
          WAHS <span>Vault</span>
        </div>
      </div>
      <div className="main-layout">
        <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
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
                    onClick={() => {
                      setSelectedSport(sport);
                      setIsSidebarOpen(false);
                      setMobileNavLevel(1);
                    }}
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
                  onClick={() => {
                    setSelectedFolder(folder);
                    setIsSidebarOpen(false);
                    setMobileNavLevel(2);
                  }}
                >
                  <span>{folder.name}</span>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="content">
          <header className="header">
            <div className="header-nav">
              {mobileNavLevel > 0 && (
                <button 
                  className="mobile-back-btn" 
                  onClick={() => setMobileNavLevel((prev) => (prev - 1) as any)}
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              <div>
                <h1>{mobileNavLevel === 0 ? "Sports" : mobileNavLevel === 1 ? (selectedSport?.name || "Collections") : (selectedFolder?.name || "Clips")}</h1>
                <p>
                  {mobileNavLevel === 0 ? `${sports.length} active programs` : 
                   mobileNavLevel === 1 ? `${folders.length} collections` : 
                   `${selectedFolder?.videos.length || 0} videos`}
                </p>
              </div>
            </div>
          </header>

          {/* Mobile Drill-down Menu */}
          <div className="mobile-drilldown">
            {mobileNavLevel === 0 && (
              <div className="menu-grid">
                {sports.filter(s => s.has_content).map(sport => (
                  <div 
                    key={sport.id} 
                    className={`menu-card ${selectedSport?.id === sport.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedSport(sport);
                      setMobileNavLevel(1);
                    }}
                  >
                    <Trophy size={32} className="icon-blue" />
                    <h3>{sport.name}</h3>
                  </div>
                ))}
              </div>
            )}

            {mobileNavLevel === 1 && (
              <div className="menu-list">
                {folders.map(folder => (
                  <div 
                    key={folder.name} 
                    className={`menu-item ${selectedFolder?.name === folder.name ? "active" : ""}`}
                    onClick={() => {
                      setSelectedFolder(folder);
                      setMobileNavLevel(2);
                    }}
                  >
                    <Folder size={20} />
                    <span>{folder.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`video-grid ${mobileNavLevel < 2 ? "mobile-hidden" : ""}`}>
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
                      src={`${MEDIA_ROOT}/${selectedSport?.path}/${selectedFolder.folder_path || selectedFolder.name}/${vid.thumbnail}`}
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
              folderPath={selectedFolder.folder_path || selectedFolder.name}
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
  folderPath: string;
  sportPath: string;
  onClose: () => void;
}> = ({ video, folderPath, sportPath, onClose }) => {
  const [currentMode, setCurrentMode] = useState<"60fps" | "120fps">(
    video.versions["60fps"] ? "60fps" : "120fps",
  );
  const [playing, setPlaying] = useState(true);
  const [showDownload, setShowDownload] = useState(false);
  const [isClipping, setIsClipping] = useState(false);
  const [clipStart, setClipStart] = useState<number | null>(null);
  const [clipEnd, setClipEnd] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [tags, setTags] = useState<Tag[]>(video.tags || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeJersey, setActiveJersey] = useState("");

  const saveTagsToServer = async (updatedTags: Tag[]) => {
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sportPath,
          folderName: folderPath,
          clipNum: video.clip_num,
          date: video.date,
          tags: updatedTags
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save tags');
      }
      video.tags = updatedTags;
      setTags(updatedTags);
    } catch (err) {
      console.error('Error saving tags:', err);
      alert(`Failed to save tags to server: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const targetSeekTime = useRef<number | null>(null);

  const handleSaveClip = async () => {
    if (clipStart === null || clipEnd === null) return;
    const start = Math.min(clipStart, clipEnd);
    const end = Math.max(clipStart, clipEnd);
    const duration = end - start;

    if (duration <= 0) return;

    const filename = video.versions[currentMode]?.filename;
    if (!filename) {
      alert('Failed to create clip: No video file found for the current mode.');
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sportPath,
          folderName: folderPath,
          filename,
          start,
          duration
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create clip');
      }

      const downloadName = `clip_${video.clip_num}_${Math.floor(start)}s.mp4`;
      const blob = await response.blob();

      // iOS Safari does not support URL.createObjectURL for programmatic downloads.
      // Fall back to a FileReader-based data URL approach.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = downloadName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };
        reader.readAsDataURL(blob);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setIsClipping(false);
      setClipStart(null);
      setClipEnd(null);
    } catch (err) {
      console.error('Error creating clip:', err);
      alert(`Failed to create clip: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  };

  const addTag = (type: Tag["type"], label: string) => {
    if (!videoRef.current) return;
    const currentTime = videoRef.current.currentTime;
    const stretch = video.versions[currentMode].stretch_factor;
    const referenceTime = currentTime / stretch;

    const newTag: Tag = {
      id: Math.random().toString(36).substr(2, 9),
      label,
      time: referenceTime,
      type,
      jerseyNumber: activeJersey || undefined,
    };

    saveTagsToServer([...tags, newTag]);
  };

  const removeTag = (id: string) => {
    const updated = tags.filter(t => t.id !== id);
    saveTagsToServer(updated);
  };

  const seekToTag = (tag: Tag) => {
    if (!videoRef.current) return;
    const stretch = video.versions[currentMode].stretch_factor;
    videoRef.current.currentTime = tag.time * stretch;
    videoRef.current.play();
  };

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    } else if ((videoRef.current as any).webkitRequestFullscreen) {
      (videoRef.current as any).webkitRequestFullscreen();
    } else if ((videoRef.current as any).msRequestFullscreen) {
      (videoRef.current as any).msRequestFullscreen();
    }
  };

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

    // Sync clip markers
    if (clipStart !== null) setClipStart(clipStart * factor);
    if (clipEnd !== null) setClipEnd(clipEnd * factor);

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
        <div className="player-content">
          <div className="video-wrapper">
            <video
              ref={videoRef}
              src={`${MEDIA_ROOT}/${sportPath}/${folderPath}/${video.versions[currentMode]?.filename}`}
              controls
              autoPlay
              playsInline
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

            <div className="action-buttons">
              <button
                className="action-btn fullscreen-btn mobile-only-btn"
                onClick={handleFullscreen}
                title="Fullscreen"
              >
                <Maximize size={20} />
              </button>

              <div className="clip-tool-container">
                {!isClipping ? (
                  <button
                    className="action-btn clip-btn"
                    onClick={() => setIsClipping(true)}
                  >
                    <Scissors size={20} /> Create Clip
                  </button>
                ) : (
                  <div className="clip-controls">
                    <div className="clip-inputs">
                      <button
                        className={`marker-btn ${clipStart !== null ? "set" : ""}`}
                        onClick={() =>
                          setClipStart(videoRef.current?.currentTime || 0)
                        }
                      >
                        {clipStart !== null
                          ? `Start: ${formatDuration(clipStart)}`
                          : "Set Start"}
                      </button>
                      <button
                        className={`marker-btn ${clipEnd !== null ? "set" : ""}`}
                        onClick={() =>
                          setClipEnd(videoRef.current?.currentTime || 0)
                        }
                      >
                        {clipEnd !== null
                          ? `End: ${formatDuration(clipEnd)}`
                          : "Set End"}
                      </button>
                    </div>

                    {clipStart !== null && clipEnd !== null && (
                      <button
                        className="save-clip-btn"
                        onClick={handleSaveClip}
                        disabled={processing}
                      >
                        {processing ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />{" "}
                            Exporting...
                          </>
                        ) : (
                          <>
                            <Check size={18} /> Export Highlight ({formatDuration(Math.abs(clipEnd - clipStart))})
                          </>
                        )}
                      </button>
                    )}

                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setIsClipping(false);
                        setClipStart(null);
                        setClipEnd(null);
                      }}
                      disabled={processing}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
              </div>

              <div className="download-dropdown">
                <button
                  className="download-btn"
                  onClick={() => setShowDownload(!showDownload)}
                >
                  <Download size={20} /> Full Video <ChevronDown size={16} />
                </button>
                {showDownload && (
                  <div className="dropdown-menu">
                    {availableVersions.map((v) => (
                      <div
                        key={v}
                        className="dropdown-item"
                        onClick={() => {
                          window.open(
                            `${MEDIA_ROOT}/${sportPath}/${folderPath}/${video.versions[v].filename}`,
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

        <div className="player-sidebar">
          <div className="tag-section">
            <div className="tag-header">
              <h3>
                <TagIcon size={18} /> Highlights
              </h3>
              <div className="quick-tags">
                <button
                  className="quick-tag-btn goal"
                  onClick={() => addTag("goal", "Goal!")}
                  title="Record Goal"
                >
                  <Trophy size={16} />
                </button>
                <button
                  className="quick-tag-btn play"
                  onClick={() => addTag("play", "Big Play")}
                  title="Big Play"
                >
                  <Zap size={16} />
                </button>
                <button
                  className="quick-tag-btn save"
                  onClick={() => addTag("save", "Save")}
                  title="Great Save"
                >
                  <Shield size={16} />
                </button>
                <button
                  className="quick-tag-btn other"
                  onClick={() => addTag("other", "Highlight")}
                  title="Other"
                >
                  <Star size={16} />
                </button>
              </div>
            </div>

            <div className="tag-controls">
              <div className="jersey-input-wrapper">
                <span>Jersey #</span>
                <input
                  type="text"
                  placeholder="--"
                  value={activeJersey}
                  onChange={(e) => setActiveJersey(e.target.value)}
                  className="jersey-input"
                />
              </div>
              <div className="search-input-wrapper">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search highlights..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="tag-search"
                />
              </div>
            </div>

            <div className="tag-list">
              {tags.length === 0 ? (
                <p className="no-tags">No tags yet. Add one during playback!</p>
              ) : (
                tags
                  .filter(tag => {
                    if (!searchTerm) return true;
                    const search = searchTerm.toLowerCase();
                    return (
                      tag.label.toLowerCase().includes(search) ||
                      (tag.jerseyNumber && tag.jerseyNumber.includes(search))
                    );
                  })
                  .sort((a, b) => a.time - b.time)
                  .map((tag) => (
                    <div
                      key={tag.id}
                      className={`tag-item ${tag.type}`}
                      onClick={() => seekToTag(tag)}
                    >
                      <div className="tag-info">
                        <div className="tag-label-row">
                          <span className="tag-label">{tag.label}</span>
                          {tag.jerseyNumber && (
                            <span className="tag-jersey">#{tag.jerseyNumber}</span>
                          )}
                        </div>
                        <span className="tag-time">
                          {formatDuration(
                            tag.time *
                              video.versions[currentMode].stretch_factor,
                          )}
                        </span>
                      </div>
                      <div className="tag-actions">
                        <div className="tag-icon-mini">
                          {tag.type === "goal" && <Trophy size={12} />}
                          {tag.type === "play" && <Zap size={12} />}
                          {tag.type === "save" && <Shield size={12} />}
                          {tag.type === "other" && <Star size={12} />}
                        </div>
                        <button 
                          className="tag-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTag(tag.id);
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
            {tags.length > 0 && (
              <button
                className="export-tags-btn"
                onClick={() => {
                  const json = JSON.stringify(tags, null, 2);
                  navigator.clipboard.writeText(json);
                  alert("Tags copied to clipboard! Paste into manifest.json");
                }}
              >
                Copy Tags JSON
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
