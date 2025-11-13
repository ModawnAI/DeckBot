# Quick Start Guide

Get up and running with DeckBot RAG in 5 minutes.

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your API keys:
```env
GEMINI_API_KEY=your_actual_gemini_key
PINECONE_API_KEY=your_actual_pinecone_key
OPENAI_API_KEY=your_actual_openai_key
```

### Getting API Keys

- **Gemini AI**: https://aistudio.google.com/apikey
- **Pinecone**: https://app.pinecone.io/ (sign up → create API key)
- **OpenAI**: https://platform.openai.com/api-keys

## Step 3: Set Up Metadata File

**Option A: Use your own metadata**

1. Update the `METADATA_PATH` in `src/rag-query.ts` (line 26):
```typescript
const METADATA_PATH = '/path/to/your/metadata.json';
```

2. Ensure your metadata.json follows this structure:
```json
{
  "companies": ["Company1", "Company2"],
  "industries": ["Industry1", "Industry2"],
  "keywords": ["keyword1", "keyword2"],
  "total_companies": 2,
  "total_industries": 2,
  "total_unique_keywords": 2
}
```

**Option B: Use the template (for testing)**

1. Copy the template:
```bash
cp metadata-template.json metadata.json
```

2. Update the path in `src/rag-query.ts`:
```typescript
const METADATA_PATH = './metadata.json';
```

## Step 4: Verify Pinecone Configuration

Check that these settings match your Pinecone setup in `src/rag-query.ts`:

```typescript
const INDEX_NAME = 'deckbot-presentations';  // Your index name
```

The script expects:
- **Namespace**: `enriched-slides`
- **Dimension**: 3072 (OpenAI text-embedding-3-large)

## Step 5: Run Your First Query

```bash
npm run rag "your question here"
```

### Example Queries

Korean:
```bash
npm run rag "헬스케어 마케팅 전략"
npm run rag "유튜브와 인스타그램 운영 전략"
```

English:
```bash
npm run rag "healthcare marketing strategy"
npm run rag "social media campaign examples"
```

## Expected Output

You should see:
1. ✅ Metadata loaded confirmation
2. 🤖 Query improvement by Gemini
3. 🔎 Pinecone search results
4. 📊 Re-scored and ranked results
5. 💬 Natural language answer
6. 📄 Detailed result breakdown

Results are also saved to: `output/rag_<question>_<timestamp>.txt`

## Troubleshooting

### "Cannot read properties of undefined"
- Check that your `.env` file exists and has all three API keys
- Make sure API keys are valid (no quotes needed in .env)

### "ENOENT: no such file or directory" for metadata
- Verify the `METADATA_PATH` points to an existing file
- Use absolute path or ensure relative path is correct

### "Index not found" or no results
- Check your Pinecone index name matches `INDEX_NAME`
- Verify the `enriched-slides` namespace exists in your index
- Ensure your index has vectors with proper metadata

### Low relevance scores
- This is normal if your test data differs from the query domain
- Try queries related to your actual indexed content
- Adjust `keywordBoost` in line 316 for stronger keyword matching

## Next Steps

- Read the full [README.md](README.md) for detailed configuration options
- Customize keyword boost strength (line 316 in `src/rag-query.ts`)
- Adjust `TOP_K` and `FINAL_RESULTS` for different result counts
- Explore the output files in the `output/` directory

## Need Help?

- Check Pinecone console to verify your index structure
- Use Pinecone's built-in query testing to validate your data
- Review the TypeScript types in `src/rag-query.ts` for metadata schema requirements
