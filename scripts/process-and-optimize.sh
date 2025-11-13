#!/bin/bash

# ============================================================================
# DeckBot - Comprehensive PDF Processing with Image Optimization
# ============================================================================
# This script:
# 1. Monitors pdf/ folder for new PDFs
# 2. Processes PDFs using the TypeScript pipeline
# 3. Optimizes images (max 1MB, screen-optimized)
# 4. Consolidates metadata.json files
# 5. Archives processed files
# ============================================================================

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PDF_DIR="$PROJECT_ROOT/pdf"
OUTPUT_DIR="$PROJECT_ROOT/output"
IMAGES_DIR="$PROJECT_ROOT/images"
INGESTED_DIR="$OUTPUT_DIR/ingested"
LOG_DIR="$PROJECT_ROOT/logs"

# Optimization settings
MAX_IMAGE_WIDTH=1920        # Max width for screen viewing
MAX_IMAGE_HEIGHT=1080       # Max height for screen viewing
TARGET_FILE_SIZE_KB=1024    # 1MB in KB
JPEG_QUALITY=85             # JPEG quality (80-90 is good for web)

# Logs
PROCESSING_LOG="$LOG_DIR/processing.log"
OPTIMIZATION_LOG="$LOG_DIR/optimization.log"
ERROR_LOG="$LOG_DIR/errors.log"
SUCCESS_LOG="$LOG_DIR/success.log"

# Create necessary directories
mkdir -p "$LOG_DIR" "$OUTPUT_DIR" "$IMAGES_DIR" "$INGESTED_DIR"

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

log() {
    echo -e "$1" | tee -a "$PROCESSING_LOG"
}

log_info() {
    log "${BLUE}[INFO]${NC} $1"
}

log_success() {
    log "${GREEN}[✓]${NC} $1"
}

log_error() {
    log "${RED}[✗]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$ERROR_LOG"
}

log_warning() {
    log "${YELLOW}[⚠]${NC} $1"
}

log_step() {
    log "\n${CYAN}[STEP]${NC} $1"
}

# ============================================================================
# IMAGE OPTIMIZATION FUNCTIONS
# ============================================================================

get_file_size_kb() {
    local file="$1"
    if [[ -f "$file" ]]; then
        stat -f%z "$file" | awk '{print int($1/1024)}'
    else
        echo "0"
    fi
}

get_image_dimensions() {
    local file="$1"
    sips -g pixelWidth -g pixelHeight "$file" 2>/dev/null | \
        awk '/pixelWidth|pixelHeight/ {print $2}' | \
        tr '\n' ' ' | \
        awk '{print $1, $2}'
}

optimize_image() {
    local image_path="$1"
    local original_size_kb=$(get_file_size_kb "$image_path")

    log_info "Optimizing: $(basename "$image_path") (${original_size_kb}KB)"

    # Get original dimensions
    local dimensions=$(get_image_dimensions "$image_path")
    local width=$(echo "$dimensions" | awk '{print $1}')
    local height=$(echo "$dimensions" | awk '{print $2}')

    log_info "  Original: ${width}x${height} pixels, ${original_size_kb}KB"

    # Calculate new dimensions if needed (maintain aspect ratio)
    local new_width=$width
    local new_height=$height

    if [[ $width -gt $MAX_IMAGE_WIDTH ]] || [[ $height -gt $MAX_IMAGE_HEIGHT ]]; then
        local ratio_w=$(echo "scale=4; $MAX_IMAGE_WIDTH / $width" | bc)
        local ratio_h=$(echo "scale=4; $MAX_IMAGE_HEIGHT / $height" | bc)

        # Use the smaller ratio to ensure both dimensions fit
        local ratio
        if (( $(echo "$ratio_w < $ratio_h" | bc -l) )); then
            ratio=$ratio_w
        else
            ratio=$ratio_h
        fi

        new_width=$(echo "$width * $ratio" | bc | awk '{print int($1)}')
        new_height=$(echo "$height * $ratio" | bc | awk '{print int($1)}')

        log_info "  Resizing to: ${new_width}x${new_height}"
        sips -z "$new_height" "$new_width" "$image_path" >/dev/null 2>&1
    fi

    # If still too large, convert to JPEG with compression
    local current_size_kb=$(get_file_size_kb "$image_path")

    if [[ $current_size_kb -gt $TARGET_FILE_SIZE_KB ]]; then
        log_info "  Converting to JPEG with ${JPEG_QUALITY}% quality"

        local dir=$(dirname "$image_path")
        local basename=$(basename "$image_path" .png)
        local jpeg_path="${dir}/${basename}.jpg"

        # Convert PNG to JPEG with quality setting
        sips -s format jpeg -s formatOptions "$JPEG_QUALITY" "$image_path" --out "$jpeg_path" >/dev/null 2>&1

        # Check JPEG size
        local jpeg_size_kb=$(get_file_size_kb "$jpeg_path")

        if [[ $jpeg_size_kb -lt $TARGET_FILE_SIZE_KB ]] && [[ $jpeg_size_kb -lt $current_size_kb ]]; then
            # JPEG is smaller and under limit, use it
            rm "$image_path"
            mv "$jpeg_path" "$image_path"
            current_size_kb=$jpeg_size_kb
            log_success "  Converted to JPEG: ${jpeg_size_kb}KB"
        else
            # JPEG not better, keep PNG
            rm "$jpeg_path"
            log_warning "  JPEG conversion didn't improve size, keeping PNG"
        fi
    fi

    local final_size_kb=$(get_file_size_kb "$image_path")
    local savings=$((original_size_kb - final_size_kb))
    local savings_pct=0

    if [[ $original_size_kb -gt 0 ]]; then
        savings_pct=$(echo "scale=1; ($savings * 100) / $original_size_kb" | bc)
    fi

    log_success "  Final: ${final_size_kb}KB (saved ${savings}KB / ${savings_pct}%)"

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $(basename "$image_path"): ${original_size_kb}KB → ${final_size_kb}KB (-${savings_pct}%)" >> "$OPTIMIZATION_LOG"

    return 0
}

optimize_all_images() {
    local pdf_basename="$1"
    local image_dir="$IMAGES_DIR/$pdf_basename"

    if [[ ! -d "$image_dir" ]]; then
        log_warning "Image directory not found: $image_dir"
        return 1
    fi

    log_step "Optimizing images for: $pdf_basename"

    local image_files=("$image_dir"/*.png)
    local total_images=${#image_files[@]}
    local optimized=0
    local failed=0
    local total_original=0
    local total_final=0

    for image_file in "${image_files[@]}"; do
        if [[ -f "$image_file" ]]; then
            local original_size=$(get_file_size_kb "$image_file")
            total_original=$((total_original + original_size))

            if optimize_image "$image_file"; then
                optimized=$((optimized + 1))
                local final_size=$(get_file_size_kb "$image_file")
                total_final=$((total_final + final_size))
            else
                failed=$((failed + 1))
                total_final=$((total_final + original_size))
            fi
        fi
    done

    local total_saved=$((total_original - total_final))
    local total_saved_pct=0
    if [[ $total_original -gt 0 ]]; then
        total_saved_pct=$(echo "scale=1; ($total_saved * 100) / $total_original" | bc)
    fi

    log_success "Optimization complete: ${optimized}/${total_images} images"
    log_success "Total size: ${total_original}KB → ${total_final}KB (saved ${total_saved}KB / ${total_saved_pct}%)"

    return 0
}

# ============================================================================
# METADATA CONSOLIDATION
# ============================================================================

consolidate_metadata() {
    log_step "Consolidating metadata into deckbot-metadata.json"

    local output_file="$PROJECT_ROOT/deckbot-metadata.json"
    local temp_file="$PROJECT_ROOT/deckbot-metadata.tmp.json"

    # Find all metadata JSON files (both in output and ingested)
    local json_files=()
    if [[ -d "$OUTPUT_DIR" ]]; then
        mapfile -t output_files < <(find "$OUTPUT_DIR" -maxdepth 1 -name "*_metadata.json" -type f)
        json_files+=("${output_files[@]}")
    fi
    if [[ -d "$INGESTED_DIR" ]]; then
        mapfile -t ingested_files < <(find "$INGESTED_DIR" -name "*_metadata.json" -type f)
        json_files+=("${ingested_files[@]}")
    fi

    if [[ ${#json_files[@]} -eq 0 ]]; then
        log_warning "No metadata files found to consolidate"
        return 1
    fi

    log_info "Found ${#json_files[@]} metadata files to process"

    # Extract companies, industries, and keywords
    local companies_json=$(mktemp)
    local industries_json=$(mktemp)
    local keywords_json=$(mktemp)

    echo "[]" > "$companies_json"
    echo "[]" > "$industries_json"
    echo "[]" > "$keywords_json"

    for json_file in "${json_files[@]}"; do
        if [[ -f "$json_file" ]]; then
            # Extract company name
            jq -r '.deck_metadata.company_name // empty' "$json_file" >> "$companies_json.txt" 2>/dev/null || true

            # Extract industry
            jq -r '.deck_metadata.deck_industry // empty' "$json_file" >> "$industries_json.txt" 2>/dev/null || true

            # Extract keywords
            jq -r '.slide_data[]?.keywords[]? // empty' "$json_file" >> "$keywords_json.txt" 2>/dev/null || true
        fi
    done

    # Sort and unique
    local companies_array=$(cat "$companies_json.txt" 2>/dev/null | grep -v '^$' | sort -u | jq -R . | jq -s .)
    local industries_array=$(cat "$industries_json.txt" 2>/dev/null | grep -v '^$' | sort -u | jq -R . | jq -s .)
    local keywords_array=$(cat "$keywords_json.txt" 2>/dev/null | grep -v '^$' | sort -u | jq -R . | jq -s .)

    # Count totals
    local total_companies=$(echo "$companies_array" | jq 'length')
    local total_industries=$(echo "$industries_array" | jq 'length')
    local total_keywords=$(echo "$keywords_array" | jq 'length')

    # Create final JSON
    jq -n \
        --arg exported_at "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")" \
        --argjson total_companies "$total_companies" \
        --argjson total_industries "$total_industries" \
        --argjson total_keywords "$total_keywords" \
        --argjson companies "$companies_array" \
        --argjson industries "$industries_array" \
        --argjson keywords "$keywords_array" \
        '{
            exported_at: $exported_at,
            total_companies: $total_companies,
            total_industries: $total_industries,
            total_unique_keywords: $total_keywords,
            companies: $companies,
            industries: $industries,
            keywords: $keywords
        }' > "$output_file"

    # Cleanup temp files
    rm -f "$companies_json" "$industries_json" "$keywords_json"
    rm -f "$companies_json.txt" "$industries_json.txt" "$keywords_json.txt"

    log_success "Consolidated metadata saved to: $output_file"
    log_info "  Companies: $total_companies"
    log_info "  Industries: $total_industries"
    log_info "  Keywords: $total_keywords"
}

# ============================================================================
# PDF PROCESSING
# ============================================================================

process_single_pdf() {
    local pdf_file="$1"
    local pdf_name=$(basename "$pdf_file")
    local pdf_basename="${pdf_name%.pdf}"

    log "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_step "Processing: $pdf_name"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Step 1: Process PDF with TypeScript pipeline
    log_step "Running TypeScript PDF processor"
    if npm run process:single "$pdf_name" 2>&1 | tee -a "$PROCESSING_LOG"; then
        log_success "PDF processing complete"
    else
        log_error "PDF processing failed"
        return 1
    fi

    # Step 2: Optimize images
    log_step "Optimizing generated images"

    # Sanitize filename for image directory (matches TypeScript sanitization)
    local sanitized_basename=$(echo "$pdf_basename" | \
        sed 's/ /_/g' | \
        sed 's/[()[\]]//g' | \
        sed 's/[^a-zA-Z0-9_.-]/_/g')

    if optimize_all_images "$sanitized_basename"; then
        log_success "Image optimization complete"
    else
        log_warning "Image optimization had issues (continuing anyway)"
    fi

    # Step 3: Consolidate metadata
    consolidate_metadata

    # Mark as successfully processed
    echo "$pdf_name" >> "$SUCCESS_LOG"
    log_success "✅ Successfully processed: $pdf_name"

    return 0
}

# ============================================================================
# BATCH PROCESSING
# ============================================================================

process_all_pdfs() {
    log_info "🚀 DeckBot - Batch PDF Processing with Optimization"
    log_info "=================================================="

    # Check PDF directory
    if [[ ! -d "$PDF_DIR" ]]; then
        log_error "PDF directory not found: $PDF_DIR"
        exit 1
    fi

    # Find PDFs
    shopt -s nullglob
    local pdf_files=("$PDF_DIR"/*.pdf)
    local total_pdfs=${#pdf_files[@]}

    if [[ $total_pdfs -eq 0 ]]; then
        log_warning "No PDF files found in $PDF_DIR"
        exit 0
    fi

    log_info "Found $total_pdfs PDF files\n"

    # Process each PDF
    local success=0
    local failed=0
    local current=0

    for pdf_file in "${pdf_files[@]}"; do
        current=$((current + 1))

        if process_single_pdf "$pdf_file"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi

        # Small delay between files
        if [[ $current -lt $total_pdfs ]]; then
            sleep 2
        fi
    done

    # Final summary
    log "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📊 PROCESSING SUMMARY"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Total: $total_pdfs PDFs"
    log_success "Success: $success"
    log_error "Failed: $failed"

    if [[ -f "$OPTIMIZATION_LOG" ]]; then
        log "\n${CYAN}Optimization Statistics:${NC}"
        tail -n 20 "$OPTIMIZATION_LOG" | tee -a "$PROCESSING_LOG"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    cd "$PROJECT_ROOT"

    # Initialize log
    echo "=== Processing started at $(date) ===" >> "$PROCESSING_LOG"

    if [[ $# -eq 0 ]]; then
        # No arguments - process all PDFs
        process_all_pdfs
    else
        # Process specific PDF
        local pdf_name="$1"
        local pdf_path="$PDF_DIR/$pdf_name"

        if [[ ! -f "$pdf_path" ]]; then
            log_error "PDF file not found: $pdf_path"
            exit 1
        fi

        process_single_pdf "$pdf_path"
    fi

    log_success "\n🎉 All done!\n"
}

# Handle interrupts
trap 'log_error "Script interrupted by user"; exit 130' INT TERM

# Run main
main "$@"
