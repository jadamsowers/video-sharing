import os
import json
import subprocess
import re
from pathlib import Path

def get_video_info(file_path):
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=avg_frame_rate,duration,width,height',
        '-of', 'json',
        str(file_path)
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            print(f"ffprobe failed for {file_path}")
            return None
        data = json.loads(result.stdout)
        if 'streams' not in data or not data['streams']:
            print(f"No video streams found in {file_path}")
            return None
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        print(f"Error reading video info for {file_path}: {e}")
        return None
    
    stream = data['streams'][0]
    duration = float(stream.get('duration', 0))
    
    # avg_frame_rate is usually "num/den"
    fps_str = stream.get('avg_frame_rate', '0/1')
    if '/' in fps_str:
        num, den = map(int, fps_str.split('/'))
        fps = num / den if den != 0 else 0
    else:
        fps = float(fps_str)
        
    return {
        'duration': duration,
        'fps': fps,
        'width': stream.get('width'),
        'height': stream.get('height')
    }

def generate_thumbnail(video_path, thumbnail_path):
    cmd = [
        'ffmpeg',
        '-i', str(video_path),
        '-ss', '00:00:01',
        '-vframes', '1',
        '-vf', 'scale=480:-1',
        '-y',
        str(thumbnail_path)
    ]
    subprocess.run(cmd, capture_output=True, check=True)

def process_sport_folder(sport_path, existing_names=None):
    root = Path(sport_path)
    if not root.exists() or not root.is_dir():
        return None
        
    manifest = []
    # Pattern: Salem_2026-03-18_024_120fps.mp4
    pattern = re.compile(r'(.+)_(\d{4}-\d{2}-\d{2})_(\d+)_(\d+)fps\.mp4')
    
    for folder in root.iterdir():
        if not folder.is_dir() or folder.name.startswith('.'):
            print(f"Skipping non-directory: {folder.name}")
            continue
            
        folder_manifest = {
            'name': folder.name,
            'videos': []
        }
        
        video_groups = {}
        for file in folder.glob('*.mp4'):
            match = pattern.match(file.name)
            if not match:
                print
                continue
            
            opponent, date, clip_num, fps_label = match.groups()
            base_name = f"{opponent}_{date}_{clip_num}"
            
            if base_name not in video_groups:
                video_groups[base_name] = {
                    'opponent': opponent,
                    'date': date,
                    'clip_num': clip_num,
                    'versions': {}
                }
            
            info = get_video_info(file)
            if info:
                video_groups[base_name]['versions'][f"{fps_label}fps"] = {
                    'filename': file.name,
                    'capture_fps': int(fps_label),
                    'fps': info['fps'],
                    'duration': info['duration']
                }
                
                thumb_name = f"{base_name}_thumb.jpg"
                thumb_path = folder / thumb_name
                if not thumb_path.exists():
                    try:
                        generate_thumbnail(file, thumb_path)
                    except Exception as e:
                        print(f"Failed thumb for {file.name}: {e}")
                
                video_groups[base_name]['thumbnail'] = thumb_name
        
        # Load existing manifest to preserve tags
        existing_tags = {}
        manifest_file = folder / 'manifest.json'
        if manifest_file.exists():
            try:
                with open(manifest_file, 'r') as f:
                    old_manifest = json.load(f)
                    for v in old_manifest.get('videos', []):
                        if 'tags' in v:
                            key = f"{v['opponent']}_{v['date']}_{v['clip_num']}"
                            existing_tags[key] = v['tags']
            except Exception as e:
                print(f"Could not read existing manifest for tags: {e}")

        for base_name, data in video_groups.items():
            if not data['versions']:
                continue
                
            for v_name, v_data in data['versions'].items():
                v_data['stretch_factor'] = v_data['capture_fps'] / v_data['fps'] if v_data['fps'] > 0 else 1.0
            
            # Restore tags if they exist
            if base_name in existing_tags:
                data['tags'] = existing_tags[base_name]

            folder_manifest['videos'].append(data)
            
        folder_manifest['videos'].sort(key=lambda x: x['clip_num'])
        
        with open(folder / 'manifest.json', 'w') as f:
            json.dump(folder_manifest, f, indent=4)
            
        m_path = f"./{folder.name}/manifest.json"
        name = existing_names.get(m_path, folder.name) if existing_names else folder.name
        
        manifest.append({
            'name': name,
            'manifest_path': m_path
        })
        
    with open(root / 'folders.json', 'w') as f:
        json.dump(manifest, f, indent=4)
    
    return manifest

def run_multi_sport(root_video_dir):
    root = Path(root_video_dir)
    sports = []
    
    # Load existing folders.json if it exists to preserve names
    existing_folder_names = {}
    folders_file = root / 'folders.json'
    if folders_file.exists():
        try:
            with open(folders_file, 'r') as f:
                old_folders = json.load(f)
                for folder in old_folders:
                    if 'name' in folder and 'manifest_path' in folder:
                        existing_folder_names[folder['manifest_path']] = folder['name']
        except Exception:
            pass

    for sport_dir in root.iterdir():
        if not sport_dir.is_dir() or sport_dir.name.startswith('.'):
            continue
        
        print(f"Processing Sport: {sport_dir.name}")
        folders = process_sport_folder(sport_dir, existing_folder_names)
        
        sports.append({
            'id': sport_dir.name, # already clean: e.g. boys-lacrosse
            'name': sport_dir.name.replace('-', ' ').title(),
            'path': sport_dir.name,
            'has_content': len(folders) > 0 if folders else False
        })
            
    with open(root / 'sports.json', 'w') as f:
        json.dump(sports, f, indent=4)
    
    print(f"Generated sports.json with {len(sports)} sports.")

if __name__ == "__main__":
    import sys
    # Expecting /Volumes/Data/Videos
    path = sys.argv[1] if len(sys.argv) > 1 else "/Volumes/Data/Videos"
    run_multi_sport(path)
