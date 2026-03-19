export interface VideoVersion {
  filename: string;
  fps: number;
  capture_fps: number;
  duration: number;
  stretch_factor: number;
}

export interface VideoMetadata {
  opponent: string;
  date: string;
  clip_num: string;
  versions: {
    [key: string]: VideoVersion;
  };
  thumbnail: string;
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
