# 🤖 DeckBot - PDF Pitch Deck Metadata Extractor

A sophisticated RAG-optimized metadata extraction system for pitch deck PDFs. Processes pitch decks to generate structured metadata at both **deck-level** (global context) and **slide-level** (detailed content) for high-performance retrieval systems.

## 🎯 Features

- **Multi-Level Chunking**: Extracts both deck-level and slide-level metadata
- **Industry Classification**: 30+ industry categories with ENUM enforcement
- **Slide Layout Detection**: Automatic classification of slide types (Title, Problem, Solution, etc.)
- **Gemini 2.0 Flash**: Powered by Google's latest AI model for accurate extraction
- **Batch Processing**: Process entire folders of PDFs automatically
- **Validation & Statistics**: Built-in validation and detailed analytics
- **RAG-Optimized**: Structured for vector database storage and semantic search

## 📊 Data Structure

### Deck-Level Metadata (Global Context)
```typescript
{
  deck_industry: DeckIndustry,      // ENUM: Fintech, SaaS, etc.
  company_name: string,              // Extracted company name
  executive_summary: string,         // 2-3 sentence deck summary
  total_pages: number               // Total slide count
}
```

### Slide-Level Metadata (Detailed Content)
```typescript
{
  filename: string,                  // Source PDF filename
  slide_number: number,              // Page index
  slide_content: string,             // Full text extraction
  slide_summary: string,             // 1-2 sentence summary
  keywords: string[],                // 3-5 core keywords
  slide_layout: SlideLayout         // ENUM: Title, Problem, etc.
}
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))
- `poppler-utils` for PDF processing:
  ```bash
  # macOS
  brew install poppler

  # Ubuntu/Debian
  sudo apt-get install poppler-utils

  # Windows
  # Download from: https://github.com/oschwartz10612/poppler-windows/releases
  ```

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

3. **Add PDFs to process:**
   ```bash
   # Place your pitch deck PDFs in the pdf/ directory
   ```

### Usage

**Process all PDFs:**
```bash
npm run dev
```

**Build and run:**
```bash
npm run build
npm start
```

## 📁 Project Structure

```
DeckBot/
├── src/
│   ├── types.ts              # TypeScript type definitions & ENUMs
│   ├── pdf-processor.ts      # PDF text extraction & image conversion
│   ├── gemini-client.ts      # Gemini API integration
│   ├── metadata-extractor.ts # Main extraction orchestration
│   └── index.ts              # CLI entry point
├── pdf/                      # Input PDFs (place files here)
├── output/                   # Generated JSON metadata files
├── images/                   # Converted slide images (temporary)
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Configuration

Edit `src/index.ts` to customize:

```typescript
const config: ProcessingConfig = {
  pdfDirectory: path.join(projectRoot, 'pdf'),
  outputDirectory: path.join(projectRoot, 'output'),
  imageDirectory: path.join(projectRoot, 'images'),
  geminiApiKey: apiKey,
  maxConcurrentRequests: 3  // Adjust for rate limiting
};
```

## 📋 Industry ENUMs

The system supports 30+ industry classifications:

- Fintech, E-commerce, SaaS
- HealthTech, EdTech, PropTech
- Marketplace, Enterprise Software
- Consumer App, Biotech, CleanTech
- AI/ML, Cybersecurity, Web3/Crypto
- Social Media, Gaming, Hardware
- Marketing/AdTech, HR/Recruiting
- ... and more (see `src/types.ts`)

## 📋 Slide Layout Types

Automatic detection of common pitch deck slide types:

- Title, Problem, Solution
- Product, Traction, Market
- Business Model, Competition
- Team, Financials, Roadmap
- Ask, Contact, Appendix

## 📊 Output Format

Each PDF generates a JSON file with complete metadata:

```json
{
  "deck_metadata": {
    "deck_industry": "Fintech",
    "company_name": "Example Corp",
    "executive_summary": "A neobank focused on...",
    "total_pages": 25
  },
  "slides": [
    {
      "filename": "pitch_deck.pdf",
      "slide_number": 1,
      "slide_content": "Complete extracted text...",
      "slide_summary": "Title slide introducing...",
      "keywords": ["fintech", "banking", "mobile"],
      "slide_layout": "Title"
    }
    // ... more slides
  ]
}
```

## 🎯 RAG Integration Strategy

### Storage Pattern
1. **Vector DB**: Store each slide as a separate document
2. **Metadata**: Attach both slide-level AND deck-level metadata
3. **Embeddings**: Generate from `slide_summary` + `slide_content`

### Retrieval Pattern
1. **Semantic Search**: Query against slide embeddings
2. **Metadata Filtering**: Filter by `deck_industry`, `slide_layout`
3. **Context Assembly**: Include deck-level context with retrieved slides

### Example Query Flow
```typescript
// 1. Semantic search
const results = await vectorDB.search(query, {
  filter: { deck_industry: 'Fintech' },
  limit: 5
});

// 2. Assemble context
const context = results.map(slide => ({
  global: slide.metadata.deck_metadata,
  local: slide.metadata.slide_content
}));
```

## ⚙️ Processing Pipeline

1. **PDF Text Extraction**: Extract complete text using `pdf-parse`
2. **Deck Summarization**: Generate global context with Gemini
3. **Image Conversion**: Convert each page to PNG images
4. **Slide Analysis**: Process each image with Gemini vision
5. **Metadata Generation**: Extract structured data for each slide
6. **Validation**: Verify completeness and consistency
7. **JSON Export**: Save structured output files

## 🚦 Rate Limiting

The system includes built-in delays between API calls:
- 1 second delay between slide processing
- Configurable `maxConcurrentRequests`
- Adjust in `src/metadata-extractor.ts` as needed

## 🐛 Troubleshooting

### "poppler not found"
Install poppler-utils (see Prerequisites)

### "GEMINI_API_KEY not found"
Ensure `.env` file exists with valid API key

### Rate limiting errors
Increase delay in `metadata-extractor.ts`:
```typescript
await this.geminiClient.delay(2000); // 2 seconds
```

### Image conversion fails
Check PDF permissions and poppler installation

## 📈 Performance

- **Processing Speed**: ~5-10 seconds per slide (depends on API)
- **Batch Processing**: Supports unlimited PDFs sequentially
- **Memory Usage**: ~100-500MB per PDF
- **API Costs**: ~$0.01-0.05 per deck (Gemini 2.0 Flash pricing)

## 🔐 Security

- API keys stored in `.env` (never commit!)
- All processing happens locally
- Images stored temporarily (auto-cleanup optional)
- No external data transmission except to Gemini API

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 🙏 Acknowledgments

Built with:
- [Google Generative AI](https://ai.google.dev/) - Gemini 2.0 Flash
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) - PDF text extraction
- [pdf-poppler](https://www.npmjs.com/package/pdf-poppler) - PDF to image conversion
- [sharp](https://www.npmjs.com/package/sharp) - Image processing

---

**Made with ❤️ for RAG systems and pitch deck analysis**
