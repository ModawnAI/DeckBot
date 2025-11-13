/**
 * Get Metadata from Pinecone Index
 * Retrieve unique companies, industries, and other metadata
 */

import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  PINECONE_INDEX: 'deckbot-presentations',
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

class MetadataExtractor {
  private pc: Pinecone;

  constructor() {
    this.pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }

  /**
   * Get all unique companies from deck-summaries namespace
   */
  async getAllCompanies(): Promise<void> {
    console.log('\n📊 FETCHING ALL COMPANIES...\n');

    const index = this.pc.index<PineconeMetadata>(CONFIG.PINECONE_INDEX)
      .namespace('deck-summaries');

    // Query with a zero vector to get all records (or use list)
    const dummyVector = new Array(3072).fill(0);

    const results = await index.query({
      vector: dummyVector,
      topK: 10000, // Get all decks
      includeMetadata: true,
    });

    // Extract unique companies
    const companies = new Map<string, { industry: string; count: number; latest_date: string }>();

    results.matches.forEach(match => {
      const company = match.metadata?.company_name;
      const industry = match.metadata?.industry;
      const date = match.metadata?.created_date;

      if (company) {
        if (companies.has(company)) {
          const existing = companies.get(company)!;
          existing.count++;
          if (date && date > existing.latest_date) {
            existing.latest_date = date;
          }
        } else {
          companies.set(company, {
            industry: industry || 'Unknown',
            count: 1,
            latest_date: date || '',
          });
        }
      }
    });

    // Display results sorted by count
    console.log(`✅ Found ${companies.size} unique companies:\n`);

    const sorted = Array.from(companies.entries())
      .sort((a, b) => b[1].count - a[1].count);

    sorted.forEach(([company, info]) => {
      const date = info.latest_date ? new Date(info.latest_date).toLocaleDateString() : 'N/A';
      console.log(`  • ${company.padEnd(30)} | ${info.industry.padEnd(15)} | ${info.count} deck(s) | Latest: ${date}`);
    });
  }

  /**
   * Get all unique industries
   */
  async getAllIndustries(): Promise<void> {
    console.log('\n📊 FETCHING ALL INDUSTRIES...\n');

    const index = this.pc.index<PineconeMetadata>(CONFIG.PINECONE_INDEX)
      .namespace('deck-summaries');

    const dummyVector = new Array(3072).fill(0);

    const results = await index.query({
      vector: dummyVector,
      topK: 10000,
      includeMetadata: true,
    });

    const industries = new Map<string, number>();

    results.matches.forEach(match => {
      const industry = match.metadata?.industry;
      if (industry) {
        industries.set(industry, (industries.get(industry) || 0) + 1);
      }
    });

    console.log(`✅ Found ${industries.size} unique industries:\n`);

    const sorted = Array.from(industries.entries())
      .sort((a, b) => b[1] - a[1]);

    sorted.forEach(([industry, count]) => {
      console.log(`  • ${industry.padEnd(20)} | ${count} deck(s)`);
    });
  }

  /**
   * Get detailed info for a specific company
   */
  async getCompanyDetails(companyName: string): Promise<void> {
    console.log(`\n📊 COMPANY DETAILS: ${companyName}\n`);

    const index = this.pc.index<PineconeMetadata>(CONFIG.PINECONE_INDEX)
      .namespace('deck-summaries');

    const dummyVector = new Array(3072).fill(0);

    const results = await index.query({
      vector: dummyVector,
      topK: 10000,
      includeMetadata: true,
      filter: {
        company_name: { $eq: companyName }
      }
    });

    console.log(`✅ Found ${results.matches.length} deck(s) for ${companyName}:\n`);

    results.matches.forEach((match, idx) => {
      const meta = match.metadata;
      console.log(`  ${idx + 1}. ${meta?.filename}`);
      console.log(`     Industry: ${meta?.industry}`);
      console.log(`     Total Slides: ${meta?.total_slides}`);
      console.log(`     Created: ${meta?.created_date ? new Date(meta.created_date).toLocaleDateString() : 'N/A'}`);
      console.log(`     PDF: ${meta?.pdf_url}`);
      console.log(`     Preview: ${meta?.content_preview?.substring(0, 100)}...`);
      console.log('');
    });
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<void> {
    console.log('\n📈 INDEX STATISTICS:\n');

    const index = this.pc.index(CONFIG.PINECONE_INDEX);
    const stats = await index.describeIndexStats();

    console.log(`  Total vectors: ${stats.totalRecordCount}`);
    console.log(`  Dimension: ${stats.dimension}`);
    console.log(`  Index fullness: ${((stats.indexFullness || 0) * 100).toFixed(2)}%`);
    console.log(`\n  Namespaces:`);

    if (stats.namespaces) {
      for (const [ns, data] of Object.entries(stats.namespaces)) {
        console.log(`    ${ns.padEnd(20)}: ${data.recordCount} vectors`);
      }
    }
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
📋 USAGE:

  npm run metadata -- companies         # List all companies
  npm run metadata -- industries        # List all industries
  npm run metadata -- company <name>    # Get details for specific company
  npm run metadata -- stats             # Show index statistics

EXAMPLES:

  npm run metadata -- companies
  npm run metadata -- company "배달의민족"
  npm run metadata -- industries
    `);
    process.exit(1);
  }

  try {
    const extractor = new MetadataExtractor();

    switch (command) {
      case 'companies':
        await extractor.getAllCompanies();
        break;

      case 'industries':
        await extractor.getAllIndustries();
        break;

      case 'company':
        const companyName = args.slice(1).join(' ');
        if (!companyName) {
          console.error('❌ Please provide a company name');
          process.exit(1);
        }
        await extractor.getCompanyDetails(companyName);
        break;

      case 'stats':
        await extractor.getStats();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
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

export { MetadataExtractor };
