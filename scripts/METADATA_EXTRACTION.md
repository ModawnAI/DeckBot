# Metadata Extraction Guide

Extract all unique industries, companies, and keywords from your `deckbot-presentations` Pinecone index.

## 🚀 Quick Start

```bash
npm run extract-metadata
```

This will create `output/deckbot-metadata.json` with all unique values.

## 📊 Output Format

The generated JSON file contains:

```json
{
  "indexName": "deckbot-presentations",
  "extractedAt": "2025-01-07T12:34:56.789Z",
  "totalDecks": 10,
  "totalSlides": 1305,

  // Simple arrays (alphabetically sorted)
  "industries": [
    "E-commerce",
    "Entertainment",
    "Healthcare",
    "Technology"
  ],

  "companies": [
    "Coupang",
    "LG",
    "Samsung",
    "SK Telecom"
  ],

  "keywords": [
    "AI",
    "Marketing",
    "디지털",
    "전략"
  ],

  // Year range
  "yearRange": {
    "min": 2023,
    "max": 2025
  },

  // With occurrence counts (sorted by frequency)
  "industriesWithCounts": {
    "Technology": 5,
    "Healthcare": 3,
    "E-commerce": 2
  },

  "companiesWithCounts": {
    "Samsung": 4,
    "LG": 3,
    "Coupang": 2
  },

  "keywordsWithCounts": {
    "AI": 150,
    "전략": 120,
    "Marketing": 95,
    "디지털": 87
  }
}
```

## 💡 Use Cases

### 1. Chatbot Filter Options
```typescript
import metadata from './output/deckbot-metadata.json';

// Show available industries to user
const industries = metadata.industries;
// ["E-commerce", "Entertainment", "Healthcare", "Technology"]

// Show available companies
const companies = metadata.companies;
// ["Coupang", "LG", "Samsung", "SK Telecom"]
```

### 2. Autocomplete/Suggestions
```typescript
// Show top 20 keywords for autocomplete
const topKeywords = Object.keys(metadata.keywordsWithCounts).slice(0, 20);
```

### 3. Filter Validation
```typescript
function isValidIndustry(industry: string): boolean {
  return metadata.industries.includes(industry);
}

function isValidCompany(company: string): boolean {
  return metadata.companies.includes(company);
}
```

### 4. Analytics Dashboard
```typescript
// Show most common industries
Object.entries(metadata.industriesWithCounts)
  .slice(0, 5)
  .forEach(([industry, count]) => {
    console.log(`${industry}: ${count} decks`);
  });

// Show most used keywords
Object.entries(metadata.keywordsWithCounts)
  .slice(0, 10)
  .forEach(([keyword, count]) => {
    console.log(`${keyword}: ${count} occurrences`);
  });
```

### 5. UI Dropdowns
```typescript
// Create dropdown options
const industryOptions = metadata.industries.map(industry => ({
  label: `${industry} (${metadata.industriesWithCounts[industry]} decks)`,
  value: industry
}));

const companyOptions = metadata.companies.map(company => ({
  label: `${company} (${metadata.companiesWithCounts[company]} decks)`,
  value: company
}));
```

## 🔄 When to Re-extract

Run the extraction again when:
- New decks are ingested
- Metadata is updated
- You need fresh statistics

## 📝 Example Console Output

```
🚀 Starting metadata extraction...

📈 Index: deckbot-presentations
   Total vectors: 2620
   Namespaces: ['deck-summaries', 'slide-summaries', 'hybrid-chunks']

📊 Extracting from namespace: deck-summaries
  Processed 100 vectors...
  ✅ Extracted 10 vectors from deck-summaries

📊 Extracting from namespace: hybrid-chunks
  Processed 100 vectors...
  Processed 200 vectors...
  ...
  ✅ Extracted 1305 vectors from hybrid-chunks

✅ Extraction complete!
   Industries: 8
   Companies: 12
   Keywords: 456
   Year range: 2023 - 2025

📋 METADATA SUMMARY:

🏢 Industries (8):
   - E-commerce (2 decks)
   - Entertainment (1 decks)
   - Healthcare (3 decks)
   - Technology (5 decks)
   ... and 4 more

🏪 Companies (12):
   - Coupang (2 decks)
   - LG (3 decks)
   - Samsung (4 decks)
   ... and 9 more

🏷️  Top 20 Keywords:
   - AI (150 occurrences)
   - 전략 (120 occurrences)
   - Marketing (95 occurrences)
   - 디지털 (87 occurrences)
   - Innovation (72 occurrences)
   ...

📅 Year Range: 2023 - 2025

📊 Total Decks: 10
📊 Total Slides: 1305

💾 Saved to: /Users/kjyoo/DeckBot/output/deckbot-metadata.json

✅ Done!
```

## 🎯 Integration with Query Library

```typescript
import { searchSlides } from './src/pinecone-query';
import metadata from './output/deckbot-metadata.json';

async function smartSearch(userQuery: string, userFilters: any) {
  // Validate filters against extracted metadata
  const validatedFilters: any = {};

  if (userFilters.industry && metadata.industries.includes(userFilters.industry)) {
    validatedFilters.industry = userFilters.industry;
  }

  if (userFilters.company && metadata.companies.includes(userFilters.company)) {
    validatedFilters.company = userFilters.company;
  }

  if (userFilters.keywords) {
    const validKeywords = userFilters.keywords.filter((kw: string) =>
      metadata.keywords.includes(kw)
    );
    if (validKeywords.length > 0) {
      validatedFilters.keywords = validKeywords;
    }
  }

  return await searchSlides(userQuery, validatedFilters);
}
```

## 🔧 Troubleshooting

### Error: PINECONE_API_KEY not found
Make sure your `.env` file has:
```
PINECONE_API_KEY=your_api_key_here
```

### Extraction takes too long
The script processes all vectors in the index. For large indexes (>10,000 vectors), this may take a few minutes.

### Empty arrays returned
Check that:
1. Your index has data (`npm run stats`)
2. Metadata fields are populated during ingestion
3. Index name is correct (default: `deckbot-presentations`)
