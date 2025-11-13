/**
 * Extract Unique Metadata from Pinecone Index
 *
 * Extracts all unique industries, companies, and keywords
 * from the deckbot-presentations index and saves to JSON.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// TYPES
// ============================================================================

interface MetadataSummary {
  indexName: string;
  extractedAt: string;
  totalDecks: number;
  totalSlides: number;
  industries: string[];
  companies: string[];
  keywords: string[];
  yearRange: {
    min: number;
    max: number;
  };
  industriesWithCounts: Record<string, number>;
  companiesWithCounts: Record<string, number>;
  keywordsWithCounts: Record<string, number>;
}

interface PineconeMetadata {
  type: 'deck' | 'slide';
  industry?: string;
  company_name?: string;
  keywords?: string[];
  created_year?: number;
  deck_id?: string;
  [key: string]: any;
}

// ============================================================================
// EXTRACTOR CLASS
// ============================================================================

class MetadataExtractor {
  private pc: Pinecone;
  private indexName = 'deckbot-presentations';

  constructor() {
    this.pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }

  /**
   * Extract metadata from a namespace
   */
  async extractFromNamespace(namespace: string): Promise<{
    industries: Set<string>;
    companies: Set<string>;
    keywords: Set<string>;
    years: number[];
    deckIds: Set<string>;
    industriesCounts: Map<string, number>;
    companiesCounts: Map<string, number>;
    keywordsCounts: Map<string, number>;
  }> {
    console.log(`\n📊 Extracting from namespace: ${namespace}`);

    const index = this.pc.index<PineconeMetadata>(this.indexName).namespace(namespace);

    const industries = new Set<string>();
    const companies = new Set<string>();
    const keywords = new Set<string>();
    const years: number[] = [];
    const deckIds = new Set<string>();

    const industriesCounts = new Map<string, number>();
    const companiesCounts = new Map<string, number>();
    const keywordsCounts = new Map<string, number>();

    // List all vectors in namespace
    let paginationToken: string | undefined;
    let totalVectors = 0;

    do {
      const listResult = await index.listPaginated({
        limit: 100,
        paginationToken,
      });

      for (const vector of listResult.vectors || []) {
        totalVectors++;

        const metadata = vector.metadata;
        if (!metadata) continue;

        // Extract industry
        if (metadata.industry) {
          industries.add(metadata.industry);
          industriesCounts.set(
            metadata.industry,
            (industriesCounts.get(metadata.industry) || 0) + 1
          );
        }

        // Extract company
        if (metadata.company_name) {
          companies.add(metadata.company_name);
          companiesCounts.set(
            metadata.company_name,
            (companiesCounts.get(metadata.company_name) || 0) + 1
          );
        }

        // Extract keywords
        if (metadata.keywords && Array.isArray(metadata.keywords)) {
          metadata.keywords.forEach((kw: string) => {
            keywords.add(kw);
            keywordsCounts.set(kw, (keywordsCounts.get(kw) || 0) + 1);
          });
        }

        // Extract year
        if (metadata.created_year) {
          years.push(metadata.created_year);
        }

        // Extract deck IDs
        if (metadata.deck_id) {
          deckIds.add(metadata.deck_id);
        }
      }

      paginationToken = listResult.pagination?.next;

      if (totalVectors % 100 === 0) {
        console.log(`  Processed ${totalVectors} vectors...`);
      }

    } while (paginationToken);

    console.log(`  ✅ Extracted ${totalVectors} vectors from ${namespace}`);

    return {
      industries,
      companies,
      keywords,
      years,
      deckIds,
      industriesCounts,
      companiesCounts,
      keywordsCounts,
    };
  }

  /**
   * Extract all metadata from all namespaces
   */
  async extractAll(): Promise<MetadataSummary> {
    console.log('🚀 Starting metadata extraction...');

    // Get index stats
    const index = this.pc.index(this.indexName);
    const stats = await index.describeIndexStats();

    console.log(`\n📈 Index: ${this.indexName}`);
    console.log(`   Total vectors: ${stats.totalRecordCount}`);
    console.log(`   Namespaces:`, Object.keys(stats.namespaces || {}));

    // Combine data from all namespaces
    const allIndustries = new Set<string>();
    const allCompanies = new Set<string>();
    const allKeywords = new Set<string>();
    const allYears: number[] = [];
    const allDeckIds = new Set<string>();

    const allIndustriesCounts = new Map<string, number>();
    const allCompaniesCounts = new Map<string, number>();
    const allKeywordsCounts = new Map<string, number>();

    // Extract from deck-summaries (most complete for industries/companies)
    if (stats.namespaces?.['deck-summaries']) {
      const deckData = await this.extractFromNamespace('deck-summaries');

      deckData.industries.forEach((i) => allIndustries.add(i));
      deckData.companies.forEach((c) => allCompanies.add(c));
      deckData.keywords.forEach((k) => allKeywords.add(k));
      allYears.push(...deckData.years);
      deckData.deckIds.forEach((d) => allDeckIds.add(d));

      // Merge counts
      deckData.industriesCounts.forEach((count, key) => {
        allIndustriesCounts.set(key, (allIndustriesCounts.get(key) || 0) + count);
      });
      deckData.companiesCounts.forEach((count, key) => {
        allCompaniesCounts.set(key, (allCompaniesCounts.get(key) || 0) + count);
      });
      deckData.keywordsCounts.forEach((count, key) => {
        allKeywordsCounts.set(key, (allKeywordsCounts.get(key) || 0) + count);
      });
    }

    // Extract from hybrid-chunks (most complete for keywords)
    if (stats.namespaces?.['hybrid-chunks']) {
      const hybridData = await this.extractFromNamespace('hybrid-chunks');

      hybridData.keywords.forEach((k) => allKeywords.add(k));

      // Only merge keyword counts from hybrid-chunks
      hybridData.keywordsCounts.forEach((count, key) => {
        allKeywordsCounts.set(key, (allKeywordsCounts.get(key) || 0) + count);
      });
    }

    // Sort by count (descending)
    const sortedIndustries = Array.from(allIndustries).sort();
    const sortedCompanies = Array.from(allCompanies).sort();
    const sortedKeywords = Array.from(allKeywords).sort();

    // Convert Maps to Objects and sort by count
    const industriesWithCounts = Object.fromEntries(
      Array.from(allIndustriesCounts.entries())
        .sort((a, b) => b[1] - a[1])
    );

    const companiesWithCounts = Object.fromEntries(
      Array.from(allCompaniesCounts.entries())
        .sort((a, b) => b[1] - a[1])
    );

    const keywordsWithCounts = Object.fromEntries(
      Array.from(allKeywordsCounts.entries())
        .sort((a, b) => b[1] - a[1])
    );

    // Calculate year range
    const minYear = allYears.length > 0 ? Math.min(...allYears) : 0;
    const maxYear = allYears.length > 0 ? Math.max(...allYears) : 0;

    console.log(`\n✅ Extraction complete!`);
    console.log(`   Industries: ${sortedIndustries.length}`);
    console.log(`   Companies: ${sortedCompanies.length}`);
    console.log(`   Keywords: ${sortedKeywords.length}`);
    console.log(`   Year range: ${minYear} - ${maxYear}`);

    return {
      indexName: this.indexName,
      extractedAt: new Date().toISOString(),
      totalDecks: allDeckIds.size,
      totalSlides: stats.totalRecordCount || 0,
      industries: sortedIndustries,
      companies: sortedCompanies,
      keywords: sortedKeywords,
      yearRange: {
        min: minYear,
        max: maxYear,
      },
      industriesWithCounts,
      companiesWithCounts,
      keywordsWithCounts,
    };
  }

  /**
   * Save metadata to JSON file
   */
  async saveToFile(metadata: MetadataSummary, outputPath: string): Promise<void> {
    await fs.writeFile(
      outputPath,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
    console.log(`\n💾 Saved to: ${outputPath}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    const extractor = new MetadataExtractor();

    // Extract all metadata
    const metadata = await extractor.extractAll();

    // Print summary
    console.log(`\n📋 METADATA SUMMARY:`);
    console.log(`\n🏢 Industries (${metadata.industries.length}):`);
    metadata.industries.slice(0, 10).forEach((industry) => {
      const count = metadata.industriesWithCounts[industry];
      console.log(`   - ${industry} (${count} decks)`);
    });
    if (metadata.industries.length > 10) {
      console.log(`   ... and ${metadata.industries.length - 10} more`);
    }

    console.log(`\n🏪 Companies (${metadata.companies.length}):`);
    metadata.companies.slice(0, 10).forEach((company) => {
      const count = metadata.companiesWithCounts[company];
      console.log(`   - ${company} (${count} decks)`);
    });
    if (metadata.companies.length > 10) {
      console.log(`   ... and ${metadata.companies.length - 10} more`);
    }

    console.log(`\n🏷️  Top 20 Keywords:`);
    Object.entries(metadata.keywordsWithCounts)
      .slice(0, 20)
      .forEach(([keyword, count]) => {
        console.log(`   - ${keyword} (${count} occurrences)`);
      });

    console.log(`\n📅 Year Range: ${metadata.yearRange.min} - ${metadata.yearRange.max}`);
    console.log(`\n📊 Total Decks: ${metadata.totalDecks}`);
    console.log(`📊 Total Slides: ${metadata.totalSlides}`);

    // Save to file
    const outputDir = path.resolve(process.cwd(), 'output');
    const outputPath = path.join(outputDir, 'deckbot-metadata.json');

    await extractor.saveToFile(metadata, outputPath);

    console.log(`\n✅ Done!`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run
main();
