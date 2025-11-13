#!/usr/bin/env python3
"""
Prepare data for MCP upsert operations
Outputs compact JSON for each chunk for direct MCP consumption
"""

import json
from pathlib import Path

CHUNKS_DIR = Path("/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025/chunks")
OUTPUT_FILE = Path("/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025/upsert_manifest.json")

# Get all chunks
chunk_files = sorted(CHUNKS_DIR.glob("*.json"))

# Create manifest
manifest = {
    "chunks": [],
    "targets": [
        {"index": "deckbot-dense-korean", "namespace": "doc:ilgram_2025"},
        {"index": "deckbot-dense-korean", "namespace": "global"},
        {"index": "deckbot-sparse-korean", "namespace": "doc:ilgram_2025"},
        {"index": "deckbot-sparse-korean", "namespace": "global"}
    ],
    "total_operations": len(chunk_files) * 4
}

for chunk_file in chunk_files:
    with open(chunk_file, 'r', encoding='utf-8') as f:
        records = json.load(f)

    manifest["chunks"].append({
        "file": str(chunk_file),
        "name": chunk_file.name,
        "record_count": len(records)
    })

# Save manifest
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f"✅ Manifest created: {OUTPUT_FILE}")
print(f"📊 Total chunks: {len(manifest['chunks'])}")
print(f"📊 Total operations: {manifest['total_operations']}")

# Also print a summary
print(f"\n{'='*80}")
print("UPSERT SUMMARY")
print(f"{'='*80}")
for idx, chunk in enumerate(manifest["chunks"], 1):
    print(f"{idx}. {chunk['name']}: {chunk['record_count']} records")
