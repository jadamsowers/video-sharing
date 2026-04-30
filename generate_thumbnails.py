import os
import sys
import subprocess
import json
import math

def generate_vtt_and_sprite(video_path, interval=2, width=160, columns=10):
    """
    Generates a sprite sheet and a WebVTT file for video scrubber thumbnails.
    - interval: seconds between each thumbnail
    - width: width of each thumbnail in the sprite
    - columns: number of columns in the sprite sheet grid
    """
    basename = os.path.splitext(os.path.basename(video_path))[0]
    out_dir = os.path.dirname(video_path)
    if not out_dir: out_dir = "."
    
    sprite_path = os.path.join(out_dir, f"{basename}_sprite.jpg")
    vtt_path = os.path.join(out_dir, f"{basename}_thumbnails.vtt")
    
    print(f"Analyzing {video_path}...")
    
    # Get video duration and dimensions
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "format=duration:stream=width,height",
        "-of", "json", video_path
    ]
    try:
        info_json = subprocess.check_output(cmd).decode('utf-8')
        info = json.loads(info_json)
        duration = float(info['format']['duration'])
        orig_w = int(info['streams'][0]['width'])
        orig_h = int(info['streams'][0]['height'])
    except Exception as e:
        print(f"Error reading video info: {e}")
        sys.exit(1)
    
    # Calculate dimensions
    height = int((width / orig_w) * orig_h)
    num_thumbnails = math.ceil(duration / interval)
    rows = math.ceil(num_thumbnails / columns)
    
    print(f"Generating sprite sheet ({columns}x{rows} grid) at {interval}s intervals...")
    
    # Generate sprite sheet using ffmpeg
    ffmpeg_cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-filter_complex", f"fps=1/{interval},scale={width}:{height},tile={columns}x{rows}",
        "-frames:v", "1",
        "-q:v", "3",  # JPEG quality (lower is better, 2-5 is good)
        sprite_path
    ]
    subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    print(f"Generating WebVTT file...")
    
    # Generate VTT file
    with open(vtt_path, 'w') as f:
        f.write("WEBVTT\n\n")
        
        for i in range(num_thumbnails):
            start_time = i * interval
            end_time = min((i + 1) * interval, duration)
            
            # Format times as HH:MM:SS.mmm
            def format_time(seconds):
                h = int(seconds // 3600)
                m = int((seconds % 3600) // 60)
                s = seconds % 60
                return f"{h:02d}:{m:02d}:{s:06.3f}"
            
            col = i % columns
            row = i // columns
            x = col * width
            y = row * height
            
            f.write(f"{format_time(start_time)} --> {format_time(end_time)}\n")
            f.write(f"{basename}_sprite.jpg#xywh={x},{y},{width},{height}\n\n")

    print(f"✅ Done!\nSprite: {sprite_path}\nVTT: {vtt_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <video_file>")
        sys.exit(1)
    generate_vtt_and_sprite(sys.argv[1])
