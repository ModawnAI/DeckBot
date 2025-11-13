/**
 * Export all metadata from Pinecone to JSON file
 * Saves companies, industries, keywords, and deck summaries
 */

import { Pinecone } from '@pinecone-database/pinecone';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  PINECONE_INDEX: 'deckbot-presentations',
  OUTPUT_FILE: './output/deckbot-metadata.json',
} as const;

interface PineconeMetadata {
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
  total_slides?: number;
}

interface CompanyInfo {
  name: string;
  industry: string;
  deck_count: number;
  latest_date: string;
  decks: DeckInfo[];
}

interface DeckInfo {
  filename: string;
  deck_id: string;
  industry: string;
  total_slides: number;
  created_date: string;
  pdf_url: string;
  preview: string;
  keywords: string[];
}

interface ExportedMetadata {
  exported_at: string;
  total_companies: number;
  total_industries: number;
  total_unique_keywords: number;
  companies: string[];
  industries: string[];
  keywords: string[];
}

class MetadataExporter {
  private pc: Pinecone;

  constructor() {
    this.pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }

  /**
   * Export all metadata to JSON file
   */
  async exportToJSON(): Promise<void> {
    console.log('\n📊 EXPORTING METADATA FROM PINECONE...\n');

    const index = this.pc.index<PineconeMetadata>(CONFIG.PINECONE_INDEX)
      .namespace('deck-summaries');

    // Query with dummy vector to get all records
    const dummyVector = new Array(3072).fill(0);

    console.log('  → Fetching all deck summaries...');
    const results = await index.query({
      vector: dummyVector,
      topK: 10000,
      includeMetadata: true,
    });

    console.log(`  ✓ Retrieved ${results.matches.length} decks\n`);

    // Process data
    const companiesMap = new Map<string, CompanyInfo>();
    const industriesMap = new Map<string, Set<string>>();
    const keywordsMap = new Map<string, { count: number; companies: Set<string> }>();
    const allDecks: DeckInfo[] = [];

    results.matches.forEach(match => {
      const meta = match.metadata!;
      const company = meta.company_name;
      const industry = meta.industry;
      const keywords = meta.keywords || [];

      // Build deck info
      const deckInfo: DeckInfo = {
        filename: meta.filename,
        deck_id: meta.deck_id,
        industry: meta.industry,
        total_slides: meta.total_slides || 0,
        created_date: meta.created_date,
        pdf_url: meta.pdf_url,
        preview: meta.content_preview,
        keywords: keywords,
      };

      allDecks.push(deckInfo);

      // Track companies
      if (company) {
        if (!companiesMap.has(company)) {
          companiesMap.set(company, {
            name: company,
            industry: industry,
            deck_count: 0,
            latest_date: meta.created_date,
            decks: [],
          });
        }

        const companyInfo = companiesMap.get(company)!;
        companyInfo.deck_count++;
        companyInfo.decks.push(deckInfo);

        // Update latest date
        if (meta.created_date > companyInfo.latest_date) {
          companyInfo.latest_date = meta.created_date;
        }
      }

      // Track industries
      if (industry) {
        if (!industriesMap.has(industry)) {
          industriesMap.set(industry, new Set());
        }
        if (company) {
          industriesMap.get(industry)!.add(company);
        }
      }

      // Track keywords
      keywords.forEach(keyword => {
        if (!keywordsMap.has(keyword)) {
          keywordsMap.set(keyword, { count: 0, companies: new Set() });
        }
        const keywordInfo = keywordsMap.get(keyword)!;
        keywordInfo.count++;
        if (company) {
          keywordInfo.companies.add(company);
        }
      });
    });

    // Build simple export object
    const exportData: ExportedMetadata = {
      exported_at: new Date().toISOString(),
      total_companies: companiesMap.size,
      total_industries: industriesMap.size,
      total_unique_keywords: keywordsMap.size,
      companies: Array.from(companiesMap.keys()).sort(),
      industries: Array.from(industriesMap.keys()).sort(),
      keywords: Array.from(keywordsMap.keys()).sort(),
    };

    // Write to file
    console.log('  → Writing to file...');
    await fs.writeFile(
      CONFIG.OUTPUT_FILE,
      JSON.stringify(exportData, null, 2),
      'utf-8'
    );

    console.log(`  ✓ Exported to: ${CONFIG.OUTPUT_FILE}\n`);

    // Display summary
    console.log('📋 EXPORT SUMMARY:\n');
    console.log(`  Total Companies:   ${exportData.total_companies}`);
    console.log(`  Total Industries:  ${exportData.total_industries}`);
    console.log(`  Unique Keywords:   ${exportData.total_unique_keywords}`);
    console.log('');
    console.log('📊 COMPANIES (A-Z):\n');
    exportData.companies.slice(0, 10).forEach((company, idx) => {
      console.log(`  ${idx + 1}. ${company}`);
    });
    if (exportData.companies.length > 10) {
      console.log(`  ... and ${exportData.companies.length - 10} more`);
    }
    console.log('');
    console.log('🏭 INDUSTRIES (A-Z):\n');
    exportData.industries.forEach((industry, idx) => {
      console.log(`  ${idx + 1}. ${industry}`);
    });
    console.log('');
    console.log('🏷️  KEYWORDS (showing first 10):\n');
    exportData.keywords.slice(0, 10).forEach((keyword, idx) => {
      console.log(`  ${idx + 1}. ${keyword}`);
    });
    if (exportData.keywords.length > 10) {
      console.log(`  ... and ${exportData.keywords.length - 10} more`);
    }
    console.log('');
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  try {
    const exporter = new MetadataExporter();
    await exporter.exportToJSON();
    console.log('✅ Export complete!\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}

export { MetadataExporter };
