# 🚀 DeckBot Pinecone Ingestion Strategy

## 📊 Architecture Overview

### **Multi-Namespace Hybrid Approach**

```
deckbot-presentations/
├── deck-summaries     → 400 deck-level vectors (high-level discovery)
├── slide-summaries    → ~80,000 slide vectors (granular retrieval)
└── hybrid-chunks      → ~80,000 contextual vectors (deck+slide context)
```

**Total Vectors**: ~160,400 (optimized for different query patterns)

---

## 🎯 Design Rationale

### **Why Multi-Namespace?**

1. **Performance**: Separate namespaces allow targeted queries without scanning all 160K vectors
2. **Query Flexibility**: Different query types use different namespaces
3. **Cost Efficiency**: Filter by namespace first, then by metadata

### **Why Hybrid Chunks?**

Korean text embeddings benefit from **rich contextual information**:
- Including deck metadata (company, industry) improves relevance
- Slide content alone lacks business context
- Hybrid approach: `[DECK: company - industry] + [SLIDE: content]`

### **Metadata Strategy**

Indexed fields for fast filtering:
- `type`: 'deck' | 'slide'
- `industry`: "헬스케어", "금융", "IT", etc.
- `company_name`: Company-specific queries
- `deck_id`: Deck-to-slide relationships
- `created_year`: Temporal filtering
- `keywords`: Array-based keyword matching

---

## 🔍 Query Patterns

### **Pattern 1: Industry Discovery**
```typescript
// Find healthcare marketing decks
await queryer.findDecksByIndustry("헬스케어 마케팅 전략", "헬스케어");
```
**Namespace**: `deck-summaries` (fast, only 400 vectors)
**Use Case**: Exploratory search, deck browsing

---

### **Pattern 2: Specific Content Search**
```typescript
// Find slides about brand trust across all decks
await queryer.findSlides("브랜드 신뢰도 제고 전략", {
  yearFrom: 2024
});
```
**Namespace**: `hybrid-chunks` (contextual, ~80K vectors)
**Use Case**: Finding specific content/strategies

---

### **Pattern 3: Company-Specific**
```typescript
// Find all "the littles" campaign slides
await queryer.findSlides("온라인 광고 캠페인", {
  company: "the littles",
  keywords: ["온라인 광고", "캠페인"]
});
```
**Namespace**: `hybrid-chunks`
**Filter**: `company_name + keywords`
**Use Case**: Company portfolio analysis

---

### **Pattern 4: Cascading Search**
```typescript
// 1. Find top 3 relevant decks
// 2. Get best slides from those decks
await queryer.cascadingSearch("디지털 마케팅 전략", "헬스케어");
```
**Namespaces**: `deck-summaries` → `hybrid-chunks`
**Use Case**: Deep dive into specific domains

---

## 🛠️ Installation & Setup

### **1. Install Dependencies**

```bash
npm install @pinecone-database/pinecone openai
npm install -D @types/node tsx
```

### **2. Environment Variables**

Create `.env`:
```bash
PINECONE_API_KEY=your_pinecone_api_key
OPENAI_API_KEY=your_openai_api_key
```

### **3. Add Scripts to package.json**

```json
{
  "scripts": {
    "ingest": "tsx scripts/pinecone-ingestion.ts ingest",
    "ingest:dir": "tsx scripts/pinecone-ingestion.ts ingest output",
    "stats": "tsx scripts/pinecone-ingestion.ts stats",
    "query": "tsx scripts/pinecone-ingestion.ts query",
    "search": "tsx scripts/pinecone-ingestion.ts search",
    "cascade": "tsx scripts/pinecone-ingestion.ts cascade"
  }
}
```

---

## 📥 Usage

### **Ingest All JSON Files**

```bash
# Ingest from ./output directory (default)
npm run ingest

# Ingest from custom directory
npm run ingest:dir -- /path/to/json/files
```

**Progress Output**:
```
🚀 Starting batch ingestion from: /Users/kjyoo/DeckBot/output

Found 400 JSON files

[1/400] Processing file...
📄 Processing: ilgram_2025_metadata.json
  Deck: the littles (헬스케어)
  Slides: 210
  Keywords: 45
  Generating deck embedding...
  Generating 210 slide embeddings...
  Generating 210 hybrid embeddings...
  ✅ Generated 421 total vectors

...

📊 SUMMARY:
  Deck vectors: 400
  Slide vectors: 80,000
  Hybrid vectors: 80,000
  Total vectors: 160,400

📤 Upserting to Pinecone...
  ✅ Upserted 400 vectors to 'deck-summaries'
  ✅ Upserted 80,000 vectors to 'slide-summaries'
  ✅ Upserted 80,000 vectors to 'hybrid-chunks'

✅ Ingestion complete!
```

---

### **View Index Statistics**

```bash
npm run stats
```

**Output**:
```
📈 INDEX STATISTICS:
  Total vectors: 160,400
  Dimension: 1536
  Index fullness: 12%

  Namespaces:
    deck-summaries: 400 vectors
    slide-summaries: 80,000 vectors
    hybrid-chunks: 80,000 vectors
```

---

### **Query Examples**

#### **Find Decks by Industry**

```bash
npm run query -- "헬스케어 마케팅 전략"
```

**Output**:
```
🔍 Query: "헬스케어 마케팅 전략"

📋 Results (5 decks):

  1. the littles (score: 0.8542)
     Industry: 헬스케어
     Preview: 이 제안서는 건강기능식품 브랜드 '더리틀스(the littles)'의 2025년 온라인 광고 운영 전략을 다루며...
     PDF: https://xsctqzbwa1mbabgs.public.blob.vercel-storage.com/...

  2. HealthCare Plus (score: 0.8123)
     Industry: 헬스케어
     Preview: ...
```

---

#### **Search for Specific Content**

```bash
npm run search -- "브랜드 신뢰도 제고 전략"
```

**Output**:
```
🔍 Query: "브랜드 신뢰도 제고 전략"

📋 Results (10 slides):

  1. the littles - Slide 4 (score: 0.9012)
     Industry: 헬스케어
     Preview: 브랜드 신뢰도 제고를 통한 구매 고객 유입 증대...
     Image: https://...slide-004.png

  2. HealthBrand - Slide 12 (score: 0.8734)
     Industry: 헬스케어
     Preview: ...
```

---

#### **Cascading Search**

```bash
npm run cascade -- "디지털 마케팅 전략"
```

**Output**:
```
🔍 CASCADING SEARCH: "디지털 마케팅 전략"

  Step 1: Finding relevant decks...
  → Found 3 decks: the littles, BrandX, CompanyY

  Step 2: Finding slides from 3 decks...

📋 Final Results (15 slides from 3 decks):

  1. the littles - Slide 23 (score: 0.9234)
     Preview: 디지털 채널별 상세 전략...

  2. BrandX - Slide 8 (score: 0.9102)
     Preview: ...
```

---

## 🎨 Programmatic Usage

### **In Your Application**

```typescript
import { PineconeQuery } from './scripts/pinecone-ingestion';

const queryer = new PineconeQuery();

// Example 1: Find decks
const decks = await queryer.findDecksByIndustry("헬스케어 전략", "헬스케어");

// Example 2: Search slides
const slides = await queryer.findSlides("온라인 광고", {
  company: "the littles",
  keywords: ["광고", "캠페인"],
  yearFrom: 2024
});

// Example 3: Cascading search
const results = await queryer.cascadingSearch("디지털 마케팅", "IT");
```

---

## 🔧 Advanced Configuration

### **Embedding Model Options**

```typescript
// Current: OpenAI text-embedding-3-large (3072 dims)
// Optimized for multilingual Korean content
const CONFIG = {
  EMBEDDING_MODEL: 'text-embedding-3-large',
  EMBEDDING_DIMENSION: 3072,
};

// Alternative: text-embedding-3-small (1536 dims, lower cost)
// Use for English-only content or cost optimization
```

### **Batch Size Tuning**

```typescript
const CONFIG = {
  BATCH_SIZE: 100,  // Pinecone upsert batch size
  // Increase for faster ingestion (max 1000)
  // Decrease if hitting rate limits
};
```

### **Metadata Indexing (Pod-based Index)**

For heavy metadata filtering, use pod-based index:

```typescript
spec: {
  pod: {
    environment: 'us-east1-gcp',
    podType: 'p1.x1',
    pods: 1,
    metadataConfig: {
      indexed: [
        'type', 'industry', 'company_name',
        'deck_id', 'created_year', 'keywords'
      ]
    }
  }
}
```

---

## 📈 Performance Benchmarks

### **Ingestion Speed**

| Metric | Value |
|--------|-------|
| Files | 400 JSON files |
| Total Slides | ~80,000 |
| Total Vectors | 160,400 |
| Embedding Time | ~2-3 hours (with rate limits) |
| Upsert Time | ~15-20 minutes |
| **Total Time** | **~3 hours** |

### **Query Performance**

| Query Type | Namespace | Vectors Scanned | Avg Latency |
|------------|-----------|-----------------|-------------|
| Deck Discovery | deck-summaries | 400 | ~50ms |
| Slide Search | hybrid-chunks | 80,000 | ~150ms |
| Filtered Search | hybrid-chunks | ~5,000 (filtered) | ~100ms |
| Cascading Search | both | 400 + 80,000 | ~200ms |

---

## 🎯 Best Practices

### **1. Use Appropriate Namespace**

```typescript
// ✅ GOOD: Use deck-summaries for deck discovery
await queryer.findDecksByIndustry("헬스케어 전략", "헬스케어");

// ❌ BAD: Querying hybrid-chunks for deck discovery
// (scans 80K vectors unnecessarily)
```

### **2. Apply Metadata Filters**

```typescript
// ✅ GOOD: Filter before semantic search
filter: {
  industry: { $eq: "헬스케어" },
  created_year: { $gte: 2024 }
}

// ❌ BAD: No filters = scan all vectors
```

### **3. Batch Processing**

```typescript
// ✅ GOOD: Process files in batches, handle errors gracefully
for (const file of files) {
  try {
    await processFile(file);
  } catch (error) {
    console.error(`Failed: ${file}`, error);
    continue; // Continue with next file
  }
}
```

### **4. Rate Limiting**

```typescript
// ✅ GOOD: Built-in retry logic with exponential backoff
await withRetry(operation, 'operation_name', 3);

// ✅ GOOD: Sleep between batches
await sleep(200);
```

---

## 🚨 Troubleshooting

### **Issue: Rate Limit Errors**

```bash
Error: Rate limit exceeded
```

**Solution**: Reduce batch size or add delays
```typescript
const CONFIG = {
  BATCH_SIZE: 50,  // Reduce from 100
};

// Add delay between batches
await sleep(500);  // Increase from 200ms
```

---

### **Issue: Token Limit Exceeded**

```bash
Error: This model's maximum context length is 8191 tokens
```

**Solution**: Truncate long text
```typescript
const maxLength = 8000; // chars (≈2000 tokens)
const truncatedText = text.substring(0, maxLength);
```

---

### **Issue: Duplicate IDs**

```bash
Error: Duplicate ID detected
```

**Solution**: Ensure unique IDs with proper hashing
```typescript
// Already handled with deterministic ID generation
const deck_id = generateId('deck', deck_metadata.filename);
```

---

## 📚 Additional Resources

- [Pinecone TypeScript Client](https://github.com/pinecone-io/pinecone-ts-client)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Pinecone Metadata Filtering](https://docs.pinecone.io/docs/metadata-filtering)
- [Vector Search Best Practices](https://www.pinecone.io/learn/vector-search/)

---

## 📝 Next Steps

1. **Ingest Data**: Run `npm run ingest` to load your JSON files
2. **Verify**: Check `npm run stats` to confirm vectors uploaded
3. **Test Queries**: Try different query patterns
4. **Integrate**: Use `PineconeQuery` class in your application
5. **Optimize**: Monitor performance and adjust configuration

---

## 💡 Pro Tips

### **Hybrid Search for Korean Content**

Korean text embeddings work best with **contextual richness**:
- ✅ Use `hybrid-chunks` namespace (includes deck context)
- ✅ Include company name + industry in embeddings
- ❌ Avoid pure slide content without context

### **Cascading for Deep Dives**

When users need comprehensive results:
1. Find relevant decks (fast, 400 vectors)
2. Get slides from top decks (targeted, ~1000 vectors)
3. Much faster than searching all 80K slides

### **Metadata Filters for Precision**

Combine semantic search + metadata filters:
```typescript
{
  vector: queryEmbedding,
  topK: 20,
  filter: {
    industry: { $eq: "헬스케어" },
    keywords: { $in: ["마케팅", "전략"] },
    created_year: { $gte: 2024 }
  }
}
```

This provides **high precision** with **low latency**.

---

**Questions?** Open an issue or contact the DeckBot team.
