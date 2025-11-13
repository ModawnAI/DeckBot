# 🚀 Batch PDF Processing Guide

Comprehensive guide for processing all PDFs in the `/pdf` directory with progress tracking and error recovery.

---

## 📋 Overview

The batch processing script (`process-all-pdfs.sh`) automates the complete workflow:

1. **Process PDF** → Extract metadata with Gemini
2. **Upload to Blob** → Upload PDF and images to Vercel Blob
3. **Generate JSON** → Save metadata JSON with blob URLs
4. **Track Progress** → Resume from where you left off
5. **Error Handling** → Skip failures, continue processing

---

## 🎯 Quick Start

### Run Batch Processing

```bash
npm run process:all
```

This will:
- Show you how many PDFs need processing
- Ask for confirmation
- Process all remaining PDFs
- Track progress with detailed logs
- Skip already-processed PDFs automatically

---

## 📊 Progress Tracking

### Log Files Location

All logs are stored in `/Users/kjyoo/DeckBot/logs/`:

```
logs/
├── processing-progress.txt    # Current processing status
├── processing-success.log     # List of successfully processed PDFs
├── processing-errors.log      # Error details with timestamps
└── <filename>.log             # Individual PDF processing logs
```

### Check Progress

```bash
# View current progress
cat logs/processing-progress.txt

# Count successful
wc -l logs/processing-success.log

# View recent errors
tail -20 logs/processing-errors.log

# View specific PDF log
cat "logs/filename.log"
```

---

## 🔄 Resume Processing

The script automatically resumes from where it left off:

1. Checks `processing-success.log` for completed PDFs
2. Skips those files
3. Continues with remaining PDFs

**No configuration needed** - just run `npm run process:all` again.

---

## ⚙️ Features

### ✅ Automatic Resume
- Tracks which PDFs are completed
- Skips already-processed files
- Continue from interruption point

### 🛡️ Error Handling
- Logs all errors with timestamps
- Continues processing after failures
- Asks for confirmation after 3+ failures
- Per-file error logs for debugging

### 📈 Progress Display

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[INFO] [15/400] example_deck.pdf
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[INFO] Processing: example_deck.pdf
[SUCCESS] Completed: example_deck.pdf
```

### 📊 Final Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[INFO] 📊 PROCESSING COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[INFO] Total PDFs: 400
[SUCCESS] Successfully processed: 395
[ERROR] Failed: 3
[WARNING] Skipped (already done): 2
```

---

## 🔧 Manual Control

### Process Single PDF

```bash
npm run process:single "filename.pdf"
```

### Process + Ingest Single PDF

```bash
npm run process-ingest "filename.pdf"
```

### Ingest All Processed JSONs

After batch processing completes:

```bash
npm run ingest
```

This will ingest ALL JSON files in `/output` to Pinecone.

---

## 📁 File Structure

```
DeckBot/
├── pdf/                           # Input PDFs (400 files)
├── output/                        # Generated JSON files with blob URLs
├── images/                        # Temporary local images (optional)
├── logs/                          # Processing logs and tracking
│   ├── processing-progress.txt   # Current status
│   ├── processing-success.log    # Completed PDFs
│   ├── processing-errors.log     # Error log
│   └── *.log                      # Individual PDF logs
└── scripts/
    ├── process-all-pdfs.sh        # Batch processing script
    └── BATCH_PROCESSING.md        # This file
```

---

## 🚨 Troubleshooting

### Script Won't Run

```bash
# Make sure it's executable
chmod +x scripts/process-all-pdfs.sh

# Run directly
./scripts/process-all-pdfs.sh
```

### Check Specific Error

```bash
# View error log
cat logs/processing-errors.log

# View specific PDF log
cat "logs/example_deck.log"
```

### Reset Progress

To start completely fresh:

```bash
# Backup current logs
mv logs logs.backup

# Start clean
npm run process:all
```

### Skip Problematic PDF

Add the filename to `logs/processing-success.log`:

```bash
echo "problematic_file.pdf" >> logs/processing-success.log
```

---

## ⏱️ Performance Estimates

Based on current processing speeds:

- **Per PDF**: ~30-90 seconds (depends on slide count)
- **400 PDFs**: ~3-10 hours total
- **Rate Limiting**: 2-second delay between files
- **Parallel Processing**: Not enabled (to avoid API rate limits)

### Optimization Tips

1. **Run overnight** for large batches
2. **Monitor logs** to catch early failures
3. **Check API quotas** before starting
4. **Stable internet** recommended

---

## 🎯 Complete Workflow

### Full Pipeline (Recommended)

```bash
# Step 1: Process all PDFs (generates JSONs with blob URLs)
npm run process:all

# Step 2: Ingest all JSONs into Pinecone
npm run ingest

# Step 3: Verify ingestion
npm run stats
```

### Check Results

```bash
# View index statistics
npm run stats

# Query decks
npm run query -- "헬스케어 마케팅 전략"

# Search slides
npm run search -- "브랜드 신뢰도"

# Cascading search
npm run cascade -- "디지털 마케팅"
```

---

## 📝 Environment Requirements

Make sure your `.env` has:

```bash
GEMINI_API_KEY=your_gemini_key
PINECONE_API_KEY=your_pinecone_key
OPENAI_API_KEY=your_openai_key
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token  # No quotes!
```

**Important**: Remove quotes from `BLOB_READ_WRITE_TOKEN`

---

## 🔍 Monitoring

### Watch Progress in Real-Time

```bash
# Terminal 1: Run processing
npm run process:all

# Terminal 2: Monitor progress
watch -n 5 'cat logs/processing-progress.txt && echo "" && tail -5 logs/processing-success.log'

# Terminal 3: Watch for errors
tail -f logs/processing-errors.log
```

---

## ✨ Best Practices

1. **Start Small**: Test with 5-10 PDFs first
2. **Monitor Early**: Watch first 10 files for issues
3. **Check Blob Storage**: Verify uploads are working
4. **Backup Logs**: Keep error logs for debugging
5. **Verify Results**: Spot-check JSON outputs
6. **Run Overnight**: Large batches take hours

---

## 📞 Support

If you encounter issues:

1. Check `logs/processing-errors.log`
2. Review individual PDF logs in `logs/`
3. Verify `.env` configuration
4. Check API quota limits
5. Test single file: `npm run process:single "test.pdf"`

---

**Happy Processing! 🚀**
