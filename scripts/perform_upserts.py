#!/usr/bin/env python3
"""
Execute Pinecone upserts via MCP tool
This script generates the necessary data for Claude to perform upserts
"""

import json
from pathlib import Path
import sys

BATCH_DIR = Path("/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025")
DENSE_INDEX = "deckbot-dense-korean"
SPARSE_INDEX = "deckbot-sparse-korean"
DOC_NAMESPACE = "doc:ilgram_2025"
GLOBAL_NAMESPACE = "global"

# Define targets
targets = [
    (DENSE_INDEX, DOC_NAMESPACE),
    (DENSE_INDEX, GLOBAL_NAMESPACE),
    (SPARSE_INDEX, DOC_NAMESPACE),
    (SPARSE_INDEX, GLOBAL_NAMESPACE)
]

# Get batch files
batch_files = sorted(BATCH_DIR.glob("batch_*.json"))

def main():
    if len(sys.argv) > 1:
        # Output specific batch for MCP consumption
        batch_num = int(sys.argv[1])
        batch_file = batch_files[batch_num - 1]
        with open(batch_file, 'r', encoding='utf-8') as f:
            records = json.load(f)
        # Print compact JSON
        print(json.dumps(records, ensure_ascii=False))
    else:
        # Show summary
        print(f"Total batches: {len(batch_files)}")
        print(f"Total targets per batch: {len(targets)}")
        print(f"Total operations: {len(batch_files) * len(targets)}")
        print()
        for idx, bf in enumerate(batch_files, 1):
            with open(bf, 'r', encoding='utf-8') as f:
                records = json.load(f)
            print(f"Batch {idx}: {bf.name} - {len(records)} records")

if __name__ == "__main__":
    main()
