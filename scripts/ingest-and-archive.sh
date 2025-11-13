#!/bin/bash

# ============================================================================
# Ingest JSON files and move them to ingested folder
# ============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/output"
INGESTED_DIR="$OUTPUT_DIR/ingested"

# Create ingested directory if it doesn't exist
mkdir -p "$INGESTED_DIR"

# Change to project root
cd "$PROJECT_ROOT"

echo -e "${BLUE}[INFO]${NC} 🚀 Starting ingestion and archival process"
echo ""

# Count JSON files to process
json_count=$(find "$OUTPUT_DIR" -maxdepth 1 -name "*.json" -type f | wc -l | tr -d ' ')

if [[ $json_count -eq 0 ]]; then
    echo -e "${YELLOW}[WARNING]${NC} No JSON files found in $OUTPUT_DIR"
    exit 0
fi

echo -e "${BLUE}[INFO]${NC} Found $json_count JSON files to ingest"
echo ""

# Run ingestion
echo -e "${BLUE}[INFO]${NC} 📤 Running Pinecone ingestion..."
echo ""

if npm run ingest; then
    echo ""
    echo -e "${GREEN}[SUCCESS]${NC} ✅ Ingestion complete!"
    echo ""

    # Move files to ingested folder
    echo -e "${BLUE}[INFO]${NC} 📁 Moving files to ingested folder..."

    moved=0
    for json_file in "$OUTPUT_DIR"/*.json; do
        if [[ -f "$json_file" ]]; then
            filename=$(basename "$json_file")
            mv "$json_file" "$INGESTED_DIR/"
            echo -e "${GREEN}[MOVED]${NC} $filename"
            moved=$((moved + 1))
        fi
    done

    echo ""
    echo -e "${GREEN}[SUCCESS]${NC} Moved $moved files to $INGESTED_DIR"
    echo ""
else
    echo ""
    echo -e "${YELLOW}[WARNING]${NC} Ingestion failed - files NOT moved"
    exit 1
fi
