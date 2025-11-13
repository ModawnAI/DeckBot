import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const INDEX_NAME = 'deckbot-presentations';

async function verifyEnrichedSlides() {
  console.log('🔍 Verifying enriched-slides namespace...\n');
  
  // Generate a test embedding
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: '헬스케어 SNS 운영',
    dimensions: 3072
  });
  
  const embedding = response.data[0].embedding;
  
  // Query enriched-slides namespace
  const index = pc.index(INDEX_NAME);
  const queryResponse = await index.namespace('enriched-slides').query({
    vector: embedding,
    topK: 3,
    includeMetadata: true
  });
  
  console.log(`✅ Found ${queryResponse.matches.length} results in enriched-slides\n`);
  
  if (queryResponse.matches.length > 0) {
    const first = queryResponse.matches[0];
    console.log('📊 Sample metadata structure:');
    console.log(JSON.stringify(first.metadata, null, 2));
    console.log('\n📋 Metadata fields:', Object.keys(first.metadata || {}).join(', '));
    
    // Check for redundant fields
    const meta = first.metadata as any;
    console.log('\n🔍 Checking for redundancy:');
    console.log('  - Has content_preview?', 'content_preview' in meta ? '❌ YES (redundant)' : '✅ NO');
    console.log('  - Has full_content?', 'full_content' in meta ? '❌ YES (redundant)' : '✅ NO');
    console.log('  - Has slide_summary?', 'slide_summary' in meta ? '✅ YES' : '❌ NO');
    console.log('  - Has slide_content?', 'slide_content' in meta ? '✅ YES' : '❌ NO');
    console.log('  - Has slide_layout?', 'slide_layout' in meta ? '✅ YES' : '❌ NO');
  }
}

verifyEnrichedSlides().catch(console.error);
