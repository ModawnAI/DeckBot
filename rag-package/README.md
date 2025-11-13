# DeckBot RAG Query System

Gemini-powered RAG (Retrieval-Augmented Generation) system for querying presentation decks stored in Pinecone.

## Features

- 🤖 **Gemini AI Query Enhancement**: Automatically improves user questions for better semantic search
- 🔍 **Intelligent Keyword Matching**: Boosts results with exact keyword matches from your metadata
- 📊 **Multi-Model Architecture**:
  - Gemini 2.5 Flash for query improvement
  - OpenAI text-embedding-3-large for embeddings
  - Gemini 2.5 Pro for answer generation
- 🎯 **Smart Re-ranking**: Combines semantic search with keyword-based scoring
- 💾 **Result Persistence**: Saves detailed query results to timestamped files

## Prerequisites

- Node.js 18+ (with ES Modules support)
- API Keys for:
  - Google Gemini AI
  - Pinecone Vector Database
  - OpenAI Embeddings

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from example:
```bash
cp .env.example .env
```

3. Add your API keys to `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PINECONE_API_KEY=your_pinecone_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## Required Metadata File

The system requires a metadata file at `/Users/kjyoo/DeckBot/output/deckbot-metadata.json` with the following structure:

```json
{
  "companies": ["Company A", "Company B"],
  "industries": ["Industry 1", "Industry 2"],
  "keywords": ["keyword1", "keyword2"],
  "total_companies": 100,
  "total_industries": 20,
  "total_unique_keywords": 500
}
```

**Note**: Update the `METADATA_PATH` constant in `src/rag-query.ts` if your metadata is located elsewhere.

## Usage

Run a query:
```bash
npm run rag "your question here"
```

### Examples

Korean queries:
```bash
npm run rag "헬스케어 마케팅 전략"
npm run rag "유튜브 인스타 운영 전략"
npm run rag "게임 업계 브랜드 캠페인"
```

English queries:
```bash
npm run rag "healthcare marketing strategy"
npm run rag "social media campaign examples"
npm run rag "brand strategy in gaming industry"
```

## How It Works

1. **Query Enhancement**: Gemini analyzes your question and:
   - Improves it for better semantic search
   - Extracts search keywords
   - Matches exact keywords from your metadata
   - Identifies target industry/company (if mentioned)

2. **Semantic Search**:
   - Generates embedding using OpenAI's text-embedding-3-large (3072 dimensions)
   - Queries Pinecone's `enriched-slides` namespace
   - Retrieves top 10 initial results

3. **Intelligent Re-ranking**:
   - Boosts results by 15% per matched keyword
   - Sorts by combined semantic + keyword score
   - Returns top 4 most relevant results

4. **Answer Generation**:
   - Gemini 2.5 Pro synthesizes results into a natural language answer
   - Cites specific decks and slides
   - Provides detailed result breakdown

5. **Output**:
   - Console output with detailed analysis
   - Timestamped file saved to `output/` directory

## Configuration

Edit `src/rag-query.ts` to customize:

```typescript
const INDEX_NAME = 'deckbot-presentations';  // Your Pinecone index
const TOP_K = 10;                             // Initial results to fetch
const FINAL_RESULTS = 4;                      // Final results to return
const METADATA_PATH = '/path/to/metadata.json'; // Metadata file location
```

### Keyword Boost Strength
Adjust the keyword boost multiplier (line 316):
```typescript
const keywordBoost = matchedCount * 0.15;  // 15% per keyword match
```

## Pinecone Schema

Expected namespace: `enriched-slides`

Required metadata fields:
- `type`: "slide" or "deck"
- `company_name`: Company name
- `industry`: Industry category
- `filename`: Source PDF filename
- `slide_number`: Slide number (for slides)
- `slide_summary`: AI-generated summary
- `keywords`: Array of relevant keywords
- `pdf_url`: (optional) Link to PDF
- `image_url`: (optional) Link to slide image

## Output Format

Results are saved to: `output/rag_<sanitized_question>_<timestamp>.txt`

Example output structure:
```
================================================================================
🔍 DeckBot RAG Query
================================================================================

📝 Question: "유튜브 인스타를 제안한 사례"

🤖 Gemini Query Improvement:
   Original: "유튜브 인스타를 제안한 사례"
   Improved: "유튜브와 인스타그램을 활용한 마케팅 전략 제안 사례"
   Matched Keywords: 통합 채널 전략, SNS 마케팅, 멀티 플랫폼...

🔎 Searching Pinecone (enriched-slides namespace)...
   Found: 10 results, top score: 58.5%

📊 Re-scoring results by keyword relevance...

✅ Found 4 results (boosted by keyword matching)
   1. Company A (70.7% | 1 kw matches (orig: 55.7%))
      Matched: 통합 채널 전략
   ...

💬 Generating answer...

================================================================================
📊 ANSWER:
================================================================================
[AI-generated natural language answer with citations]
================================================================================

📄 Detailed Results:
[Full breakdown of each result with metadata]
```

## Dependencies

- `@google/genai`: Gemini AI integration
- `@pinecone-database/pinecone`: Vector database
- `openai`: Embeddings generation
- `dotenv`: Environment variable management
- `typescript`: Type safety
- `tsx`: TypeScript execution

## Troubleshooting

**"GEMINI_API_KEY is not defined"**
- Ensure `.env` file exists and contains valid API keys

**"Cannot find metadata file"**
- Update `METADATA_PATH` in `src/rag-query.ts`
- Ensure metadata JSON exists at the specified path

**Low relevance scores**
- Check if your Pinecone index has data in the `enriched-slides` namespace
- Verify metadata keywords match your query domain
- Adjust `keywordBoost` multiplier for stronger keyword influence

**No results found**
- Verify Pinecone index name matches your configuration
- Check namespace exists: should be `enriched-slides`
- Ensure vectors have required metadata fields

## License

MIT
