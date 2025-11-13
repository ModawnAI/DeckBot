#!/usr/bin/env node

import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MetadataExtractor } from './metadata-extractor.js';
import type { ProcessingConfig } from './types.js';

// Load environment variables
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Process a single PDF file
 */
async function main() {
  const pdfFilename = process.argv[2];

  if (!pdfFilename) {
    console.error('❌ Error: Please provide PDF filename');
    console.error('Usage: npm run process:single "<filename>"');
    console.error('\nExample:');
    console.error('  npm run process:single "(ilgram) 2025 더리틀스 온라인 광고 운영 제안서.pdf"');
    process.exit(1);
  }

  console.log('🤖 DeckBot - Single PDF Processor\n');

  // Validate API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY not found');
    process.exit(1);
  }

  // Get Blob token
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.replace(/"/g, '');

  // Configuration
  const projectRoot = path.resolve(__dirname, '..');
  const config: ProcessingConfig = {
    pdfDirectory: path.join(projectRoot, 'pdf'),
    outputDirectory: path.join(projectRoot, 'output'),
    imageDirectory: path.join(projectRoot, 'images'),
    geminiApiKey: apiKey,
    blobToken: blobToken,
    maxConcurrentRequests: 15 // Optimized for Gemini 900 RPM limit (5x speedup)
  };

  const pdfPath = path.join(config.pdfDirectory, pdfFilename);

  console.log('📁 Configuration:');
  console.log(`   PDF File: ${pdfFilename}`);
  console.log(`   Output Directory: ${config.outputDirectory}`);
  console.log(`   Vercel Blob: ${blobToken ? 'Enabled ☁️' : 'Disabled'}\n`);

  // Initialize extractor
  const extractor = new MetadataExtractor(config);

  try {
    console.log('='.repeat(80));
    console.log(`Processing: ${pdfFilename}`);
    console.log('='.repeat(80));

    // Extract metadata
    const pitchDeckData = await extractor.processPDF(pdfPath);

    // Validate data
    console.log('\n🔍 Validating extracted data...');
    const validation = extractor.validateData(pitchDeckData);

    if (!validation.valid) {
      console.log('⚠️  Validation warnings:');
      validation.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
    } else {
      console.log('✅ Validation passed');
    }

    // Generate stats
    const stats = extractor.generateStats(pitchDeckData);
    console.log('\n📊 Statistics:');
    console.log(`   Total Slides: ${stats.total_slides}`);
    console.log(`   Industry: ${stats.deck_industry}`);
    console.log(`   Company: ${stats.company_name}`);
    console.log(`   Avg Keywords/Slide: ${stats.avg_keywords_per_slide}`);
    console.log(`   Unique Keywords: ${stats.unique_keywords}`);

    // Save to JSON
    console.log('\n💾 Saving JSON output...');
    const outputPath = await extractor.savePitchDeckData(pitchDeckData, pdfFilename);
    console.log(`✅ Saved to: ${path.relative(projectRoot, outputPath)}`);

    console.log('\n' + '='.repeat(80));
    console.log('🎉 Processing complete!');
    console.log('='.repeat(80));
    console.log(`\nOutput: ${outputPath}\n`);

  } catch (error) {
    console.error(`\n❌ Error processing ${pdfFilename}:`, error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
