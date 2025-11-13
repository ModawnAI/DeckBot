# PDF Processing with Image Optimization

## Overview

This directory contains enhanced scripts for processing PDFs with automatic image optimization and metadata consolidation.

## 🚀 Quick Start

### Process All PDFs with Optimization

```bash
npm run process:optimized
```

This will:
1. Find all PDFs in the `pdf/` folder
2. Process each PDF (extract metadata, generate images)
3. **Optimize all images** (resize to ≤1920x1080, compress to ≤1MB)
4. **Consolidate metadata** into `output/metadata.json`
5. Upload to Vercel Blob storage
6. Log all operations

### Process a Single PDF

```bash
npm run process:optimized "your-pdf-name.pdf"
```

### Optimize Existing Images

If you already have processed images and want to re-optimize them:

```bash
npm run optimize:images
```

## 📁 Directory Structure

```
DeckBot/
├── pdf/                          # Place PDFs here for processing
├── images/                       # Generated images (optimized)
│   └── <pdf-name>/
│       ├── slide-001.png
│       ├── slide-002.png
│       └── ...
├── output/
│   ├── metadata.json             # 🆕 Consolidated metadata
│   ├── <pdf>_metadata.json       # Individual metadata files
│   └── ingested/                 # Archived after ingestion
├── logs/
│   ├── processing.log            # Main processing log
│   ├── optimization.log          # Image optimization details
│   ├── errors.log                # Error tracking
│   └── success.log               # Successfully processed PDFs
└── scripts/
    ├── process-and-optimize.sh   # 🆕 Main processing script
    └── optimize-images.sh        # 🆕 Standalone optimizer
```

## 🎨 Image Optimization Details

### Settings

- **Max Width**: 1920px (Full HD screen width)
- **Max Height**: 1080px (Full HD screen height)
- **Target Size**: ≤1MB per image
- **JPEG Quality**: 85% (when converting from PNG)

### Optimization Process

1. **Dimension Check**: If image > 1920x1080, resize while maintaining aspect ratio
2. **Size Check**: If image > 1MB after resize:
   - Convert PNG → JPEG with 85% quality
   - Compare sizes
   - Keep whichever is smaller
3. **Logging**: All optimizations logged with before/after stats

### Example Output

```
Optimizing: slide-001.png (2847KB)
  Original: 2560x1440 pixels, 2847KB
  Resizing to: 1920x1080
  Converting to JPEG with 85% quality
  Converted to JPEG: 456KB
  Final: 456KB (saved 2391KB / 84.0%)
```

## 📊 Metadata Consolidation

The script generates `/Users/kjyoo/DeckBot/deckbot-metadata.json` with a summary of all processed PDFs:

```json
{
  "exported_at": "2025-11-13T04:20:00.000Z",
  "total_companies": 24,
  "total_industries": 15,
  "total_unique_keywords": 1086,
  "companies": [
    "Company A",
    "Company B",
    ...
  ],
  "industries": [
    "Technology",
    "Healthcare",
    ...
  ],
  "keywords": [
    "keyword1",
    "keyword2",
    ...
  ]
}
```

### Features

- **Summary Format**: Companies, industries, and keywords extracted from all decks
- **Alphabetically Sorted**: All arrays sorted for easy navigation
- **Unique Values**: Automatically deduplicates entries
- **Timestamp**: Tracks when the metadata was generated
- **Comprehensive**: Includes files from both `output/` and `output/ingested/`

### Individual Metadata Files

Each processed PDF also generates its own detailed metadata file in `output/<pdf-name>_metadata.json`:

```json
{
  "deck_metadata": {
    "filename": "example.pdf",
    "company_name": "Company Inc.",
    "deck_industry": "Technology",
    "executive_summary": "...",
    "total_pages": 25,
    "pdf_url": "https://..."
  },
  "slide_data": [
    {
      "slide_number": 1,
      "slide_content": "...",
      "slide_summary": "...",
      "keywords": ["..."],
      "slide_layout": "...",
      "image_url": "https://..."
    }
  ]
}
```

## 🔧 Script Details

### `process-and-optimize.sh`

**Main comprehensive processing script**

**Features:**
- Processes PDFs using existing TypeScript pipeline
- Optimizes images automatically after generation
- Consolidates metadata into single JSON
- Detailed logging with color-coded output
- Progress tracking and error handling
- Can process all PDFs or single PDF

**Usage:**

```bash
# Process all PDFs in pdf/ folder
./scripts/process-and-optimize.sh

# Process specific PDF
./scripts/process-and-optimize.sh "example.pdf"

# Via npm
npm run process:optimized
npm run process:optimized "example.pdf"
```

### `optimize-images.sh`

**Standalone image optimization utility**

**Features:**
- Optimizes all existing images in `images/` directory
- Independent of PDF processing
- Useful for re-optimizing after changing settings
- Fast batch processing

**Usage:**

```bash
# Optimize all images
./scripts/optimize-images.sh

# Via npm
npm run optimize:images
```

## 📈 Logging

### Log Files

| File | Purpose | Content |
|------|---------|---------|
| `processing.log` | Main log | All processing steps and output |
| `optimization.log` | Image stats | Before/after sizes, savings % |
| `errors.log` | Error tracking | Failed operations with timestamps |
| `success.log` | Success tracking | Successfully processed PDF names |

### View Logs

```bash
# View processing log
tail -f logs/processing.log

# View optimization statistics
tail -n 50 logs/optimization.log

# Check for errors
cat logs/errors.log

# See what's been processed
cat logs/success.log
```

## 🎯 Workflow Examples

### Complete Pipeline

```bash
# 1. Add PDFs to pdf/ folder
cp ~/Documents/*.pdf ./pdf/

# 2. Process with optimization
npm run process:optimized

# 3. Check logs
tail logs/optimization.log

# 4. Verify metadata
cat output/metadata.json | jq '.[] | .deck_metadata.filename'

# 5. Ingest to Pinecone
npm run ingest:archive
```

### Re-optimize Existing Images

```bash
# If you've already processed PDFs but want better compression
npm run optimize:images
```

### Process Single New PDF

```bash
# Add one PDF
cp ~/new-deck.pdf ./pdf/

# Process just that PDF
npm run process:optimized "new-deck.pdf"
```

## ⚙️ Configuration

Edit settings in the scripts if needed:

### Image Quality Settings

In `process-and-optimize.sh`:

```bash
MAX_IMAGE_WIDTH=1920        # Adjust max width
MAX_IMAGE_HEIGHT=1080       # Adjust max height
TARGET_FILE_SIZE_KB=1024    # Target 1MB (adjust if needed)
JPEG_QUALITY=85             # JPEG quality 0-100
```

### Processing Settings

- **Concurrency**: TypeScript pipeline uses parallel processing
- **Delays**: 2-second delay between PDFs to avoid rate limits
- **Retries**: Errors logged but processing continues

## 🐛 Troubleshooting

### Images too large

If images are still > 1MB:
- Lower `JPEG_QUALITY` (try 75-80)
- Reduce `MAX_IMAGE_WIDTH` (try 1280px)

### Images too small/blurry

If images are too compressed:
- Increase `JPEG_QUALITY` (try 90-95)
- Increase `TARGET_FILE_SIZE_KB` (try 2048 for 2MB)

### Script fails

Check logs:
```bash
tail -n 100 logs/errors.log
```

Common issues:
- **pdftoppm not found**: Install poppler-utils: `brew install poppler`
- **sips not found**: macOS only (use alternative script for Linux)
- **jq not found**: Install jq: `brew install jq`
- **Permission denied**: Make scripts executable: `chmod +x scripts/*.sh`

### Metadata not consolidating

Ensure:
- `jq` is installed: `brew install jq`
- Output directory exists: `mkdir -p output`
- JSON files are valid: `jq . output/*_metadata.json`

## 📝 Notes

### Image Format

- **PNG** preserved if already under 1MB
- **JPEG** used for larger images (better compression)
- **Format**: Images maintain original names (`slide-NNN.png` or `.jpg`)

### Performance

- **Processing Speed**: ~30-60 seconds per PDF (depending on size)
- **Optimization Speed**: ~1-2 seconds per image
- **Parallel Processing**: Images processed in parallel where possible

### Storage

- **Vercel Blob**: Optimized images uploaded (reduces storage costs)
- **Local**: Optimized images kept locally (can delete after upload)
- **Metadata**: Stored in JSON (very small, ~100-500KB per deck)

## 🔗 Related Scripts

- `process-all-pdfs.sh` - Original batch processor (no optimization)
- `process-single.ts` - TypeScript single PDF processor
- `ingest-and-archive.sh` - Pinecone ingestion and archival

## 📚 Next Steps

After processing and optimization:

1. **Verify**: Check `output/metadata.json` for completeness
2. **Ingest**: Upload to Pinecone with `npm run ingest:archive`
3. **Query**: Test search with `npm run query -- "your query"`
4. **Archive**: Processed files moved to `output/ingested/`

## 🎉 Benefits

### Before Optimization
- Images: 2-5MB each (PNG)
- Storage: ~500MB for 100-page deck
- Load time: Slow web viewing

### After Optimization
- Images: 200-800KB each (optimized)
- Storage: ~50-150MB for 100-page deck
- Load time: Fast web viewing
- **Savings**: 60-80% size reduction

## 📞 Support

For issues or questions:
1. Check logs in `logs/` directory
2. Review this README
3. Check error messages for hints
4. Ensure all dependencies installed
