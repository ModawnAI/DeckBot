/**
 * Pinecone Query Interface for DeckBot Chatbot
 *
 * Simple library to query the deckbot-presentations index
 * with optimal filtering and namespace selection.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';

// ============================================================================
// TYPES
// ============================================================================

export interface QueryOptions {
  /** Search query text */
  query: string;
  /** Number of results to return (default: 10) */
  topK?: number;
  /** Optional filters */
  filters?: QueryFilters;
  /** Search mode (default: 'slides') */
  mode?: 'decks' | 'slides' | 'cascade';
}

export interface QueryFilters {
  /** Filter by industry (e.g., "Technology", "Healthcare") */
  industry?: string;
  /** Filter by company name (e.g., "Samsung", "LG") */
  company?: string;
  /** Filter by keywords (e.g., ["AI", "Marketing"]) */
  keywords?: string[];
  /** Filter by year (from) */
  yearFrom?: number;
  /** Filter by year (to) */
  yearTo?: number;
  /** Filter by specific deck IDs */
  deckIds?: string[];
}

export interface DeckResult {
  id: string;
  score: number;
  company: string;
  industry: string;
  preview: string;
  totalSlides: number;
  pdfUrl: string;
  createdDate: string;
  keywords: string[];
}

export interface SlideResult {
  id: string;
  score: number;
  company: string;
  industry: string;
  slideNumber: number;
  preview: string;
  imageUrl: string;
  pdfUrl: string;
  deckId: string;
  keywords: string[];
  createdDate: string;
}

// ============================================================================
// MAIN QUERY CLASS
// ============================================================================

export class DeckBotQuery {
  private pc: Pinecone;
  private openai: OpenAI;
  private indexName = 'deckbot-presentations';

  constructor(pineconeApiKey?: string, openaiApiKey?: string) {
    this.pc = new Pinecone({
      apiKey: pineconeApiKey || process.env.PINECONE_API_KEY!,
    });

    this.openai = new OpenAI({
      apiKey: openaiApiKey || process.env.OPENAI_API_KEY!,
    });
  }

  // ==========================================================================
  // PUBLIC QUERY METHODS
  // ==========================================================================

  /**
   * Main query method - automatically selects best strategy
   */
  async query(options: QueryOptions): Promise<DeckResult[] | SlideResult[]> {
    const mode = options.mode || 'slides';

    switch (mode) {
      case 'decks':
        return this.queryDecks(options);
      case 'slides':
        return this.querySlides(options);
      case 'cascade':
        return this.queryCascade(options);
      default:
        throw new Error(`Unknown query mode: ${mode}`);
    }
  }

  /**
   * Query for decks (high-level search)
   * Use this for: "Find presentations about X"
   */
  async queryDecks(options: QueryOptions): Promise<DeckResult[]> {
    const { query, topK = 5, filters } = options;

    // Generate embedding
    const embedding = await this.generateEmbedding(query);

    // Build filter
    const filter = this.buildDeckFilter(filters);

    // Query deck-summaries namespace
    const index = this.pc.index(this.indexName).namespace('deck-summaries');
    const results = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      ...(Object.keys(filter).length > 0 && { filter }),
    });

    // Map results
    return results.matches.map((match) => ({
      id: match.id,
      score: match.score || 0,
      company: match.metadata?.company_name as string,
      industry: match.metadata?.industry as string,
      preview: match.metadata?.content_preview as string,
      totalSlides: match.metadata?.total_slides as number,
      pdfUrl: match.metadata?.pdf_url as string,
      createdDate: match.metadata?.created_date as string,
      keywords: (match.metadata?.keywords as string[]) || [],
    }));
  }

  /**
   * Query for slides (detailed search with context)
   * Use this for: "Find slides about X", "Show me examples of Y"
   */
  async querySlides(options: QueryOptions): Promise<SlideResult[]> {
    const { query, topK = 10, filters } = options;

    // Generate embedding
    const embedding = await this.generateEmbedding(query);

    // Build filter
    const filter = this.buildSlideFilter(filters);

    // Query hybrid-chunks namespace (better context)
    const index = this.pc.index(this.indexName).namespace('hybrid-chunks');
    const results = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      filter,
    });

    // Map results
    return results.matches.map((match) => ({
      id: match.id,
      score: match.score || 0,
      company: match.metadata?.company_name as string,
      industry: match.metadata?.industry as string,
      slideNumber: match.metadata?.slide_number as number,
      preview: match.metadata?.content_preview as string,
      imageUrl: match.metadata?.image_url as string,
      pdfUrl: match.metadata?.pdf_url as string,
      deckId: match.metadata?.deck_id as string,
      keywords: (match.metadata?.keywords as string[]) || [],
      createdDate: match.metadata?.created_date as string,
    }));
  }

  /**
   * Cascading search (find relevant decks, then their slides)
   * Use this for: High-precision search when you want best matches
   */
  async queryCascade(options: QueryOptions): Promise<SlideResult[]> {
    const { query, topK = 15, filters } = options;

    // Step 1: Find top 3 relevant decks
    const deckResults = await this.queryDecks({
      query,
      topK: 3,
      filters,
    });

    if (deckResults.length === 0) {
      return [];
    }

    // Step 2: Get deck IDs
    const deckIds = deckResults.map((deck) => deck.id);

    // Step 3: Query slides from those decks
    const embedding = await this.generateEmbedding(query);
    const filter = this.buildSlideFilter({
      ...filters,
      deckIds,
    });

    const index = this.pc.index(this.indexName).namespace('hybrid-chunks');
    const results = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      filter,
    });

    // Map results
    return results.matches.map((match) => ({
      id: match.id,
      score: match.score || 0,
      company: match.metadata?.company_name as string,
      industry: match.metadata?.industry as string,
      slideNumber: match.metadata?.slide_number as number,
      preview: match.metadata?.content_preview as string,
      imageUrl: match.metadata?.image_url as string,
      pdfUrl: match.metadata?.pdf_url as string,
      deckId: match.metadata?.deck_id as string,
      keywords: (match.metadata?.keywords as string[]) || [],
      createdDate: match.metadata?.created_date as string,
    }));
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Generate OpenAI embedding for query text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  }

  /**
   * Build Pinecone filter for deck queries
   */
  private buildDeckFilter(filters?: QueryFilters): Record<string, any> {
    if (!filters) return {};

    const filter: Record<string, any> = {};
    const conditions: any[] = [];

    // Industry filter
    if (filters.industry) {
      conditions.push({ industry: { $eq: filters.industry } });
    }

    // Company filter
    if (filters.company) {
      conditions.push({ company_name: { $eq: filters.company } });
    }

    // Keywords filter
    if (filters.keywords && filters.keywords.length > 0) {
      conditions.push({ keywords: { $in: filters.keywords } });
    }

    // Year range filter
    if (filters.yearFrom && filters.yearTo) {
      conditions.push({
        created_year: {
          $gte: filters.yearFrom,
          $lte: filters.yearTo,
        },
      });
    } else if (filters.yearFrom) {
      conditions.push({ created_year: { $gte: filters.yearFrom } });
    } else if (filters.yearTo) {
      conditions.push({ created_year: { $lte: filters.yearTo } });
    }

    // Combine conditions with $and
    if (conditions.length > 0) {
      if (conditions.length === 1) {
        return conditions[0];
      }
      filter.$and = conditions;
    }

    return filter;
  }

  /**
   * Build Pinecone filter for slide queries
   */
  private buildSlideFilter(filters?: QueryFilters): Record<string, any> {
    const baseConditions: any[] = [
      { type: { $eq: 'slide' } }, // Always filter for slides
    ];

    if (!filters) {
      return baseConditions[0];
    }

    // Industry filter
    if (filters.industry) {
      baseConditions.push({ industry: { $eq: filters.industry } });
    }

    // Company filter
    if (filters.company) {
      baseConditions.push({ company_name: { $eq: filters.company } });
    }

    // Keywords filter
    if (filters.keywords && filters.keywords.length > 0) {
      baseConditions.push({ keywords: { $in: filters.keywords } });
    }

    // Year range filter
    if (filters.yearFrom && filters.yearTo) {
      baseConditions.push({
        created_year: {
          $gte: filters.yearFrom,
          $lte: filters.yearTo,
        },
      });
    } else if (filters.yearFrom) {
      baseConditions.push({ created_year: { $gte: filters.yearFrom } });
    } else if (filters.yearTo) {
      baseConditions.push({ created_year: { $lte: filters.yearTo } });
    }

    // Deck IDs filter (for cascade mode)
    if (filters.deckIds && filters.deckIds.length > 0) {
      baseConditions.push({ deck_id: { $in: filters.deckIds } });
    }

    // Combine conditions
    if (baseConditions.length === 1) {
      return baseConditions[0];
    }

    return { $and: baseConditions };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick search for slides (most common use case)
 */
export async function searchSlides(
  query: string,
  filters?: QueryFilters,
  topK?: number
): Promise<SlideResult[]> {
  const db = new DeckBotQuery();
  return db.querySlides({ query, filters, topK });
}

/**
 * Quick search for decks
 */
export async function searchDecks(
  query: string,
  filters?: QueryFilters,
  topK?: number
): Promise<DeckResult[]> {
  const db = new DeckBotQuery();
  return db.queryDecks({ query, filters, topK });
}

/**
 * Quick cascading search (high precision)
 */
export async function searchCascade(
  query: string,
  filters?: QueryFilters,
  topK?: number
): Promise<SlideResult[]> {
  const db = new DeckBotQuery();
  return db.queryCascade({ query, filters, topK });
}
