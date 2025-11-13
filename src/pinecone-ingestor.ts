/**
 * Pinecone Ingestor - Integrated ingestion for single PDF processing
 *
 * This module handles immediate Pinecone ingestion after PDF processing,
 * generating embeddings and upserting vectors in real-time.
 */

import { Pinecone, PineconeRecord } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import crypto from 'crypto';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

import type { PitchDeckData } from './types.js';

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
  [key: string]: any; // Index signature for Pinecone compatibility
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  PINECONE_INDEX: 'deckbot-presentations',
  EMBEDDING_MODEL: 'text-embedding-3-large',
  EMBEDDING_DIMENSION: 3072,
  BATCH_SIZE: 100,
  EMBEDDING_BATCH_SIZE: 50,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateId(prefix: string, ...parts: (string | number)[]): string {
  const content = parts.join('|');
  const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  return `${prefix}_${hash}`;
}

function parseDate(isoDate: string): { year: number; month: number } {
  const date = new Date(isoDate);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = CONFIG.MAX_RETRIES,
  delayMs: number = CONFIG.RETRY_DELAY
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(2, attempt - 1);
        console.log(`  ⚠️  ${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// ============================================================================
// PINECONE INGESTOR CLASS
// ============================================================================

export class PineconeIngestor {
  private pc: Pinecone;
  private openai: OpenAI;

  constructor() {
    const pineconeKey = process.env.PINECONE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!pineconeKey || !openaiKey) {
      throw new Error('Missing required API keys: PINECONE_API_KEY and OPENAI_API_KEY');
    }

    this.pc = new Pinecone({ apiKey: pineconeKey });
    this.openai = new OpenAI({ apiKey: openaiKey });
  }

  /**
   * Generate embeddings in batches
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];
    const batchSize = CONFIG.EMBEDDING_BATCH_SIZE;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const endIndex = Math.min(i + batchSize, texts.length);

      console.log(`  Generating embeddings ${i + 1}-${endIndex} of ${texts.length}...`);

      const response = await retryWithBackoff(
        () => this.openai.embeddings.create({
          model: CONFIG.EMBEDDING_MODEL,
          input: batch,
        }),
        `Embedding batch ${i / batchSize + 1}`
      );

      const embeddings = response.data.map(item => item.embedding);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  /**
   * Generate single embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await retryWithBackoff(
      () => this.openai.embeddings.create({
        model: CONFIG.EMBEDDING_MODEL,
        input: text,
      }),
      'Single embedding'
    );

    return response.data[0].embedding;
  }

  /**
   * Upsert vectors to Pinecone in batches
   */
  private async upsertVectors<T extends Record<string, any>>(
    namespace: string,
    vectors: PineconeRecord<T>[]
  ): Promise<void> {
    if (vectors.length === 0) {
      console.log(`  ⚠️  No vectors to upsert for namespace '${namespace}'`);
      return;
    }

    console.log(`\n📤 Upserting ${vectors.length} vectors to namespace '${namespace}'...`);

    const index = this.pc.index<T>(CONFIG.PINECONE_INDEX);
    const batchSize = CONFIG.BATCH_SIZE;

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      console.log(`  Batch ${batchNum}: ${batch.length} vectors`);

      await retryWithBackoff(
        () => index.namespace(namespace).upsert(batch),
        `upsert_${namespace}_batch_${batchNum}`
      );
    }

    console.log(`  ✅ Upserted ${vectors.length} vectors to '${namespace}'`);
  }

  /**
   * Ingest a single presentation JSON file to Pinecone
   */
  async ingestPresentation(data: PitchDeckData): Promise<void> {
    console.log(`\n🔥 PINECONE INGESTION STARTED`);
    console.log(`   Deck: ${data.deck_metadata.company_name} (${data.deck_metadata.deck_industry})`);
    console.log(`   Slides: ${data.slide_data.length}`);

    const { deck_metadata, slide_data } = data;
    const { year: created_year, month: created_month } = parseDate(deck_metadata.created_date);
    const deck_id = generateId('deck', deck_metadata.filename);

    // Handle optional pdf_url and convert enum to string
    const pdf_url = deck_metadata.pdf_url || '';
    const industry = String(deck_metadata.deck_industry);

    // Collect keywords
    const keywordCounts = slide_data.flatMap(s => s.keywords).reduce((acc, kw) => {
      acc[kw] = (acc[kw] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const allKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([kw]) => kw);

    console.log(`   Keywords: ${allKeywords.length} (top 50)`);

    // ========================================================================
    // 1. CREATE DECK-LEVEL VECTOR
    // ========================================================================

    const truncatedSummary = truncate(deck_metadata.executive_summary, 6000);
    const deckEmbeddingText = `${deck_metadata.company_name} - ${industry}
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
        industry: industry,
        company_name: deck_metadata.company_name,
        created_year,
        created_month,
        created_date: deck_metadata.created_date,
        keywords: allKeywords,
        pdf_url: pdf_url,
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

    const slideEmbeddings = await this.generateEmbeddings(slideEmbeddingTexts);

    const slideVectors: PineconeRecord<PineconeMetadata>[] = slide_data.map((slide, idx) => ({
      id: generateId('slide', deck_id, slide.slide_number),
      values: slideEmbeddings[idx],
      metadata: {
        id: generateId('slide', deck_id, slide.slide_number),
        type: 'slide',
        deck_id,
        filename: deck_metadata.filename,
        industry: industry,
        company_name: deck_metadata.company_name,
        created_year,
        created_month,
        created_date: deck_metadata.created_date,
        slide_number: slide.slide_number,
        keywords: slide.keywords,
        pdf_url: pdf_url,
        image_url: slide.image_url,
        content_preview: truncate(slide.slide_summary, 200),
        full_content: slide.slide_content || slide.slide_summary,
      },
    }));

    // ========================================================================
    // 3. CREATE HYBRID VECTORS (Deck context + slide content)
    // ========================================================================

    console.log(`  Generating ${slide_data.length} hybrid embeddings...`);

    const hybridEmbeddingTexts = slide_data.map(slide =>
      `Company: ${deck_metadata.company_name} | Industry: ${industry}
Slide ${slide.slide_number}/${slide_data.length}: ${slide.slide_summary}
Keywords: ${slide.keywords.join(', ')}`
    );

    const hybridEmbeddings = await this.generateEmbeddings(hybridEmbeddingTexts);

    const hybridVectors: PineconeRecord<PineconeMetadata>[] = slide_data.map((slide, idx) => ({
      id: generateId('hybrid', deck_id, slide.slide_number),
      values: hybridEmbeddings[idx],
      metadata: {
        id: generateId('hybrid', deck_id, slide.slide_number),
        type: 'slide',
        deck_id,
        filename: deck_metadata.filename,
        industry: industry,
        company_name: deck_metadata.company_name,
        created_year,
        created_month,
        created_date: deck_metadata.created_date,
        slide_number: slide.slide_number,
        keywords: slide.keywords,
        pdf_url: pdf_url,
        image_url: slide.image_url,
        content_preview: truncate(slide.slide_summary, 200),
        full_content: `${slide.slide_summary}\n\nFull content: ${slide.slide_content || ''}`,
      },
    }));

    // ========================================================================
    // 4. CREATE ENRICHED VECTORS (Full content with layout)
    // ========================================================================

    const enrichedVectors: PineconeRecord<PineconeMetadata>[] = slide_data.map((slide, idx) => ({
      id: generateId('enriched', deck_id, slide.slide_number),
      values: slideEmbeddings[idx], // Reuse slide embeddings
      metadata: {
        id: generateId('enriched', deck_id, slide.slide_number),
        type: 'slide',
        deck_id,
        filename: deck_metadata.filename,
        industry: industry,
        company_name: deck_metadata.company_name,
        created_year,
        created_month,
        created_date: deck_metadata.created_date,
        slide_number: slide.slide_number,
        keywords: slide.keywords,
        pdf_url: pdf_url,
        image_url: slide.image_url,
        content_preview: truncate(slide.slide_summary, 200),
        full_content: `Layout: ${slide.slide_layout}\n\nSummary: ${slide.slide_summary}\n\nContent: ${slide.slide_content || ''}`,
      },
    }));

    console.log(`  ✅ Generated ${1 + slideVectors.length + hybridVectors.length + enrichedVectors.length} total vectors`);

    // ========================================================================
    // 5. UPSERT TO PINECONE
    // ========================================================================

    await this.upsertVectors('deck-summaries', [deckVector]);
    await this.upsertVectors('slide-summaries', slideVectors);
    await this.upsertVectors('hybrid-chunks', hybridVectors);
    await this.upsertVectors('enriched-slides', enrichedVectors);

    console.log(`\n✅ PINECONE INGESTION COMPLETE!`);
  }
}
