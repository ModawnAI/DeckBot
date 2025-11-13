#!/bin/bash

# ============================================================================
# Standalone Image Optimization Script
# ============================================================================
# Optimizes existing images in the images/ directory
# Can be run independently to re-optimize images after processing
# ============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGES_DIR="$PROJECT_ROOT/images"
LOG_DIR="$PROJECT_ROOT/logs"
OPTIMIZATION_LOG="$LOG_DIR/image-optimization.log"

# Optimization settings
MAX_IMAGE_WIDTH=1920
MAX_IMAGE_HEIGHT=1080
TARGET_FILE_SIZE_KB=1024
JPEG_QUALITY=85

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

# ============================================================================
# Functions
# ============================================================================

get_file_size_kb() {
    local file="$1"
    stat -f%z "$file" | awk '{print int($1/1024)}'
}

get_image_dimensions() {
    local file="$1"
    sips -g pixelWidth -g pixelHeight "$file" 2>/dev/null | \
        awk '/pixelWidth|pixelHeight/ {print $2}' | \
        tr '\n' ' '
}

optimize_image() {
    local image_path="$1"
    local original_size_kb=$(get_file_size_kb "$image_path")
    local dimensions=$(get_image_dimensions "$image_path")
    local width=$(echo "$dimensions" | awk '{print $1}')
    local height=$(echo "$dimensions" | awk '{print $2}')

    # Resize if needed
    if [[ $width -gt $MAX_IMAGE_WIDTH ]] || [[ $height -gt $MAX_IMAGE_HEIGHT ]]; then
        local ratio_w=$(echo "scale=4; $MAX_IMAGE_WIDTH / $width" | bc)
        local ratio_h=$(echo "scale=4; $MAX_IMAGE_HEIGHT / $height" | bc)
        local ratio=$(echo "$ratio_w $ratio_h" | awk '{print ($1 < $2) ? $1 : $2}')
        local new_width=$(echo "$width * $ratio" | bc | awk '{print int($1)}')
        local new_height=$(echo "$height * $ratio" | bc | awk '{print int($1)}')

        sips -z "$new_height" "$new_width" "$image_path" >/dev/null 2>&1
    fi

    # Convert to JPEG if still too large
    local current_size_kb=$(get_file_size_kb "$image_path")
    if [[ $current_size_kb -gt $TARGET_FILE_SIZE_KB ]]; then
        local dir=$(dirname "$image_path")
        local basename=$(basename "$image_path" .png)
        local jpeg_path="${dir}/${basename}.jpg"

        sips -s format jpeg -s formatOptions "$JPEG_QUALITY" "$image_path" --out "$jpeg_path" >/dev/null 2>&1
        local jpeg_size_kb=$(get_file_size_kb "$jpeg_path")

        if [[ $jpeg_size_kb -lt $current_size_kb ]]; then
            rm "$image_path"
            mv "$jpeg_path" "$image_path"
        else
            rm "$jpeg_path"
        fi
    fi

    local final_size_kb=$(get_file_size_kb "$image_path")
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $(basename "$image_path"): ${original_size_kb}KB → ${final_size_kb}KB" >> "$OPTIMIZATION_LOG"
}

# ============================================================================
# Main
# ============================================================================

echo -e "${BLUE}🖼️  Image Optimization Script${NC}"
echo "=================================="

if [[ ! -d "$IMAGES_DIR" ]]; then
    echo -e "${YELLOW}⚠️  Images directory not found: $IMAGES_DIR${NC}"
    exit 1
fi

# Find all PNG and JPG files
mapfile -t image_files < <(find "$IMAGES_DIR" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \))

total_images=${#image_files[@]}

if [[ $total_images -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  No images found in $IMAGES_DIR${NC}"
    exit 0
fi

echo "Found $total_images images to optimize"
echo ""

optimized=0
for image_file in "${image_files[@]}"; do
    echo -n "Optimizing: $(basename "$image_file")... "
    optimize_image "$image_file"
    echo -e "${GREEN}✓${NC}"
    optimized=$((optimized + 1))
done

echo ""
echo -e "${GREEN}✅ Optimized $optimized images${NC}"
echo "Log: $OPTIMIZATION_LOG"
