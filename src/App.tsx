import type { FC } from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { MediaPlayer, MediaPlayerInstance, MediaProvider } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import {
  Folder,
  Video,
  Download,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  Trophy,
  Menu,
  Scissors,
  Loader2,
  Check,
  Star,
  Shield,
  Zap,
  Share2,
  Film,
  Trash2,
} from "lucide-react";
import type { VideoMetadata, FolderManifest, Sport, Tag, SavedClip } from "./types";

const MEDIA_ROOT = "/media";

/** Parse a pathname like /boys-lacrosse/douglas-freeman/clip015 */
function parseDeepLink(pathname: string): { sportPath: string; folderPath: string; clipNum: string } | null {
  // Strip leading slash and split
  const parts = pathname.replace(/^\//, "").split("/").filter(Boolean);
  // Expect exactly 3 segments where last starts with 'clip'
  if (parts.length === 3 && parts[2].startsWith("clip")) {
    return {
      sportPath: parts[0],
      folderPath: parts[1],
      clipNum: parts[2].slice(4), // strip 'clip' prefix
    };
  }
  return null;
}

/** Build a shareable URL for a clip */
function buildClipUrl(sportPath: string, folderPath: string, clipNum: string): string {
  const folder = folderPath.includes("/") ? folderPath.split("/").pop()! : folderPath;
  return `${window.location.origin}/${sportPath}/${folder}/clip${clipNum}`;
}

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

  const [savedClips, setSavedClips] = useState<SavedClip[]>([]);
  const [savedClipsOpen, setSavedClipsOpen] = useState(false);
  const [isTagSearchOpen, setIsTagSearchOpen] = useState(false);
  const [tagFilters, setTagFilters] = useState({ jerseyNum: "", type: "", category: "" });
  const [tagResults, setTagResults] = useState<any[]>([]);

  // Deep-link: parsed from the current URL on first load
  const deepLink = useRef(parseDeepLink(window.location.pathname));
  const targetSeekTime = useRef<number | null>(null);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedVideo) {
      // On mobile, main.content has overflow-y: visible so the page scroll
      // lives on window. On desktop it lives on the content element itself.
      if (contentRef.current) {
        contentRef.current.scrollTo(0, 0);
      }
      window.scrollTo(0, 0);
    }
  }, [selectedVideo]);

  const fetchSavedClips = useCallback(async () => {
    try {
      const res = await fetch('/api/clips');
      if (!res.ok) return;
      const data: Omit<SavedClip, 'url'>[] = await res.json();
      setSavedClips(data.map(c => ({ ...c, url: `/clips/${c.filename}` })));
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  useEffect(() => { fetchSavedClips(); }, [fetchSavedClips]);

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
          // If a deep-link is present, prefer that sport; otherwise pick first with content
          const dl = deepLink.current;
          const linked = dl ? sportsList.find((s: Sport) => s.path === dl.sportPath) : null;
          setSelectedSport(linked || sportsList.find((s: Sport) => s.has_content) || sportsList[0]);
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

        // Resolve deep-link folder + clip if applicable
        const dl = deepLink.current;
        if (dl && selectedSport?.path === dl.sportPath) {
          const linkedFolder = validFolders.find(
            (f) => (f.folder_path || f.name).split("/").pop() === dl.folderPath,
          );
          if (linkedFolder) {
            setSelectedFolder(linkedFolder);
            const linkedVideo = linkedFolder.videos.find(
              (v) => v.clip_num === dl.clipNum,
            );
            if (linkedVideo) {
              setSelectedVideo(linkedVideo);
              // Clear deep-link so subsequent navigation is normal
              deepLink.current = null;
              history.replaceState(null, "",
                buildClipUrl(dl.sportPath, dl.folderPath, dl.clipNum));
            }
            return;
          }
        }

        if (validFolders.length > 0) {
          // Sort folders by their most recent video date descending, default to latest game
          const sorted = [...validFolders].sort((a, b) => {
            const latestDate = (f: FolderManifest) =>
              f.videos.reduce((max, v) => (v.date > max ? v.date : max), "");
            return latestDate(b).localeCompare(latestDate(a));
          });
          setFolders(sorted);
          setSelectedFolder(sorted[0]);
        } else {
          setSelectedFolder(null);
        }
      } catch (err) {
        console.error("Failed to load sport manifests:", err);
      }
    };
    fetchSportData();
    setIsTagSearchOpen(false);
    setTagResults([]);
    setSelectedVideo(null);
    targetSeekTime.current = null;
  }, [selectedSport]);

  const searchSeasonTags = async () => {
    if (!selectedSport) return;
    try {
      const query = new URLSearchParams({
        sportPath: selectedSport.path,
        ...(tagFilters.jerseyNum && { jerseyNum: tagFilters.jerseyNum }),
        ...(tagFilters.type && { type: tagFilters.type }),
        ...(tagFilters.category && { category: tagFilters.category }),
      }).toString();
      
      const res = await fetch(`/api/tags/search?${query}`);
      if (!res.ok) throw new Error("Search failed");
      const results = await res.json();
      setTagResults(results);
    } catch (err) {
      console.error("Tag search failed:", err);
    }
  };


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
                    setSelectedVideo(null);
                    targetSeekTime.current = null;
                    setIsTagSearchOpen(false);
                    setIsSidebarOpen(false);
                  }}
                >
                  <span>{folder.name}</span>
                </div>
              ))}
            </nav>
          </div>

          <div className="sidebar-section">
            <h3 className="section-title">
              <Zap size={16} /> Season Highlights
            </h3>
            <div 
              className={`folder-item ${isTagSearchOpen ? "active" : ""}`}
              onClick={() => {
                setIsTagSearchOpen(true);
                setSelectedFolder(null);
                setSelectedVideo(null);
                targetSeekTime.current = null;
                setIsSidebarOpen(false);
              }}
            >
              <span>Explore by Tag/Jersey</span>
            </div>
          </div>
        </aside>

        <main className="content" ref={contentRef}>


          {/* Saved Clips Panel */}
          {savedClips.length > 0 && (
            <div className="saved-clips-panel">
              <button
                className="saved-clips-toggle"
                onClick={() => setSavedClipsOpen(o => !o)}
              >
                <Film size={16} />
                <span>Saved Highlights ({savedClips.length})</span>
                {savedClipsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {savedClipsOpen && (
                <div className="saved-clips-list">
                  {savedClips.map(clip => (
                    <div key={clip.id} className="saved-clip-row">
                      <div className="saved-clip-info">
                        <span className="saved-clip-label">{clip.label || clip.filename}</span>
                        <span className="saved-clip-meta">
                          {clip.clip_date} &middot; {formatDuration(clip.duration)}
                        </span>
                      </div>
                      <div className="saved-clip-actions">
                        <a
                          href={clip.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="clip-action-btn play-btn"
                          title="Play"
                        >
                          <Video size={16} />
                        </a>
                        <a
                          href={clip.url}
                          download={clip.filename}
                          className="clip-action-btn dl-btn"
                          title="Download"
                        >
                          <Download size={16} />
                        </a>
                        <button
                          className="clip-action-btn del-btn"
                          title="Delete"
                          onClick={async () => {
                            if (!confirm('Delete this saved clip?')) return;
                            await fetch(`/api/clips/${clip.id}`, { method: 'DELETE' });
                            fetchSavedClips();
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mobile drill-down removed as requested */}


          <div className="video-grid">
            {isTagSearchOpen ? (
              <div className="tag-search-view">
                <div className="tag-search-controls">
                  <div className="tag-search-field">
                    <label>Jersey #</label>
                    <input 
                      type="text" 
                      placeholder="--" 
                      value={tagFilters.jerseyNum} 
                      onChange={e => setTagFilters(f => ({...f, jerseyNum: e.target.value}))}
                    />
                  </div>
                  <div className="tag-search-field">
                    <label>Type</label>
                    <select value={tagFilters.type} onChange={e => setTagFilters(f => ({...f, type: e.target.value}))}>
                      <option value="">Any Type</option>
                      <option value="goal">Goal</option>
                      <option value="play">Play</option>
                      <option value="save">Save</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="tag-search-field">
                    <label>Category</label>
                    <select value={tagFilters.category} onChange={e => setTagFilters(f => ({...f, category: e.target.value}))}>
                      <option value="">Any Category</option>
                      <option value="offense">Offense</option>
                      <option value="defense">Defense</option>
                      <option value="team">Team</option>
                    </select>
                  </div>
                  <div className="tag-search-actions">
                    <button className="tag-search-btn" onClick={searchSeasonTags}>
                      Search
                    </button>
                    <button 
                      className="tag-clear-btn" 
                      onClick={() => {
                        setTagFilters({ jerseyNum: "", type: "", category: "" });
                        setTagResults([]);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="tag-results-list">
                  {tagResults.length === 0 ? (
                    <div className="no-results">Use the filters above to find highlights across the season.</div>
                  ) : (
                    tagResults.map(tag => {
                      // Find the folder and video for this tag
                      const folder = folders.find(f => f.folder_path === tag.folder_name || f.name === tag.folder_name);
                      const video = folder?.videos.find(v => v.clip_num === tag.clip_num);
                      
                      return (
                        <div key={tag.id} className="tag-result-card" onClick={() => {
                          if (folder && video) {
                            setSelectedFolder(folder);
                            setSelectedVideo(video);
                            // Set target seek time (normalized to 1x speed)
                            targetSeekTime.current = tag.time;
                          }
                        }}>
                          <div className="tag-result-info">
                            <div className="tag-result-header">
                              <span className="tag-result-label">{tag.label}</span>
                              <span className="tag-result-folder">{tag.folder_name}</span>
                            </div>
                            <div className="tag-result-meta">
                              {tag.jersey_num && <span className="tag-result-jersey">#{tag.jersey_num}</span>}
                              {tag.category && <span className={`tag-result-cat ${tag.category}`}>{tag.category}</span>}
                              <span className="tag-result-type">{tag.type}</span>
                              <span className="tag-result-date">{tag.clip_date}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : selectedFolder?.videos
              .filter((v) => Object.keys(v.versions).length > 0)
              .map((vid) => (
                <div
                  key={`${vid.clip_num}-${vid.date}`}
                  className="video-card"
                  onClick={() => {
                    setSelectedVideo(vid);
                    // Push shareable URL
                    const fp = selectedFolder?.folder_path || selectedFolder?.name || "";
                    history.pushState(null, "",
                      buildClipUrl(selectedSport?.path || "", fp, vid.clip_num));
                    // Reset seek time when picking a new video normally
                    targetSeekTime.current = null;
                  }}
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
              onClose={() => {
                setSelectedVideo(null);
                history.pushState(null, "", "/");
                targetSeekTime.current = null;
              }}
              onClipSaved={fetchSavedClips}
              globalTargetSeekTime={targetSeekTime}
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
  onClipSaved: () => Promise<void>;
  globalTargetSeekTime: React.RefObject<number | null>;
}> = ({ video, folderPath, sportPath, onClose, onClipSaved, globalTargetSeekTime }) => {
  const [currentMode, setCurrentMode] = useState<"60fps" | "120fps">(
    video.versions["60fps"] ? "60fps" : "120fps",
  );
  const [playing, setPlaying] = useState(true);
  const [showDownload, setShowDownload] = useState(false);
  const [isClipping, setIsClipping] = useState(false);
  const [clipStart, setClipStart] = useState<number | null>(null);
  const [clipEnd, setClipEnd] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [tags, setTags] = useState<Tag[]>(video.tags || []);
  const [activeJersey, setActiveJersey] = useState("");
  const [activeCategory, setActiveCategory] = useState<Tag["category"] | "">("");
  const [savedClip, setSavedClip] = useState<{ url: string; filename: string } | null>(null);

  const handleShare = useCallback(async () => {
    const url = buildClipUrl(sportPath, folderPath, video.clip_num);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Clip #${video.clip_num} vs ${video.opponent}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {
      // User cancelled share sheet – ignore
    }
  }, [sportPath, folderPath, video.clip_num, video.opponent]);

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
      category: activeCategory || undefined,
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

  const availableVersions = Object.keys(video.versions);


  const videoRef = useRef<MediaPlayerInstance>(null);
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
          duration,
          opponent: video.opponent,
          clipDate: video.date,
          sourceClip: video.clip_num,
          label: `Clip #${video.clip_num} vs ${video.opponent} @ ${formatDuration(start)}`,
        })
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = `Server error (${response.status})`;
        try {
          const errorData = JSON.parse(text);
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }

      // Clip saved on server — refresh the clips list
      await onClipSaved();
      
      const data = await response.json();
      setSavedClip(data.clip);

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
    if (v) {
      setVideoDuration(v.state.duration || 0);
      
      // Use targetSeekTime if it exists (mode switch), otherwise use globalTargetSeekTime (initial load)
      const seekTime = targetSeekTime.current !== null ? targetSeekTime.current : globalTargetSeekTime.current;
      
      if (seekTime !== null) {
        v.currentTime = seekTime;
        targetSeekTime.current = null;
        if (playing) v.play();
      }
    }
  };

  return (
    <div className="player-overlay">
      <div className="player-header">
        <button className="player-close" onClick={onClose} title="Back to Game">
          <X size={24} />
        </button>
      </div>
      <div className="player-main">
        <div className="player-content">
          <div className="video-wrapper">
            {video.versions["120fps"] && (
              <button 
                className={`slomo-overlay-toggle ${currentMode === "120fps" ? "active" : ""}`}
                onClick={() => switchToMode(currentMode === "60fps" ? "120fps" : "60fps")}
                title="Toggle Speed"
              >
                {currentMode === "120fps" ? "Slo-mo" : "1x"}
              </button>
            )}
            <MediaPlayer
              ref={videoRef}
              title={`Clip #${video.clip_num} vs ${video.opponent}`}
              src={`${MEDIA_ROOT}/${sportPath}/${folderPath}/${video.versions[currentMode]?.filename}`}
              autoPlay
              playsInline
              onCanPlay={handleLoadedMetadata}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={() => {
                if (isClipping && clipStart !== null && clipEnd !== null && videoRef.current) {
                  const current = videoRef.current.currentTime;
                  const end = Math.max(clipStart, clipEnd);
                  const start = Math.min(clipStart, clipEnd);
                  // Allow a tiny buffer to avoid infinite jumping if time is slightly imprecise
                  if (current >= end) {
                    videoRef.current.currentTime = start;
                  }
                }
              }}
            >
              <MediaProvider />
              <DefaultVideoLayout
                thumbnails={`${window.location.origin}${MEDIA_ROOT}/${sportPath}/${folderPath}/${video.versions[currentMode]?.filename.replace('.mp4', '_thumbnails.vtt')}`}
                icons={defaultLayoutIcons}
              />
              <div className="vidstack-top-toolbar">
                <div className="clip-tool-container">
                  {!isClipping ? (
                    <div className="clip-actions-row">
                      <button
                        className="action-btn clip-btn"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setIsClipping(true);
                          setSavedClip(null);
                          const dur = videoRef.current?.state.duration || videoDuration || 1;
                          if (clipStart === null) setClipStart(0);
                          if (clipEnd === null) setClipEnd(dur);
                        }}
                      >
                        <Scissors size={18} /> Clip
                      </button>
                      {savedClip && (
                        <div className="clip-success-msg">
                          <Check size={14} />
                          <span>Saved!</span>
                          <a href={savedClip.url} download={savedClip.filename} className="clip-dl-link">Download</a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="clip-controls" onClick={(e) => e.stopPropagation()}>
                      <div className="clip-inputs">
                        <button
                          className={`marker-btn ${clipStart !== null ? "set" : ""}`}
                          onClick={() => setClipStart(videoRef.current?.currentTime || 0)}
                        >
                          {clipStart !== null ? formatDuration(clipStart) : "Set Start"}
                        </button>
                        <button
                          className={`marker-btn ${clipEnd !== null ? "set" : ""}`}
                          onClick={() => setClipEnd(videoRef.current?.currentTime || 0)}
                        >
                          {clipEnd !== null ? formatDuration(clipEnd) : "Set End"}
                        </button>
                      </div>

                      {clipStart !== null && clipEnd !== null && (
                        <button
                          className="save-clip-btn"
                          onClick={handleSaveClip}
                          disabled={processing}
                        >
                          {processing ? (
                            <><Loader2 size={16} className="animate-spin" /></>
                          ) : (
                            <><Check size={16} /> Export</>
                          )}
                        </button>
                      )}

                      <button
                        className="cancel-btn"
                        onClick={() => { setIsClipping(false); setClipStart(null); setClipEnd(null); }}
                        disabled={processing}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {isClipping && videoDuration > 0 && clipStart !== null && clipEnd !== null && (
                <ClipTimeline
                  duration={videoDuration}
                  clipStart={clipStart}
                  clipEnd={clipEnd}
                  onChangeStart={(val) => {
                    setClipStart(val);
                    if (videoRef.current) videoRef.current.currentTime = val;
                  }}
                  onChangeEnd={(val) => {
                    setClipEnd(val);
                    if (videoRef.current) videoRef.current.currentTime = val;
                  }}
                />
              )}
              
            </MediaPlayer>
          </div>

          <div className="player-footer">
            <div className="footer-actions">
              <button
                className={`compact-action-btn share ${shareCopied ? "copied" : ""}`}
                onClick={handleShare}
              >
                {shareCopied ? <Check size={18} /> : <Share2 size={18} />}
                <span>Share Clip</span>
              </button>
              
              <div className="compact-download">
                <button onClick={() => setShowDownload(!showDownload)} className="download-trigger">
                  <Download size={18} /> <span>Download Video</span>
                </button>
                {showDownload && (
                  <div className="compact-dropdown">
                    {availableVersions.map(v => (
                      <div key={v} onClick={() => {
                        window.open(`${MEDIA_ROOT}/${sportPath}/${folderPath}/${video.versions[v].filename}`, "_blank");
                        setShowDownload(false);
                      }}>
                        {v} version
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="tag-capture-pro">
              <div className="tag-inputs-row">
                <div className="mini-input-group">
                  <span className="mini-label">Jersey</span>
                  <input 
                    type="text" 
                    placeholder="#" 
                    value={activeJersey} 
                    onChange={e => setActiveJersey(e.target.value)}
                    className="jersey-mini"
                  />
                </div>
                <div className="mini-input-group">
                  <span className="mini-label">Position</span>
                  <select 
                    value={activeCategory} 
                    onChange={e => setActiveCategory(e.target.value as any)}
                    className="category-mini"
                  >
                    <option value="">Select...</option>
                    <option value="offense">Offense</option>
                    <option value="defense">Defense</option>
                    <option value="team">Team</option>
                  </select>
                </div>
              </div>
              
              <div className="quick-action-grid">
                <button onClick={() => addTag("goal", "Goal")} className="qa-btn goal" title="Goal">
                  <Trophy size={18} /> <span>Goal</span>
                </button>
                <button onClick={() => addTag("save", "Save")} className="qa-btn save" title="Save">
                  <Shield size={18} /> <span>Save</span>
                </button>
                <button onClick={() => addTag("play", "Big Play")} className="qa-btn play" title="Big Play">
                  <Zap size={18} /> <span>Big Play</span>
                </button>
                <button onClick={() => addTag("other", "Highlight")} className="qa-btn other" title="Other">
                  <Star size={18} /> <span>Highlight</span>
                </button>
              </div>
            </div>

            <div className="tag-pills-container">
              {tags.sort((a, b) => a.time - b.time).map(tag => (
                <div key={tag.id} className={`tag-pill ${tag.type}`} onClick={() => seekToTag(tag)}>
                  <span className="tag-pill-time">{formatDuration(tag.time * video.versions[currentMode].stretch_factor)}</span>
                  <span className="tag-pill-label">{tag.label} {tag.jerseyNumber ? `#${tag.jerseyNumber}` : ""}</span>
                  <button className="tag-pill-delete" onClick={(e) => { e.stopPropagation(); removeTag(tag.id); }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClipTimeline: FC<{
  duration: number;
  clipStart: number;
  clipEnd: number;
  onChangeStart: (val: number) => void;
  onChangeEnd: (val: number) => void;
}> = ({ duration, clipStart, clipEnd, onChangeStart, onChangeEnd }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (type: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();

    const onPointerMove = (moveEv: PointerEvent) => {
      let x = moveEv.clientX - rect.left;
      x = Math.max(0, Math.min(x, rect.width));
      const newTime = (x / rect.width) * duration;
      
      if (type === 'start') {
        onChangeStart(Math.min(newTime, clipEnd - 0.1));
      } else {
        onChangeEnd(Math.max(newTime, clipStart + 0.1));
      }
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  if (duration <= 0) return null;

  const leftPct = (clipStart / duration) * 100;
  const rightPct = ((duration - clipEnd) / duration) * 100;

  return (
    <div className="clip-timeline-container" onClick={(e) => e.stopPropagation()}>
      <div className="clip-timeline-track" ref={trackRef}>
        <div 
          className="clip-timeline-selection"
          style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
        />
        <div 
          className="clip-timeline-handle start-handle"
          style={{ left: `${leftPct}%` }}
          onPointerDown={handlePointerDown('start')}
        >
          <div className="handle-line" />
          <div className="handle-time">{formatDuration(clipStart)}</div>
        </div>
        <div 
          className="clip-timeline-handle end-handle"
          style={{ right: `${rightPct}%` }}
          onPointerDown={handlePointerDown('end')}
        >
          <div className="handle-line" />
          <div className="handle-time">{formatDuration(clipEnd)}</div>
        </div>
      </div>
    </div>
  );
};

export default App;
