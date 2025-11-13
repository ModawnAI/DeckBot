# DeckBot Query Library Guide

Simple interface for querying the `deckbot-presentations` Pinecone index in your chatbot.

## 📚 Quick Start

```typescript
import { searchSlides, searchDecks, searchCascade } from './src/pinecone-query';

// Simple slide search
const slides = await searchSlides('마케팅 전략');

// Filtered search
const filtered = await searchSlides('AI 전략', {
  industry: 'Technology',
  yearFrom: 2024,
  keywords: ['AI', '인공지능']
});

// Deck discovery
const decks = await searchDecks('삼성 전략', { company: 'Samsung' });

// High-precision cascade search
const best = await searchCascade('디지털 전환 전략');
```

---

## 🎯 Query Modes

### 1. **Slide Search** (Default - Most Common)
Use when users want specific slide content.

```typescript
const results = await searchSlides(query, filters, topK);
```

**Best for:**
- "Show me slides about X"
- "Find examples of Y"
- Detailed content search

**Namespace:** `hybrid-chunks` (includes deck context)

---

### 2. **Deck Search**
Use when users want to discover presentations.

```typescript
const results = await searchDecks(query, filters, topK);
```

**Best for:**
- "Find presentations about X"
- "Show me decks from company Y"
- High-level discovery

**Namespace:** `deck-summaries`

---

### 3. **Cascade Search** (High Precision)
Use when you need the most relevant matches.

```typescript
const results = await searchCascade(query, filters, topK);
```

**Best for:**
- Critical queries requiring precision
- "Show me the best matches for X"

**Process:** Finds top decks → Returns best slides from those decks

---

## 🔍 Available Filters

All filters are optional. Use them to improve query precision.

```typescript
interface QueryFilters {
  industry?: string;        // "Technology", "Healthcare", "Finance"
  company?: string;         // "Samsung", "LG", "Coupang"
  keywords?: string[];      // ["AI", "Marketing", "전략"]
  yearFrom?: number;        // 2023, 2024, etc.
  yearTo?: number;          // 2024, 2025, etc.
  deckIds?: string[];       // Specific deck IDs (for cascade)
}
```

### Filter Examples

```typescript
// Industry filter
await searchSlides('AI strategy', { industry: 'Technology' });

// Company filter
await searchSlides('marketing', { company: 'LG' });

// Keywords filter (indexed - fast!)
await searchSlides('innovation', { keywords: ['AI', '혁신'] });

// Year range
await searchSlides('digital', { yearFrom: 2023, yearTo: 2024 });

// Combined filters
await searchSlides('strategy', {
  industry: 'Healthcare',
  keywords: ['AI', 'ML'],
  yearFrom: 2024
});
```

---

## 📊 Result Types

### Slide Result
```typescript
{
  id: string;              // Unique slide ID
  score: number;           // Similarity score (0-1)
  company: string;         // Company name
  industry: string;        // Industry
  slideNumber: number;     // Slide number in deck
  preview: string;         // Short preview text
  imageUrl: string;        // Slide image URL
  pdfUrl: string;          // PDF URL
  deckId: string;          // Parent deck ID
  keywords: string[];      // Slide keywords
  createdDate: string;     // ISO date string
}
```

### Deck Result
```typescript
{
  id: string;              // Unique deck ID
  score: number;           // Similarity score (0-1)
  company: string;         // Company name
  industry: string;        // Industry
  preview: string;         // Executive summary preview
  totalSlides: number;     // Total slides in deck
  pdfUrl: string;          // PDF URL
  createdDate: string;     // ISO date string
  keywords: string[];      // Deck keywords (top 50)
}
```

---

## 💡 Chatbot Integration Examples

### Example 1: Basic Chatbot

```typescript
import { DeckBotQuery } from './src/pinecone-query';

async function handleUserQuery(userMessage: string) {
  const db = new DeckBotQuery();

  // Default: search slides
  const results = await db.querySlides({
    query: userMessage,
    topK: 5
  });

  if (results.length === 0) {
    return "죄송합니다. 검색 결과가 없습니다.";
  }

  return results.map((slide, i) =>
    `${i + 1}. ${slide.company} - Slide ${slide.slideNumber}\n` +
    `   ${slide.preview}\n` +
    `   🖼️ ${slide.imageUrl}`
  ).join('\n\n');
}
```

### Example 2: Intent-Based Routing

```typescript
async function handleIntent(query: string, intent: string) {
  const db = new DeckBotQuery();

  switch (intent) {
    case 'find_presentations':
      return db.queryDecks({ query, topK: 5 });

    case 'find_slides':
      return db.querySlides({ query, topK: 10 });

    case 'specific_search':
      return db.queryCascade({ query, topK: 10 });

    default:
      return db.querySlides({ query, topK: 5 });
  }
}
```

### Example 3: Filter Extraction

```typescript
async function smartSearch(userMessage: string) {
  const db = new DeckBotQuery();

  // Extract filters from user message
  const filters: any = {};

  if (userMessage.includes('2024')) {
    filters.yearFrom = 2024;
  }

  if (userMessage.match(/삼성|Samsung/i)) {
    filters.company = 'Samsung';
  }

  if (userMessage.match(/AI|인공지능/i)) {
    filters.keywords = ['AI', '인공지능'];
  }

  return db.querySlides({
    query: userMessage,
    filters,
    topK: 10
  });
}
```

---

## 🚀 Performance Tips

### 1. **Use Indexed Fields for Filtering**
These fields are indexed and filter faster:
- ✅ `type`, `industry`, `company_name`, `deck_id`, `created_year`, `keywords`
- ❌ `filename`, `created_month`, `slide_number` (not indexed)

### 2. **Choose the Right Mode**
- **Slides** → General queries (fastest)
- **Decks** → Discovery queries
- **Cascade** → High-precision (slowest but best results)

### 3. **Use Keywords Filter**
Keywords are indexed and provide fast filtering:
```typescript
// Fast
await searchSlides('strategy', { keywords: ['AI', 'ML'] });

// Slower (semantic search only)
await searchSlides('AI ML strategy');
```

### 4. **Combine Filters**
Multiple filters narrow results for better precision:
```typescript
await searchSlides('innovation', {
  industry: 'Technology',
  keywords: ['AI'],
  yearFrom: 2024
});
```

---

## 📝 Common Patterns

### Pattern 1: Show Related Slides
```typescript
// User clicks on a slide, show related slides from same deck
const relatedSlides = await searchSlides('related content', {
  deckIds: [currentSlide.deckId]
});
```

### Pattern 2: Industry Overview
```typescript
// Show all slides from an industry
const industrySlides = await searchSlides('overview', {
  industry: 'Healthcare',
  topK: 20
});
```

### Pattern 3: Company Portfolio
```typescript
// Show all presentations from a company
const companyDecks = await searchDecks('all presentations', {
  company: 'Samsung'
});
```

### Pattern 4: Recent Content
```typescript
// Show recent slides (last year)
const recentSlides = await searchSlides('recent content', {
  yearFrom: new Date().getFullYear()
});
```

---

## 🔧 Advanced Usage

### Custom Instance

```typescript
import { DeckBotQuery } from './src/pinecone-query';

const db = new DeckBotQuery(
  'your-pinecone-api-key',  // Optional
  'your-openai-api-key'      // Optional
);

// Use custom instance
const results = await db.query({
  query: 'test',
  mode: 'slides',
  topK: 10,
  filters: { industry: 'Tech' }
});
```

### Error Handling

```typescript
try {
  const results = await searchSlides('query');

  if (results.length === 0) {
    console.log('No results found');
  }
} catch (error) {
  console.error('Query failed:', error);
  // Handle API errors, rate limits, etc.
}
```

---

## 📦 Environment Variables

Required environment variables:

```bash
PINECONE_API_KEY=your_pinecone_api_key
OPENAI_API_KEY=your_openai_api_key
```

---

## 🎨 Example Chatbot Flow

```typescript
// 1. User sends message
const userQuery = "LG 마케팅 전략 슬라이드 보여줘";

// 2. Extract filters (optional)
const filters = {
  company: 'LG',
  keywords: ['마케팅', '전략']
};

// 3. Query Pinecone
const results = await searchSlides(userQuery, filters, 5);

// 4. Format response
const response = results.map((slide, i) => ({
  text: `${slide.company} - Slide ${slide.slideNumber}`,
  preview: slide.preview,
  image: slide.imageUrl,
  score: slide.score
}));

// 5. Send to user
return response;
```

---

## 📌 Key Takeaways

1. ✅ **Use `searchSlides()` for most chatbot queries**
2. ✅ **Add filters to improve precision** (especially `keywords`, `industry`, `company`)
3. ✅ **Use indexed fields** for faster filtering
4. ✅ **Keywords filter is indexed** - use it for fast filtering!
5. ✅ **Cascade search** when precision is critical
6. ✅ **Handle empty results gracefully**

---

## 📚 See Full Examples

Check `examples/chatbot-usage.ts` for complete working examples.
