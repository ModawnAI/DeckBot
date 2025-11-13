#!/usr/bin/env python3
"""
Upsert DeckBot records to Pinecone using MCP-compatible format

This script reads the validated Pinecone JSON and prepares batches
for manual upsert using the Pinecone MCP tool.
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any


def sanitize_pdf_id(filename: str) -> str:
    """Create a clean ASCII-only PDF ID from filename"""
    # Remove extension
    base = Path(filename).stem
    # Remove parentheses, brackets, and all non-ASCII chars
    clean = base.replace('(', '').replace(')', '').replace('[', '').replace(']', '')
    # Keep only ASCII alphanumeric and underscore
    clean = ''.join(c if c.isascii() and (c.isalnum() or c in '_- ') else '_' for c in clean)
    # Replace spaces and hyphens with underscores
    clean = clean.replace(' ', '_').replace('-', '_')
    # Remove consecutive underscores
    while '__' in clean:
        clean = clean.replace('__', '_')
    # Remove leading/trailing underscores
    return clean.strip('_').lower()


def prepare_records(input_file: Path) -> tuple[List[Dict], str, str]:
    """Load and prepare records for Pinecone upsert"""

    with open(input_file, 'r', encoding='utf-8') as f:
        records = json.load(f)

    if not records:
        raise ValueError("No records found in input file")

    # Extract metadata from first record
    first_record = records[0]
    original_pdf_id = first_record.get('pdf_id', '')
    company = first_record.get('company', '')

    # Create sanitized PDF ID for namespace
    clean_pdf_id = sanitize_pdf_id(original_pdf_id)

    # Update all records with clean PDF ID
    for record in records:
        # Update PDF ID
        old_id = record['_id']
        record['_id'] = old_id.replace(original_pdf_id, clean_pdf_id)
        record['pdf_id'] = clean_pdf_id

        # Ensure all required fields are present
        if 'content' not in record or not record['content']:
            raise ValueError(f"Record {record['_id']} missing content field")

    return records, clean_pdf_id, company


def create_batches(records: List[Dict], batch_size: int = 10) -> List[List[Dict]]:
    """Split records into batches"""
    batches = []
    for i in range(0, len(records), batch_size):
        batches.append(records[i:i + batch_size])
    return batches


def save_batch_files(batches: List[List[Dict]], pdf_id: str, output_dir: Path):
    """Save batches as separate JSON files"""
    output_dir.mkdir(exist_ok=True)

    batch_files = []
    for idx, batch in enumerate(batches, 1):
        batch_file = output_dir / f"{pdf_id}_batch_{idx}.json"
        with open(batch_file, 'w', encoding='utf-8') as f:
            json.dump(batch, f, ensure_ascii=False, indent=2)
        batch_files.append(batch_file)
        print(f"   Batch {idx}: {len(batch)} records → {batch_file.name}")

    return batch_files


def generate_upsert_commands(pdf_id: str, num_batches: int, company: str):
    """Generate MCP upsert commands"""

    doc_namespace = f"doc:{pdf_id}"
    global_namespace = "global"

    print("\n" + "="*80)
    print("PINECONE UPSERT COMMANDS")
    print("="*80)

    print(f"\n📋 Document: {pdf_id}")
    print(f"   Company: {company}")
    print(f"   Total batches: {num_batches}")

    print(f"\n🎯 STEP 1: Upsert to DENSE index (document namespace)")
    print(f"   Index: deckbot-dense-korean")
    print(f"   Namespace: {doc_namespace}")
    print("\n   Use Pinecone MCP tool:")
    for i in range(1, num_batches + 1):
        print(f"   - Batch {i}: upsert batch_{i}.json to namespace '{doc_namespace}'")

    print(f"\n🎯 STEP 2: Upsert to SPARSE index (document namespace)")
    print(f"   Index: deckbot-sparse-korean")
    print(f"   Namespace: {doc_namespace}")
    print("\n   Use Pinecone MCP tool:")
    for i in range(1, num_batches + 1):
        print(f"   - Batch {i}: upsert batch_{i}.json to namespace '{doc_namespace}'")

    print(f"\n🎯 STEP 3: Upsert to DENSE index (global namespace)")
    print(f"   Index: deckbot-dense-korean")
    print(f"   Namespace: {global_namespace}")
    print("\n   Use Pinecone MCP tool:")
    for i in range(1, num_batches + 1):
        print(f"   - Batch {i}: upsert batch_{i}.json to namespace '{global_namespace}'")

    print(f"\n🎯 STEP 4: Upsert to SPARSE index (global namespace)")
    print(f"   Index: deckbot-sparse-korean")
    print(f"   Namespace: {global_namespace}")
    print("\n   Use Pinecone MCP tool:")
    for i in range(1, num_batches + 1):
        print(f"   - Batch {i}: upsert batch_{i}.json to namespace '{global_namespace}'")


def main():
    if len(sys.argv) < 2:
        print("Usage: python upsert_to_pinecone.py <validated_json_path>")
        print("\nExample:")
        print("  python upsert_to_pinecone.py output/ilgram_DB_metadata_pinecone_validated.json")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    if not input_path.exists():
        print(f"❌ Error: File not found: {input_path}")
        sys.exit(1)

    print(f"🔄 Preparing records from: {input_path.name}\n")

    # Prepare records
    records, pdf_id, company = prepare_records(input_path)
    print(f"✅ Loaded {len(records)} records")
    print(f"   PDF ID: {pdf_id}")
    print(f"   Company: {company}")

    # Create batches
    batches = create_batches(records, batch_size=10)
    print(f"\n📦 Created {len(batches)} batches:")

    # Save batch files
    output_dir = Path("/tmp/pinecone_batches")
    batch_files = save_batch_files(batches, pdf_id, output_dir)

    # Generate commands
    generate_upsert_commands(pdf_id, len(batches), company)

    print("\n" + "="*80)
    print(f"✅ PREPARATION COMPLETE")
    print("="*80)
    print(f"\n💾 Batch files saved to: {output_dir}")
    print(f"\n📋 Next: Use Pinecone MCP tool to upsert each batch following steps above")


if __name__ == "__main__":
    main()
