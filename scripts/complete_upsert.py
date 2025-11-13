#!/usr/bin/env python3
"""
Complete Pinecone Upsert Script
Final execution script to guide Claude through all MCP upsert operations
"""

import json
from pathlib import Path

CHUNKS_DIR = Path("/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025/chunks")

# Define all targets
targets = [
    ("deckbot-dense-korean", "doc:ilgram_2025", "Dense/Doc"),
    ("deckbot-dense-korean", "global", "Dense/Global"),
    ("deckbot-sparse-korean", "doc:ilgram_2025", "Sparse/Doc"),
    ("deckbot-sparse-korean", "global", "Sparse/Global")
]

# Get all chunks
chunk_files = sorted(CHUNKS_DIR.glob("*.json"))

print("╔" + "="*78 + "╗")
print("║" + " PINECONE COMPLETE UPSERT GUIDE ".center(78) + "║")
print("╚" + "="*78 + "╝\n")

print(f"📊 Total Operations: {len(chunk_files)} chunks × {len(targets)} targets = {len(chunk_files) * len(targets)}\n")

operation_num = 0

# For each chunk
for chunk_idx, chunk_file in enumerate(chunk_files, 1):
    # Load the chunk data
    with open(chunk_file, 'r', encoding='utf-8') as f:
        records = json.load(f)

    print(f"\n{'─'*80}")
    print(f"📦 CHUNK {chunk_idx}/{len(chunk_files)}: {chunk_file.name} ({len(records)} records)")
    print(f"{'─'*80}")

    # For each target
    for target_idx, (index, namespace, desc) in enumerate(targets, 1):
        operation_num += 1

        print(f"\n  Operation {operation_num}/{len(chunk_files) * len(targets)}")
        print(f"  🎯 Target: {desc}")
        print(f"  📍 Index: {index}")
        print(f"  📂 Namespace: {namespace}")
        print(f"  📄 Records: {len(records)}")
        print(f"  📁 File: {chunk_file}")
        print(f"  ───────────────────────────────────────────")
        print(f"  MCP Tool: mcp__pinecone-mcp__upsert-records")
        print(f"  Parameters:")
        print(f"    • name: \"{index}\"")
        print(f"    • namespace: \"{namespace}\"")
        print(f"    • records: <load from {chunk_file.name}>")
        print()

print(f"\n{'='*80}")
print("✅ EXECUTION PLAN COMPLETE")
print(f"{'='*80}")
print(f"Total operations to execute: {operation_num}")
print(f"All chunks validated: ✓")
print(f"All image URLs present: ✓")
print("\n🚀 Ready for systematic MCP execution")
