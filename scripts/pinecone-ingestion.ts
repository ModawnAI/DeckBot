/**
 * Pinecone Ingestion Script for DeckBot Presentation Data
 *
 * Strategy: Multi-namespace hybrid approach for optimal retrieval
 * - deck-summaries: High-level deck discovery (400 vectors)
 * - slide-summaries: Granular slide search (~80,000 vectors)
 * - hybrid-chunks: Contextual retrieval with deck+slide info
 */

import { Pinecone, PineconeRecord } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface DeckMetadata {
  filename: string;
  deck_industry: string;
  company_name: string;
  executive_summary: string;
  total_pages: number;
  created_date: string;
  pdf_url: string;
}

interface SlideData {
  slide_number: number;
  slide_content: string;
  slide_summary: string;
  keywords: string[];
  slide_layout: string;
  image_url: string;
}

interface PresentationJSON {
  deck_metadata: DeckMetadata;
  slide_data: SlideData[];
}

interface PineconeMetadata {
  id: string;
  type: 'deck' | 'slide';
  deck_id: string;
  filename: string;
  industry: string;
  company_name: string;
  created_year: number;
  created_month: number;
  created_date: string;
  slide_number?: number;
  keywords: string[];
  pdf_url: string;
  image_url?: string;
  content_preview: string;
  full_content: string;
  total_slides?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  PINECONE_INDEX: 'deckbot-presentations',
  EMBEDDING_MODEL: 'text-embedding-3-large', // 3072 dimensions - better for multilingual Korean content
  EMBEDDING_DIMENSION: 3072,
  BATCH_SIZE: 100, // Pinecone upsert batch size
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // ms
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate deterministic ID from content
 */
function generateId(prefix: string, ...parts: (string | number)[]): string {
  const content = parts.join('|');
  const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  return `${prefix}_${hash}`;
}

/**
 * Extract year and month from ISO date string
 */
function parseDate(isoDate: string): { year: number; month: number } {
  const date = new Date(isoDate);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

/**
 * Truncate text to character limit
 */
function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Sleep utility for retry logic
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry wrapper for async operations
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = CONFIG.MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(`[${operationName}] Attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        const delay = CONFIG.RETRY_DELAY * attempt;
        console.log(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// ============================================================================
// PINECONE SETUP
// ============================================================================

class PineconeIngestion {
  private pc: Pinecone;
  private openai: OpenAI;

  constructor() {
    this.pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  /**
   * Create index if it doesn't exist
   */
  async ensureIndex(): Promise<void> {
    try {
      const existingIndexes = await this.pc.listIndexes();
      const indexExists = existingIndexes.indexes?.some(
        (idx) => idx.name === CONFIG.PINECONE_INDEX
      );

      if (indexExists) {
        console.log(`✅ Index '${CONFIG.PINECONE_INDEX}' already exists`);
        return;
      }

      console.log(`🔨 Creating index '${CONFIG.PINECONE_INDEX}'...`);

      await this.pc.createIndex({
        name: CONFIG.PINECONE_INDEX,
        dimension: CONFIG.EMBEDDING_DIMENSION,
        metric: 'cosine',
        spec: {
          pod: {
            environment: 'gcp-starter',  // Free tier, closest to Seoul
            podType: 'starter',
            pods: 1,
            metadataConfig: {
              indexed: [
                'type',
                'industry',
                'company_name',
                'deck_id',
                'created_year',
                'keywords'
              ]
            }
          }
        },
        waitUntilReady: true,
      });

      console.log(`✅ Index created successfully`);
    } catch (error) {
      throw new Error(`Failed to ensure index: ${error}`);
    }
  }

  /**
   * Generate embeddings for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return withRetry(async () => {
      const response = await this.openai.embeddings.create({
        model: CONFIG.EMBEDDING_MODEL,
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    }, 'generateEmbedding');
  }

  /**
   * Generate embeddings in batches to avoid rate limits
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in smaller batches to avoid token limits
    const batchSize = 50;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      console.log(`  Generating embeddings ${i + 1}-${Math.min(i + batchSize, texts.length)} of ${texts.length}...`);

      const batchEmbeddings = await withRetry(async () => {
        const response = await this.openai.embeddings.create({
          model: CONFIG.EMBEDDING_MODEL,
          input: batch,
          encoding_format: 'float',
        });

        return response.data.map(d => d.embedding);
      }, `generateEmbeddingsBatch_${i}`);

      embeddings.push(...batchEmbeddings);

      // Rate limiting: wait between batches
      if (i + batchSize < texts.length) {
        await sleep(200);
      }
    }

    return embeddings;
  }

  /**
   * Process a single JSON file and create vectors
   */
  async processJSONFile(
    filePath: string
  ): Promise<{
    deckVectors: PineconeRecord<PineconeMetadata>[];
    slideVectors: PineconeRecord<PineconeMetadata>[];
    hybridVectors: PineconeRecord<PineconeMetadata>[];
  }> {
    console.log(`\n📄 Processing: ${path.basename(filePath)}`);

    // Load JSON
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data: PresentationJSON = JSON.parse(fileContent);

    const { deck_metadata, slide_data } = data;
    const { year: created_year, month: created_month } = parseDate(deck_metadata.created_date);

    // Generate unique deck ID
    const deck_id = generateId('deck', deck_metadata.filename);

    // Collect all keywords from slides (limit to top 50 most common)
    const keywordCounts = slide_data.flatMap(s => s.keywords).reduce((acc, kw) => {
      acc[kw] = (acc[kw] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const allKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([kw]) => kw);

    console.log(`  Deck: ${deck_metadata.company_name} (${deck_metadata.deck_industry})`);
    console.log(`  Slides: ${slide_data.length}`);
    console.log(`  Keywords: ${allKeywords.length} (top 50)`);

    // ========================================================================
    // 1. CREATE DECK-LEVEL VECTOR
    // ========================================================================

    // Truncate executive summary to avoid token limits (max ~6000 chars = ~1500 tokens)
    const truncatedSummary = truncate(deck_metadata.executive_summary, 6000);

    const deckEmbeddingText = `${deck_metadata.company_name} - ${deck_metadata.deck_industry}
${truncatedSummary}
Keywords: ${allKeywords.join(', ')}`;

    console.log(`  Generating deck embedding...`);
    const deckEmbedding = await this.generateEmbedding(deckEmbeddingText);

    const deckVector: PineconeRecord<PineconeMetadata> = {
      id: deck_id,
      values: deckEmbedding,
      metadata: {
        id: deck_id,
        type: 'deck',
        deck_id,
        filename: deck_metadata.filename,
        industry: deck_metadata.deck_industry,
        company_name: deck_metadata.company_name,
        created_year,
        created_month,
        created_date: deck_metadata.created_date,
        keywords: allKeywords,
        pdf_url: deck_metadata.pdf_url,
        content_preview: truncate(deck_metadata.executive_summary, 200),
        full_content: deck_metadata.executive_summary,
        total_slides: slide_data.length,
      },
    };

    // ========================================================================
    // 2. CREATE SLIDE-LEVEL VECTORS
    // ========================================================================

    console.log(`  Generating ${slide_data.length} slide embeddings...`);

    const slideEmbeddingTexts = slide_data.map(slide =>
      `Slide ${slide.slide_number}: ${slide.slide_summary}
Keywords: ${slide.keywords.join(', ')}
Content: ${slide.slide_content ? slide.slide_content.substring(0, 500) : ''}`
    );

    const slideEmbeddings = await this.generateEmbeddingsBatch(slideEmbeddingTexts);

    const slideVectors: PineconeRecord<PineconeMetadata>[] = slide_data.map((slide, idx) => {
      const slide_id = generateId('slide', deck_id, slide.slide_number);

      return {
        id: slide_id,
        values: slideEmbeddings[idx],
        metadata: {
          id: slide_id,
          type: 'slide',
          deck_id,
          filename: deck_metadata.filename,
          industry: deck_metadata.deck_industry,
          company_name: deck_metadata.company_name,
          created_year,
          created_month,
          created_date: deck_metadata.created_date,
          slide_number: slide.slide_number,
          keywords: slide.keywords,
          pdf_url: deck_metadata.pdf_url,
          image_url: slide.image_url,
          content_preview: truncate(slide.slide_summary, 200),
          full_content: slide.slide_summary,
        },
      };
    });

    // ========================================================================
    // 3. CREATE HYBRID VECTORS (Deck Context + Slide Content)
    // ========================================================================

    console.log(`  Generating ${slide_data.length} hybrid embeddings...`);

    const hybridEmbeddingTexts = slide_data.map(slide =>
      `[DECK: ${deck_metadata.company_name} - ${deck_metadata.deck_industry}]
[SLIDE ${slide.slide_number}/${deck_metadata.total_pages}]
${slide.slide_summary}
${slide.slide_content || ''}`
    );

    const hybridEmbeddings = await this.generateEmbeddingsBatch(hybridEmbeddingTexts);

    const hybridVectors: PineconeRecord<PineconeMetadata>[] = slide_data.map((slide, idx) => {
      const hybrid_id = generateId('hybrid', deck_id, slide.slide_number);

      return {
        id: hybrid_id,
        values: hybridEmbeddings[idx],
        metadata: {
          id: hybrid_id,
          type: 'slide',
          deck_id,
          filename: deck_metadata.filename,
          industry: deck_metadata.deck_industry,
          company_name: deck_metadata.company_name,
          created_year,
          created_month,
          created_date: deck_metadata.created_date,
          slide_number: slide.slide_number,
          keywords: slide.keywords,
          pdf_url: deck_metadata.pdf_url,
          image_url: slide.image_url,
          content_preview: truncate(slide.slide_summary, 200),
          full_content: `${slide.slide_summary}\n\n${slide.slide_content}`,
        },
      };
    });

    // NEW: Enriched slides with ALL metadata (slide_summary, slide_content, slide_layout)
    // NO redundant fields (removed content_preview which duplicated slide_summary)
    const enrichedVectors: PineconeRecord<PineconeMetadata>[] = slide_data.map((slide, idx) => {
      const enriched_id = generateId('enriched', deck_id, slide.slide_number);

      return {
        id: enriched_id,
        values: hybridEmbeddings[idx], // Reuse hybrid embeddings
        metadata: {
          id: enriched_id,
          type: 'slide',
          deck_id,
          filename: deck_metadata.filename,
          industry: deck_metadata.deck_industry,
          company_name: deck_metadata.company_name,
          created_year,
          created_month,
          created_date: deck_metadata.created_date,
          slide_number: slide.slide_number,
          keywords: slide.keywords,
          pdf_url: deck_metadata.pdf_url,
          image_url: slide.image_url,
          // ENRICHED: Include all structured fields (no redundancy)
          slide_summary: slide.slide_summary,
          slide_content: slide.slide_content || '',
          slide_layout: slide.slide_layout,
        },
      };
    });

    console.log(`  ✅ Generated ${1 + slideVectors.length + hybridVectors.length + enrichedVectors.length} total vectors`);

    return {
      deckVectors: [deckVector],
      slideVectors,
      hybridVectors,
      enrichedVectors,
    };
  }

  /**
   * Upsert vectors to Pinecone in batches
   */
  async upsertVectors<T extends Record<string, any>>(
    namespace: string,
    vectors: PineconeRecord<T>[]
  ): Promise<void> {
    if (vectors.length === 0) return;

    const index = this.pc.index<T>(CONFIG.PINECONE_INDEX).namespace(namespace);

    console.log(`\n📤 Upserting ${vectors.length} vectors to namespace '${namespace}'...`);

    for (let i = 0; i < vectors.length; i += CONFIG.BATCH_SIZE) {
      const batch = vectors.slice(i, i + CONFIG.BATCH_SIZE);

      console.log(`  Batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}: ${batch.length} vectors`);

      await withRetry(async () => {
        await index.upsert(batch);
      }, `upsert_${namespace}_batch_${i}`);
    }

    console.log(`  ✅ Upserted ${vectors.length} vectors to '${namespace}'`);
  }

  /**
   * Process all JSON files in a directory
   */
  async processDirectory(directoryPath: string): Promise<void> {
    console.log(`\n🚀 Starting batch ingestion from: ${directoryPath}\n`);

    // Ensure index exists
    await this.ensureIndex();

    // Get all JSON files
    const files = await fs.readdir(directoryPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    console.log(`Found ${jsonFiles.length} JSON files\n`);

    const allDeckVectors: PineconeRecord<PineconeMetadata>[] = [];
    const allSlideVectors: PineconeRecord<PineconeMetadata>[] = [];
    const allHybridVectors: PineconeRecord<PineconeMetadata>[] = [];
    const allEnrichedVectors: PineconeRecord<PineconeMetadata>[] = [];

    // Process each file
    for (let i = 0; i < jsonFiles.length; i++) {
      const filePath = path.join(directoryPath, jsonFiles[i]);

      console.log(`\n[${i + 1}/${jsonFiles.length}] Processing file...`);

      try {
        const { deckVectors, slideVectors, hybridVectors, enrichedVectors } = await this.processJSONFile(filePath);

        allDeckVectors.push(...deckVectors);
        allSlideVectors.push(...slideVectors);
        allHybridVectors.push(...hybridVectors);
        allEnrichedVectors.push(...enrichedVectors);
      } catch (error) {
        console.error(`❌ Failed to process ${jsonFiles[i]}:`, error);
        continue;
      }
    }

    // Upsert all vectors
    console.log(`\n📊 SUMMARY:`);
    console.log(`  Deck vectors: ${allDeckVectors.length}`);
    console.log(`  Slide vectors: ${allSlideVectors.length}`);
    console.log(`  Hybrid vectors: ${allHybridVectors.length}`);
    console.log(`  Enriched vectors: ${allEnrichedVectors.length}`);
    console.log(`  Total vectors: ${allDeckVectors.length + allSlideVectors.length + allHybridVectors.length + allEnrichedVectors.length}`);

    await this.upsertVectors('deck-summaries', allDeckVectors);
    await this.upsertVectors('slide-summaries', allSlideVectors);
    await this.upsertVectors('hybrid-chunks', allHybridVectors);
    await this.upsertVectors('enriched-slides', allEnrichedVectors);

    console.log(`\n✅ Ingestion complete!`);
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<void> {
    const index = this.pc.index(CONFIG.PINECONE_INDEX);

    const stats = await index.describeIndexStats();

    console.log(`\n📈 INDEX STATISTICS:`);
    console.log(`  Total vectors: ${stats.totalRecordCount}`);
    console.log(`  Dimension: ${stats.dimension}`);
    console.log(`  Index fullness: ${(stats.indexFullness || 0) * 100}%`);
    console.log(`\n  Namespaces:`);

    if (stats.namespaces) {
      for (const [ns, data] of Object.entries(stats.namespaces)) {
        console.log(`    ${ns}: ${data.recordCount} vectors`);
      }
    }
  }
}

// ============================================================================
// QUERY EXAMPLES
// ============================================================================

class PineconeQuery {
  private pc: Pinecone;
  private openai: OpenAI;

  constructor() {
    this.pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  /**
   * Generate query embedding
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: CONFIG.EMBEDDING_MODEL,
      input: query,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  }

  /**
   * Example Query 1: Find relevant decks by industry
   */
  async findDecksByIndustry(query: string, industry?: string) {
    console.log(`\n🔍 Query: "${query}"`);
    if (industry) console.log(`   Filter: industry = ${industry}`);

    const queryEmbedding = await this.generateQueryEmbedding(query);

    const index = this.pc.index<PineconeMetadata>(CONFIG.PINECONE_INDEX)
      .namespace('deck-summaries');

    const results = await index.query({
      vector: queryEmbedding,
      topK: 5,
      includeMetadata: true,
      ...(industry && {
        filter: { industry: { $eq: industry } }
      }),
    });

    console.log(`\n📋 Results (${results.matches.length} decks):`);
    results.matches.forEach((match, idx) => {
      console.log(`\n  ${idx + 1}. ${match.metadata?.company_name} (score: ${match.score?.toFixed(4)})`);
      console.log(`     Industry: ${match.metadata?.industry}`);
      console.log(`     Preview: ${match.metadata?.content_preview}`);
      console.log(`     PDF: ${match.metadata?.pdf_url}`);
    });

    return results;
  }

  /**
   * Example Query 2: Find specific slides across all decks
   */
  async findSlides(query: string, filters?: {
    industry?: string;
    company?: string;
    keywords?: string[];
    yearFrom?: number;
  }) {
    console.log(`\n🔍 Query: "${query}"`);
    if (filters) console.log(`   Filters:`, filters);

    const queryEmbedding = await this.generateQueryEmbedding(query);

    const index = this.pc.index<PineconeMetadata>(CONFIG.PINECONE_INDEX)
      .namespace('hybrid-chunks');

    // Build filter
    const filter: any = { type: { $eq: 'slide' } };

    if (filters?.industry) {
      filter.industry = { $eq: filters.industry };
    }

    if (filters?.company) {
      filter.company_name = { $eq: filters.company };
    }

    if (filters?.keywords && filters.keywords.length > 0) {
      filter.keywords = { $in: filters.keywords };
    }

    if (filters?.yearFrom) {
      filter.created_year = { $gte: filters.yearFrom };
    }

    const results = await index.query({
      vector: queryEmbedding,
      topK: 10,
      includeMetadata: true,
      filter,
    });

    console.log(`\n📋 Results (${results.matches.length} slides):`);
    results.matches.forEach((match, idx) => {
      console.log(`\n  ${idx + 1}. ${match.metadata?.company_name} - Slide ${match.metadata?.slide_number} (score: ${match.score?.toFixed(4)})`);
      console.log(`     Industry: ${match.metadata?.industry}`);
      console.log(`     Preview: ${match.metadata?.content_preview}`);
      console.log(`     Image: ${match.metadata?.image_url}`);
    });

    return results;
  }

  /**
   * Example Query 3: Cascading search (find decks, then slides)
   */
  async cascadingSearch(query: string, industry?: string) {
    console.log(`\n🔍 CASCADING SEARCH: "${query}"`);

    // Step 1: Find top 3 relevant decks
    console.log(`\n  Step 1: Finding relevant decks...`);
    const deckResults = await this.findDecksByIndustry(query, industry);

    const deck_ids = deckResults.matches
      .slice(0, 3)
      .map(m => m.metadata?.deck_id)
      .filter(Boolean) as string[];

    if (deck_ids.length === 0) {
      console.log(`\n  ❌ No relevant decks found`);
      return;
    }

    // Step 2: Find slides from those decks
    console.log(`\n  Step 2: Finding slides from ${deck_ids.length} decks...`);

    const queryEmbedding = await this.generateQueryEmbedding(query);

    const index = this.pc.index<PineconeMetadata>(CONFIG.PINECONE_INDEX)
      .namespace('hybrid-chunks');

    const slideResults = await index.query({
      vector: queryEmbedding,
      topK: 15,
      includeMetadata: true,
      filter: {
        deck_id: { $in: deck_ids },
        type: { $eq: 'slide' },
      },
    });

    console.log(`\n📋 Final Results (${slideResults.matches.length} slides from ${deck_ids.length} decks):`);
    slideResults.matches.forEach((match, idx) => {
      console.log(`\n  ${idx + 1}. ${match.metadata?.company_name} - Slide ${match.metadata?.slide_number} (score: ${match.score?.toFixed(4)})`);
      console.log(`     Preview: ${match.metadata?.content_preview}`);
    });

    return slideResults;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Usage:
  npm run ingest -- <directory>     # Ingest all JSON files from directory
  npm run stats                      # Show index statistics
  npm run query -- <query> [industry]  # Query decks
  npm run search -- <query>          # Search slides
    `);
    process.exit(1);
  }

  try {
    if (command === 'ingest') {
      const directory = args[1] || './output';
      const ingestion = new PineconeIngestion();
      await ingestion.processDirectory(directory);
      await ingestion.getIndexStats();
    }
    else if (command === 'stats') {
      const ingestion = new PineconeIngestion();
      await ingestion.getIndexStats();
    }
    else if (command === 'query') {
      const query = args.slice(1).join(' ');
      const queryer = new PineconeQuery();
      await queryer.findDecksByIndustry(query);
    }
    else if (command === 'search') {
      const query = args.slice(1).join(' ');
      const queryer = new PineconeQuery();
      await queryer.findSlides(query);
    }
    else if (command === 'cascade') {
      const query = args.slice(1).join(' ');
      const queryer = new PineconeQuery();
      await queryer.cascadingSearch(query);
    }
    else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if called directly (ES module compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}

export { PineconeIngestion, PineconeQuery };
