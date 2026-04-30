export interface VideoVersion {
  filename: string;
  fps: number;
  capture_fps: number;
  duration: number;
  stretch_factor: number;
}

export interface Tag {
  id: string;
  label: string;
  time: number; // Reference time in seconds (at 1x speed)
  type: "goal" | "play" | "save" | "other";
  jerseyNumber?: string;
}

export interface VideoMetadata {
  opponent: string;
  date: string;
  clip_num: string;
  versions: {
    [key: string]: VideoVersion;
  };
  thumbnail: string;
  tags?: Tag[];
}

export interface Sport {
  id: string;
  name: string;
  path: string;
  has_content: boolean;
}

export interface FolderManifest {
  name: string;
  videos: VideoMetadata[];
  folder_path?: string;
}

export interface SavedClip {
  id: number;
  filename: string;
  sport_path: string;
  folder_name: string;
  source_clip: string;
  opponent: string | null;
  clip_date: string | null;
  start_time: number;
  duration: number;
  label: string | null;
  created_at: string;
  url: string; // derived: /clips/<filename>
}
