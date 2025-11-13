import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const INDEX_NAME = 'deckbot-presentations';

async function clearNamespace(namespace: string) {
  console.log(`🗑️  Clearing namespace: ${namespace}`);
  
  const index = pc.index(INDEX_NAME);
  
  // Delete all vectors in the namespace
  await index.namespace(namespace).deleteAll();
  
  console.log(`✅ Cleared all vectors from namespace: ${namespace}`);
}

const namespace = process.argv[2];

if (!namespace) {
  console.error('Usage: tsx scripts/clear-namespace.ts <namespace>');
  process.exit(1);
}

clearNamespace(namespace).catch(console.error);
