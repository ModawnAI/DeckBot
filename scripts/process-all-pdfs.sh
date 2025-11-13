#!/bin/bash

# ============================================================================
# DeckBot - Batch PDF Processing Script
# ============================================================================
# Processes all PDFs in the pdf/ directory, uploads to Vercel Blob,
# generates metadata JSON, and ingests into Pinecone
# ============================================================================

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PDF_DIR="$PROJECT_ROOT/pdf"
OUTPUT_DIR="$PROJECT_ROOT/output"
LOG_DIR="$PROJECT_ROOT/logs"
PROGRESS_FILE="$LOG_DIR/processing-progress.txt"
ERROR_LOG="$LOG_DIR/processing-errors.log"
SUCCESS_LOG="$LOG_DIR/processing-success.log"

# Create necessary directories
mkdir -p "$LOG_DIR"
mkdir -p "$OUTPUT_DIR"

# Initialize logs if they don't exist
touch "$PROGRESS_FILE"
touch "$ERROR_LOG"
touch "$SUCCESS_LOG"

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if a PDF has already been processed
is_processed() {
    local pdf_name="$1"
    grep -Fxq "$pdf_name" "$SUCCESS_LOG" 2>/dev/null
}

# Mark PDF as processed
mark_processed() {
    local pdf_name="$1"
    echo "$pdf_name" >> "$SUCCESS_LOG"
}

# Log error
log_pdf_error() {
    local pdf_name="$1"
    local error_msg="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $pdf_name: $error_msg" >> "$ERROR_LOG"
}

# Update progress
update_progress() {
    local current="$1"
    local total="$2"
    local pdf_name="$3"
    echo "[$current/$total] $pdf_name" > "$PROGRESS_FILE"
}

# Get count of successfully processed PDFs
get_processed_count() {
    wc -l < "$SUCCESS_LOG" 2>/dev/null || echo "0"
}

# Process a single PDF
process_pdf() {
    local pdf_file="$1"
    local pdf_name=$(basename "$pdf_file")

    log_info "Processing: $pdf_name"

    # Run the processing script
    if npm run process:single "$pdf_name" 2>&1 | tee -a "$LOG_DIR/${pdf_name%.pdf}.log"; then
        log_success "Completed: $pdf_name"
        mark_processed "$pdf_name"
        return 0
    else
        log_error "Failed: $pdf_name"
        log_pdf_error "$pdf_name" "Processing failed with exit code $?"
        return 1
    fi
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    log_info "🤖 DeckBot - Batch PDF Processing"
    log_info "=================================="
    echo ""

    # Check if PDF directory exists
    if [[ ! -d "$PDF_DIR" ]]; then
        log_error "PDF directory not found: $PDF_DIR"
        exit 1
    fi

    # Count total PDFs
    shopt -s nullglob
    pdf_files=("$PDF_DIR"/*.pdf)
    total_pdfs=${#pdf_files[@]}

    if [[ $total_pdfs -eq 0 ]]; then
        log_warning "No PDF files found in $PDF_DIR"
        exit 0
    fi

    log_info "Found $total_pdfs PDF files"

    # Count already processed
    processed_count=$(get_processed_count)
    remaining=$((total_pdfs - processed_count))

    log_info "Already processed: $processed_count"
    log_info "Remaining: $remaining"
    echo ""

    if [[ $remaining -eq 0 ]]; then
        log_success "All PDFs already processed!"
        echo ""
        log_info "Run ingestion: npm run ingest"
        exit 0
    fi

    # Ask for confirmation
    read -p "Process $remaining remaining PDFs? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled by user"
        exit 0
    fi

    echo ""
    log_info "Starting batch processing..."
    echo ""

    # Process each PDF
    local current=0
    local success=0
    local failed=0
    local skipped=0

    for pdf_file in "${pdf_files[@]}"; do
        current=$((current + 1))
        pdf_name=$(basename "$pdf_file")

        # Update progress
        update_progress "$current" "$total_pdfs" "$pdf_name"

        # Print progress header
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "[$current/$total_pdfs] $pdf_name"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        # Skip if already processed
        if is_processed "$pdf_name"; then
            log_warning "Already processed - skipping"
            skipped=$((skipped + 1))
            continue
        fi

        # Process the PDF
        if process_pdf "$pdf_file"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))

            # Ask if user wants to continue on error
            if [[ $failed -ge 3 ]]; then
                log_warning "Multiple failures detected ($failed total)"
                read -p "Continue processing? (y/N) " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    log_info "Stopped by user after $failed failures"
                    break
                fi
            fi
        fi

        # Small delay to avoid rate limits
        sleep 2
    done

    # ========================================================================
    # Final Summary
    # ========================================================================

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📊 PROCESSING COMPLETE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    log_info "Total PDFs: $total_pdfs"
    log_success "Successfully processed: $success"
    log_error "Failed: $failed"
    log_warning "Skipped (already done): $skipped"
    echo ""

    # Show errors if any
    if [[ $failed -gt 0 ]]; then
        log_error "Failed PDFs (see $ERROR_LOG for details):"
        tail -n "$failed" "$ERROR_LOG" | sed 's/^/  /'
        echo ""
    fi

    # Next steps
    if [[ $success -gt 0 ]]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "📤 NEXT STEP: Ingest into Pinecone"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        log_info "Run the following command to ingest all processed JSONs:"
        echo ""
        echo "  npm run ingest"
        echo ""
        echo "Or run the full pipeline (process + ingest):"
        echo ""
        echo "  npm run process-ingest \"<filename>.pdf\""
        echo ""
    fi
}

# ============================================================================
# Script Entry Point
# ============================================================================

# Trap errors and cleanup
trap 'log_error "Script interrupted"; exit 130' INT TERM

# Change to project root
cd "$PROJECT_ROOT"

# Run main function
main "$@"
