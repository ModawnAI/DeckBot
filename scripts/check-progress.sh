#!/bin/bash

# Quick progress checker for PDF processing

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
OUTPUT_DIR="$PROJECT_ROOT/output"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}📊 DeckBot Processing Progress${NC}"
echo "================================"
echo ""

# Count PDFs
if [[ -f "$LOG_DIR/success.log" ]]; then
    completed=$(wc -l < "$LOG_DIR/success.log" | tr -d ' ')
else
    completed=0
fi

total_pdfs=$(find "$PROJECT_ROOT/pdf" -name "*.pdf" -type f | wc -l | tr -d ' ')

echo -e "${GREEN}Completed:${NC} $completed / $total_pdfs PDFs"
echo ""

# Show current task
if [[ -f "$LOG_DIR/processing-progress.txt" ]]; then
    current=$(cat "$LOG_DIR/processing-progress.txt")
    echo -e "${BLUE}Current:${NC} $current"
    echo ""
fi

# Show recently completed
if [[ -f "$LOG_DIR/success.log" ]]; then
    echo -e "${GREEN}Recently completed:${NC}"
    tail -n 5 "$LOG_DIR/success.log" | sed 's/^/  - /'
    echo ""
fi

# Show metadata files
metadata_count=$(find "$OUTPUT_DIR" -name "*_metadata.json" -type f | wc -l | tr -d ' ')
echo -e "${BLUE}Metadata files:${NC} $metadata_count"

# Show optimization stats
if [[ -f "$LOG_DIR/optimization.log" ]]; then
    opt_count=$(wc -l < "$LOG_DIR/optimization.log" | tr -d ' ')
    echo -e "${GREEN}Images optimized:${NC} $opt_count"
fi

echo ""
echo "Logs:"
echo "  Processing: tail -f logs/processing.log"
echo "  Optimization: tail -f logs/optimization.log"
echo "  Errors: cat logs/errors.log"
