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
}
