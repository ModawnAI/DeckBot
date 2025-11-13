#!/usr/bin/env node

/**
 * Integrated PDF Processing and Pinecone Ingestion
 *
 * This script:
 * 1. Processes a PDF using Gemini to extract metadata
 * 2. Automatically ingests the resulting JSON into Pinecone
 */

import { config as loadEnv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MetadataExtractor } from './metadata-extractor.js';
import type { ProcessingConfig } from './types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const pdfFilename = process.argv[2];

  if (!pdfFilename) {
    console.error('❌ Error: Please provide PDF filename');
    console.error('Usage: npm run process-ingest "<filename>"');
    console.error('\nExample:');
    console.error('  npm run process-ingest "(ilgram) LG전자 키친솔루션 디지털 바이럴 전략 제안서.pdf"');
    process.exit(1);
  }

  console.log('🤖 DeckBot - PDF to Pinecone Pipeline\n');

  // ========================================================================
  // STEP 1: PROCESS PDF WITH GEMINI
  // ========================================================================

  console.log('📄 STEP 1/2: Processing PDF with Gemini...\n');

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

  // Create extractor instance
  const extractor = new MetadataExtractor(config);

  // Get full PDF path
  const pdfPath = path.join(config.pdfDirectory, pdfFilename);

  try {
    // Process the PDF
    const result = await extractor.processSinglePDF(pdfPath);

    console.log('\n✅ PDF Processing Complete!');
    console.log(`   Output: ${result.outputPath}`);
    console.log(`   Slides: ${result.totalPages}`);
    console.log(`   Industry: ${result.metadata.deck_metadata.deck_industry}`);
    console.log(`   Company: ${result.metadata.deck_metadata.company_name}`);

    // ========================================================================
    // STEP 2: INGEST INTO PINECONE
    // ========================================================================

    console.log('\n📤 STEP 2/2: Ingesting into Pinecone...\n');

    // Verify Pinecone API key
    if (!process.env.PINECONE_API_KEY) {
      console.error('❌ Error: PINECONE_API_KEY not found');
      console.error('Skipping Pinecone ingestion.');
      process.exit(1);
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Error: OPENAI_API_KEY not found');
      console.error('Skipping Pinecone ingestion.');
      process.exit(1);
    }

    // Run ingestion using the JSON file that was just created
    const jsonFilename = path.basename(result.outputPath);

    console.log(`   Running: npm run ingest`);
    console.log(`   This will ingest: ${jsonFilename}\n`);

    // Execute ingestion
    const { stdout, stderr } = await execAsync('npm run ingest', {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    console.log(stdout);
    if (stderr && !stderr.includes('DeprecationWarning')) {
      console.error(stderr);
    }

    console.log('\n✅ PIPELINE COMPLETE!');
    console.log('   Your deck is now searchable in Pinecone.');
    console.log('\n📊 Try these commands:');
    console.log(`   npm run stats                    # View index statistics`);
    console.log(`   npm run query -- "your query"    # Search decks`);
    console.log(`   npm run search -- "your query"   # Search slides`);

  } catch (error) {
    console.error('\n❌ Pipeline Error:', error);
    process.exit(1);
  }
}

// Run
main();
