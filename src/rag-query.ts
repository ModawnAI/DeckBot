/**
 * Gemini-Powered RAG Query System
 *
 * Uses Gemini to improve user questions, then queries Pinecone for best matches
 */

import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const INDEX_NAME = 'deckbot-presentations';
const TOP_K = 20; // Fetch more, then filter by keywords
const FINAL_RESULTS = 10; // Return top 10 after keyword filtering
const METADATA_PATH = '/Users/kjyoo/DeckBot/output/deckbot-metadata.json';

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ============================================================================
// METADATA LOADING
// ============================================================================

interface DeckbotMetadata {
  companies: string[];
  industries: string[];
  keywords: string[];
  total_companies: number;
  total_industries: number;
  total_unique_keywords: number;
}

let metadata: DeckbotMetadata;

async function loadMetadata(): Promise<void> {
  const data = await fs.readFile(METADATA_PATH, 'utf-8');
  metadata = JSON.parse(data);
  console.log('📊 Loaded metadata:');
  console.log(`   Companies: ${metadata.total_companies}`);
  console.log(`   Industries: ${metadata.total_industries}`);
  console.log(`   Keywords: ${metadata.total_unique_keywords}`);
}

// ============================================================================
// GEMINI QUERY IMPROVEMENT
// ============================================================================

async function improveQuery(userQuestion: string): Promise<{
  improved_query: string;
  search_keywords: string[];
  matched_keywords: string[];
  target_industry?: string;
  target_company?: string;
}> {
  const prompt = `You are an expert at improving user search queries for a presentation deck database.

**Available Context:**
- Companies: ${metadata.companies.join(', ')}
- Industries: ${metadata.industries.join(', ')}

**ALL Available Keywords (${metadata.total_unique_keywords} total):**
${metadata.keywords.join(', ')}

**User Question:** "${userQuestion}"

**Task:**
1. Analyze the user's question
2. Improve it for better semantic search
3. Extract 3-5 general search concepts from the question
4. **CRITICAL**: Find 5-10 EXACT keyword matches from the Available Keywords list above that are most relevant to the user's question
5. Identify target industry (if mentioned)
6. Identify target company (if mentioned)

Return ONLY valid JSON in this exact format:
{
  "improved_query": "Enhanced version of the user's question optimized for semantic search",
  "search_keywords": ["general concept 1", "general concept 2", "general concept 3"],
  "matched_keywords": ["exact keyword 1", "exact keyword 2", "exact keyword 3", "exact keyword 4", "exact keyword 5"],
  "target_industry": "industry name or null",
  "target_company": "company name or null"
}

**Important**: matched_keywords MUST be exact matches from the Available Keywords list above.`;

  const contents = [
    {
      role: 'user',
      parts: [{ text: prompt }]
    }
  ];

  const response = await genAI.models.generateContentStream({
    model: 'gemini-2.5-flash-preview-09-2025',
    contents
  });

  let responseText = '';
  for await (const chunk of response) {
    if (chunk.text) {
      responseText += chunk.text;
    }
  }

  // Extract JSON from response (handling markdown code blocks)
  let jsonText = responseText.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonText);

  console.log('\n🤖 Gemini Query Improvement:');
  console.log(`   Original: "${userQuestion}"`);
  console.log(`   Improved: "${parsed.improved_query}"`);
  console.log(`   Search Keywords: ${parsed.search_keywords.join(', ')}`);
  console.log(`   Matched Keywords: ${parsed.matched_keywords.join(', ')}`);
  if (parsed.target_industry) console.log(`   Industry: ${parsed.target_industry}`);
  if (parsed.target_company) console.log(`   Company: ${parsed.target_company}`);

  return parsed;
}

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
    dimensions: 3072
  });

  return response.data[0].embedding;
}

// ============================================================================
// PINECONE SEARCH
// ============================================================================

interface SearchResult {
  id: string;
  score: number;
  metadata: {
    type: string;
    company_name: string;
    industry: string;
    filename: string;
    slide_number?: number;
    slide_summary?: string;
    content_preview?: string; // For hybrid-chunks
    full_content?: string; // For hybrid-chunks
    keywords?: string[];
    pdf_url?: string;
    image_url?: string;
    deck_summary?: string;
  };
}

async function searchPinecone(
  queryEmbedding: number[],
  namespace: 'deck-summaries' | 'slide-summaries' | 'hybrid-chunks' | 'enriched-slides',
  filter?: Record<string, any>
): Promise<SearchResult[]> {
  const index = pinecone.index(INDEX_NAME);

  const queryResponse = await index.namespace(namespace).query({
    vector: queryEmbedding,
    topK: TOP_K,
    includeMetadata: true,
    filter
  });

  return queryResponse.matches.map(match => ({
    id: match.id,
    score: match.score || 0,
    metadata: match.metadata as any
  }));
}

// ============================================================================
// GEMINI ANSWER GENERATION
// ============================================================================

async function generateAnswer(
  userQuestion: string,
  improvedQuery: any,
  results: SearchResult[]
): Promise<string> {
  // Format context from search results
  const context = results.map((r, idx) => {
    if (r.metadata.type === 'deck') {
      return `[Deck ${idx + 1}] ${r.metadata.company_name} - ${r.metadata.industry}
Summary: ${r.metadata.deck_summary}
Keywords: ${r.metadata.keywords?.join(', ') || 'N/A'}
Relevance Score: ${(r.score * 100).toFixed(1)}%`;
    } else {
      return `[Slide ${idx + 1}] ${r.metadata.company_name} - ${r.metadata.industry}
File: ${r.metadata.filename}
Slide #${r.metadata.slide_number}: ${r.metadata.slide_summary}
Keywords: ${r.metadata.keywords?.join(', ') || 'N/A'}
Relevance Score: ${(r.score * 100).toFixed(1)}%`;
    }
  }).join('\n\n');

  const prompt = `You are an expert analyst helping users find relevant presentation decks and slides.

**User Question:** "${userQuestion}"

**Enhanced Query:** "${improvedQuery.improved_query}"

**Retrieved Context:**
${context}

**Instructions:**
1. Answer the user's question based on the retrieved context
2. Cite specific decks/slides when referring to information
3. Highlight the most relevant results (top 2-3)
4. If no perfect match exists, explain what's closest
5. Be concise and actionable

**Your Answer:**`;

  const contents = [
    {
      role: 'user',
      parts: [{ text: prompt }]
    }
  ];

  const response = await genAI.models.generateContentStream({
    model: 'gemini-2.5-pro', // Using Pro for final answer generation (better quality than Flash)
    contents
  });

  let responseText = '';
  for await (const chunk of response) {
    if (chunk.text) {
      responseText += chunk.text;
    }
  }

  return responseText;
}

// ============================================================================
// MAIN QUERY FUNCTION
// ============================================================================

async function query(userQuestion: string): Promise<void> {
  // Initialize output array for saving to file
  const outputLines: string[] = [];

  const log = (message: string) => {
    console.log(message);
    outputLines.push(message);
  };

  log('\n' + '='.repeat(80));
  log('🔍 DeckBot RAG Query');
  log('='.repeat(80));
  log(`\n📝 Question: "${userQuestion}"\n`);

  // 1. Load metadata
  await loadMetadata();

  // 2. Improve query with Gemini
  const improvedQuery = await improveQuery(userQuestion);

  // 3. Generate embedding for improved query
  log('\n🔢 Generating query embedding...');
  const embedding = await generateEmbedding(improvedQuery.improved_query);

  // 4. NO hard filtering - use semantic search only, boost with keywords
  log(`\n🎯 Target Keywords for scoring: ${improvedQuery.matched_keywords.slice(0, 5).join(', ')}${improvedQuery.matched_keywords.length > 5 ? '...' : ''}`);
  if (improvedQuery.target_industry) log(`   Target Industry: ${improvedQuery.target_industry}`);
  if (improvedQuery.target_company) log(`   Target Company: ${improvedQuery.target_company}`);

  // 5. Search enriched-slides ONLY (clean metadata with slide_summary, slide_content, slide_layout)
  log('\n🔎 Searching Pinecone (enriched-slides namespace)...');

  // Semantic search with NO metadata filters - let keyword boosting handle relevance
  let results = await searchPinecone(embedding, 'enriched-slides', undefined);
  let usedNamespace = 'enriched-slides';

  log(`   Found: ${results.length} results, top score: ${results[0]?.score ? (results[0].score * 100).toFixed(1) + '%' : 'N/A'}`);

  // 6. Keyword-based re-scoring (AGGRESSIVE BOOST)
  log('\n📊 Re-scoring results by keyword relevance...');
  results.forEach(r => {
    if (r.metadata.keywords && improvedQuery.matched_keywords) {
      const matchedKeywords = r.metadata.keywords.filter((k: string) =>
        improvedQuery.matched_keywords.some(mk =>
          k.toLowerCase().includes(mk.toLowerCase()) || mk.toLowerCase().includes(k.toLowerCase())
        )
      );
      const matchedCount = matchedKeywords.length;
      const keywordBoost = matchedCount * 0.15; // 15% boost per matched keyword (was 5%)
      (r as any).original_score = r.score;
      (r as any).keyword_matches = matchedCount;
      (r as any).matched_keywords_list = matchedKeywords;
      r.score = Math.min(1.0, r.score + keywordBoost);
    }
  });

  // Sort by new score and take top FINAL_RESULTS
  results.sort((a, b) => b.score - a.score);
  results = results.slice(0, FINAL_RESULTS);

  log(`\n✅ Found ${results.length} results (boosted by keyword matching)`);
  results.forEach((r, idx) => {
    const keywordInfo = (r as any).keyword_matches ? ` | ${(r as any).keyword_matches} kw matches` : '';
    const origScore = (r as any).original_score ? ` (orig: ${((r as any).original_score * 100).toFixed(1)}%)` : '';
    log(`   ${idx + 1}. ${r.metadata.company_name} (${(r.score * 100).toFixed(1)}%${keywordInfo}${origScore})`);
    if ((r as any).matched_keywords_list && (r as any).matched_keywords_list.length > 0) {
      log(`      Matched: ${(r as any).matched_keywords_list.slice(0, 3).join(', ')}${(r as any).matched_keywords_list.length > 3 ? '...' : ''}`);
    }
  });

  // 6. Generate answer with Gemini
  log('\n💬 Generating answer...\n');
  const answer = await generateAnswer(userQuestion, improvedQuery, results);

  log('='.repeat(80));
  log('📊 ANSWER:');
  log('='.repeat(80));
  log(answer);
  log('='.repeat(80));

  // 7. Show detailed results
  log('\n📄 Detailed Results:\n');
  results.forEach((r, idx) => {
    log(`${idx + 1}. ${r.metadata.company_name} - ${r.metadata.industry}`);
    log(`   File: ${r.metadata.filename}`);
    log(`   Score: ${(r.score * 100).toFixed(1)}%`);
    if (r.metadata.slide_number) {
      log(`   Slide: #${r.metadata.slide_number}`);
      // Use slide_summary from enriched-slides namespace
      const summary = r.metadata.slide_summary || 'No summary available';
      log(`   Summary: ${summary.substring(0, 150)}...`);
    }
    if (r.metadata.pdf_url) {
      log(`   PDF: ${r.metadata.pdf_url}`);
    }
    if (r.metadata.image_url) {
      log(`   Image: ${r.metadata.image_url}`);
    }
    log('');
  });

  // 8. Save output to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const sanitizedQuestion = userQuestion.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 50);
  const outputPath = `/Users/kjyoo/DeckBot/output/rag_${sanitizedQuestion}_${timestamp}.txt`;

  await fs.writeFile(outputPath, outputLines.join('\n'), 'utf-8');
  log(`\n💾 Output saved to: ${outputPath}`);
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run rag <question>');
    console.log('\nExamples:');
    console.log('  npm run rag "헬스케어 마케팅 전략"');
    console.log('  npm run rag "SNS 운영 제안서"');
    console.log('  npm run rag "게임 업계 브랜드 캠페인"');
    process.exit(1);
  }

  const question = args.join(' ');
  await query(question);
}

main().catch(console.error);
