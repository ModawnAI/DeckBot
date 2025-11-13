#!/usr/bin/env node

import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPDFFiles } from './pdf-processor.js';
import { MetadataExtractor } from './metadata-extractor.js';
import type { ProcessingConfig } from './types.js';

// Load environment variables
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main processing function
 */
async function main() {
  console.log('🤖 DeckBot - PDF Pitch Deck Metadata Extractor\n');

  // Validate API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY not found in environment variables');
    console.error('   Please create a .env file with your Gemini API key:');
    console.error('   GEMINI_API_KEY=your_api_key_here\n');
    process.exit(1);
  }

  // Get Blob token (optional)
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.replace(/"/g, ''); // Remove quotes if present

  // Configuration
  const projectRoot = path.resolve(__dirname, '..');
  const config: ProcessingConfig = {
    pdfDirectory: path.join(projectRoot, 'pdf'),
    outputDirectory: path.join(projectRoot, 'output'),
    imageDirectory: path.join(projectRoot, 'images'),
    geminiApiKey: apiKey,
    blobToken: blobToken, // Optional: Enables Vercel Blob uploads
    maxConcurrentRequests: 15 // Optimized for Gemini 900 RPM limit (5x speedup)
  };

  console.log('📁 Configuration:');
  console.log(`   PDF Directory: ${config.pdfDirectory}`);
  console.log(`   Output Directory: ${config.outputDirectory}`);
  console.log(`   Image Directory: ${config.imageDirectory}`);
  if (blobToken) {
    console.log(`   ☁️  Vercel Blob: Enabled`);
  } else {
    console.log(`   📂 Vercel Blob: Disabled (local paths only)`);
  }
  console.log('');

  // Get PDF files
  console.log('🔍 Scanning for PDF files...');
  const pdfFiles = await getPDFFiles(config.pdfDirectory);

  if (pdfFiles.length === 0) {
    console.log('   No PDF files found in the pdf/ directory');
    console.log('   Please add PDF files to process\n');
    process.exit(0);
  }

  console.log(`   Found ${pdfFiles.length} PDF file(s):\n`);
  pdfFiles.forEach((file, i) => {
    console.log(`   ${i + 1}. ${path.basename(file)}`);
  });
  console.log('');

  // Initialize extractor
  const extractor = new MetadataExtractor(config);

  // Process each PDF
  const results: Array<{
    filename: string;
    success: boolean;
    outputPath?: string;
    error?: string;
    stats?: any;
  }> = [];

  for (let i = 0; i < pdfFiles.length; i++) {
    const pdfPath = pdfFiles[i];
    const filename = path.basename(pdfPath);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Processing ${i + 1}/${pdfFiles.length}: ${filename}`);
    console.log('='.repeat(80));

    try {
      // Extract metadata
      const pitchDeckData = await extractor.processPDF(pdfPath);

      // Validate data
      console.log('\n  🔍 Validating extracted data...');
      const validation = extractor.validateData(pitchDeckData);

      if (!validation.valid) {
        console.log('  ⚠️  Validation warnings:');
        validation.errors.forEach(error => {
          console.log(`     - ${error}`);
        });
      } else {
        console.log('  ✅ Validation passed');
      }

      // Generate stats
      const stats = extractor.generateStats(pitchDeckData);
      console.log('\n  📊 Statistics:');
      console.log(`     Total Slides: ${stats.total_slides}`);
      console.log(`     Industry: ${stats.deck_industry}`);
      console.log(`     Company: ${stats.company_name}`);
      console.log(`     Avg Keywords/Slide: ${stats.avg_keywords_per_slide}`);
      console.log(`     Unique Keywords: ${stats.unique_keywords}`);

      console.log('\n     Slide Layout Distribution:');
      Object.entries(stats.slide_layout_distribution).forEach(([layout, count]) => {
        console.log(`       - ${layout}: ${count}`);
      });

      console.log('\n     Top Keywords:');
      stats.top_keywords.slice(0, 5).forEach(({ keyword, count }: any) => {
        console.log(`       - ${keyword}: ${count}x`);
      });

      // Save to JSON
      console.log('\n  💾 Saving JSON output...');
      const outputPath = await extractor.savePitchDeckData(pitchDeckData, filename);
      console.log(`  ✅ Saved to: ${path.relative(projectRoot, outputPath)}`);

      results.push({
        filename,
        success: true,
        outputPath,
        stats
      });
    } catch (error) {
      console.error(`\n  ❌ Error processing ${filename}:`, error);
      results.push({
        filename,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📈 PROCESSING SUMMARY');
  console.log('='.repeat(80));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Successfully processed: ${successful}/${pdfFiles.length}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}/${pdfFiles.length}`);
    console.log('\nFailed files:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.filename}: ${r.error}`);
      });
  }

  if (successful > 0) {
    console.log('\n📁 Output files:');
    results
      .filter(r => r.success && r.outputPath)
      .forEach(r => {
        console.log(`  - ${path.relative(projectRoot, r.outputPath!)}`);
      });
  }

  console.log('\n🎉 Processing complete!\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
