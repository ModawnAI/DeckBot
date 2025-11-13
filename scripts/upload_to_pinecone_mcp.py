#!/usr/bin/env python3
"""
Upload prepared batches to Pinecone indexes using MCP format.
Transforms records from 'id' to '_id' format as per Pinecone MCP requirements.
"""

import json
import os
from pathlib import Path

def load_batch(batch_path):
    """Load a prepared batch file"""
    with open(batch_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def transform_record(record):
    """
    Transform record from {id, content, ...} to {_id, content, ...}
    per Pinecone MCP requirements.
    """
    transformed = record.copy()
    # Rename 'id' to '_id' if it exists
    if 'id' in transformed:
        transformed['_id'] = transformed.pop('id')
    return transformed

def split_into_upload_batches(records, batch_size=10):
    """Split records into smaller batches for upload"""
    batches = []
    for i in range(0, len(records), batch_size):
        batches.append(records[i:i + batch_size])
    return batches

def main():
    # Paths
    batches_dir = Path("/Users/kjyoo/DeckBot/output/prepared_batches")
    output_dir = Path("/Users/kjyoo/DeckBot/output/pinecone_upload_ready")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Find all prepared batch files
    batch_files = sorted(batches_dir.glob("prepared_batch_*.json"))

    if not batch_files:
        print(f"No batch files found in {batches_dir}")
        return

    print(f"Found {len(batch_files)} batch files")

    # Load and transform all records
    all_records = []
    for batch_file in batch_files:
        print(f"Loading {batch_file.name}...")
        records = load_batch(batch_file)
        transformed = [transform_record(r) for r in records]
        all_records.extend(transformed)

    print(f"\nTotal records loaded: {len(all_records)}")

    # Split into smaller upload batches (10 records each for MCP)
    upload_batches = split_into_upload_batches(all_records, batch_size=10)
    print(f"Created {len(upload_batches)} upload batches of ~10 records each")

    # Save upload batches
    for idx, batch in enumerate(upload_batches, 1):
        output_file = output_dir / f"upload_batch_{idx:02d}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(batch, f, ensure_ascii=False, indent=2)
        print(f"Saved {output_file.name} with {len(batch)} records")

    print(f"\n✅ All upload batches saved to: {output_dir}")
    print(f"\nNext steps:")
    print(f"1. Upload to deckbot-sparse-korean index (namespace: deckbot-docs)")
    print(f"2. Upload to deckbot-dense-korean index (namespace: deckbot-docs)")
    print(f"3. Use Pinecone MCP upsert-records tool with each batch")

if __name__ == "__main__":
    main()
