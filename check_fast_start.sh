#!/bin/bash

# Check if a directory or file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <video.mp4 or directory>"
    exit 1
fi

# Function to check a single file
check_file() {
    local file="$1"
    
    # We use ffprobe trace to see the atom structure of the file
    # grep -n gives us the line number where the atom appears in the trace output
    local moov_line=$(ffprobe -v trace "$file" 2>&1 | grep -n -m 1 "type:'moov'" | cut -d: -f1)
    local mdat_line=$(ffprobe -v trace "$file" 2>&1 | grep -n -m 1 "type:'mdat'" | cut -d: -f1)

    if [ -z "$moov_line" ] || [ -z "$mdat_line" ]; then
        echo -e "\033[33m[$file]\033[0m -> ⚠️  ERROR: Could not find moov or mdat atoms (ensure it's an MP4/MOV)"
        return
    fi

    # If the moov atom appears before the mdat (media data) atom, it supports fast start
    if [ "$moov_line" -lt "$mdat_line" ]; then
        echo -e "\033[36m[$file]\033[0m -> ✅ FAST START SUPPORTED (moov is before mdat)"
    else
        echo -e "\033[36m[$file]\033[0m -> ❌ NO FAST START (mdat is before moov)"
    fi
}

# If it's a file, check just that file
if [ -f "$1" ]; then
    check_file "$1"
# If it's a directory, find all mp4/mov files and check them
elif [ -d "$1" ]; then
    find "$1" -type f \( -iname "*.mp4" -o -iname "*.mov" -o -iname "*.m4v" \) | while read -r f; do
        check_file "$f"
    done
else
    echo "Error: $1 is not a valid file or directory"
    exit 1
fi
