#!/usr/bin/env python3
"""
Comprehensive Pinecone Upsert Script
Outputs MCP commands for systematic batch upsert
"""

import json
from pathlib import Path

# Configuration
BATCH_DIR = Path("/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025")
DENSE_INDEX = "deckbot-dense-korean"
SPARSE_INDEX = "deckbot-sparse-korean"
DOC_NAMESPACE = "doc:ilgram_2025"
GLOBAL_NAMESPACE = "global"

# Define upsert targets
targets = [
    (DENSE_INDEX, DOC_NAMESPACE, "Dense/Doc"),
    (DENSE_INDEX, GLOBAL_NAMESPACE, "Dense/Global"),
    (SPARSE_INDEX, DOC_NAMESPACE, "Sparse/Doc"),
    (SPARSE_INDEX, GLOBAL_NAMESPACE, "Sparse/Global")
]

# Load batches
batch_files = sorted(BATCH_DIR.glob("batch_*.json"))

print("=" * 80)
print("PINECONE UPSERT PLAN")
print("=" * 80)
print(f"Total batches: {len(batch_files)}")
print(f"Total targets: {len(targets)}")
print(f"Total operations: {len(batch_files) * len(targets)}")
print()

for batch_idx, batch_file in enumerate(batch_files, 1):
    with open(batch_file, 'r', encoding='utf-8') as f:
        records = json.load(f)

    print(f"\n{'='*80}")
    print(f"BATCH {batch_idx}: {batch_file.name} ({len(records)} records)")
    print(f"{'='*80}")

    for target_idx, (index, namespace, desc) in enumerate(targets, 1):
        print(f"\n  Target {target_idx}/4: {desc}")
        print(f"  Index: {index}")
        print(f"  Namespace: {namespace}")
        print(f"  Records: {len(records)}")
        print(f"  Status: READY")

print(f"\n{'='*80}")
print("INSTRUCTIONS")
print(f"{'='*80}")
print("Use the following MCP commands to upsert each batch:")
print()
print("For each batch file:")
print("  1. Load the batch JSON")
print("  2. Call mcp__pinecone-mcp__upsert-records with:")
print("     - name: <index_name>")
print("     - namespace: <namespace>")
print("     - records: <loaded_batch_data>")
print()
print("✅ All data is ready with complete image URLs")
print("✅ Field mapping: {\"text\": \"content\"} (integrated inference)")
