#!/usr/bin/env python3
"""
Split large batches into smaller chunks for MCP upsert
"""

import json
from pathlib import Path

BATCH_DIR = Path("/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025")
OUTPUT_DIR = Path("/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025/chunks")
CHUNK_SIZE = 20  # Records per chunk

OUTPUT_DIR.mkdir(exist_ok=True)

batch_files = sorted(BATCH_DIR.glob("batch_*.json"))

for batch_file in batch_files:
    with open(batch_file, 'r', encoding='utf-8') as f:
        records = json.load(f)

    batch_name = batch_file.stem  # e.g., "batch_001"
    total_records = len(records)
    num_chunks = (total_records + CHUNK_SIZE - 1) // CHUNK_SIZE

    print(f"\n{batch_file.name}: {total_records} records → {num_chunks} chunks")

    for chunk_idx in range(num_chunks):
        start_idx = chunk_idx * CHUNK_SIZE
        end_idx = min(start_idx + CHUNK_SIZE, total_records)
        chunk_records = records[start_idx:end_idx]

        chunk_file = OUTPUT_DIR / f"{batch_name}_chunk_{chunk_idx+1:02d}.json"
        with open(chunk_file, 'w', encoding='utf-8') as f:
            json.dump(chunk_records, f, ensure_ascii=False, indent=2)

        print(f"  ✓ {chunk_file.name}: {len(chunk_records)} records")

print(f"\n✅ All chunks created in: {OUTPUT_DIR}")
print(f"📊 Total chunk files: {len(list(OUTPUT_DIR.glob('*.json')))}")
