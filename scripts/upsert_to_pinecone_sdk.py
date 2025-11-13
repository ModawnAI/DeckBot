#!/usr/bin/env python3
"""
Automated Pinecone Upsert Script using Pinecone Python SDK
Upserts all batch files to Pinecone indexes with integrated inference

Based on CLAUDE.md reference:
- Uses pinecone-client package (Python SDK)
- Utilizes integrated inference with .upsert_records()
- Field mapping: {"text": "content"}
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import List, Dict, Any
from pinecone import Pinecone

# Configuration
DENSE_INDEX = "deckbot-dense-korean"
SPARSE_INDEX = "deckbot-sparse-korean"

def load_batch_file(batch_path: Path) -> List[Dict[str, Any]]:
    """Load records from batch JSON file"""
    print(f"   📄 Loading: {batch_path.name}")
    with open(batch_path, 'r', encoding='utf-8') as f:
        records = json.load(f)
    print(f"      Loaded {len(records)} records")
    return records


def upsert_batch_to_index(
    pc: Pinecone,
    index_name: str,
    namespace: str,
    records: List[Dict[str, Any]],
    batch_num: int,
    total_batches: int
) -> bool:
    """
    Upsert a batch of records to Pinecone index using integrated inference

    The Pinecone SDK will automatically:
    1. Extract the 'content' field (based on field_map)
    2. Generate embeddings using the index's integrated model
    3. Upsert the vectors with metadata
    """
    try:
        # Get index reference
        index = pc.Index(index_name)

        print(f"      Batch {batch_num}/{total_batches}: Upserting {len(records)} records...")

        # Upsert using integrated inference
        # The SDK automatically handles:
        # - Embedding generation from 'content' field
        # - Batching for API limits
        # - Retry logic
        # Python SDK syntax: index.upsert_records(records, namespace=namespace)
        response = index.upsert_records(records, namespace=namespace)

        print(f"      ✅ Upserted successfully")
        return True

    except Exception as e:
        print(f"      ❌ Error upserting batch: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def upsert_all_batches(
    batch_dir: Path,
    pdf_id: str
):
    """
    Upsert all batches to all target combinations:
    - dense index / doc namespace
    - dense index / global namespace
    - sparse index / doc namespace
    - sparse index / global namespace
    """

    # Initialize Pinecone client
    api_key = os.getenv("PINECONE_API_KEY")
    if not api_key:
        print("❌ Error: PINECONE_API_KEY environment variable not set")
        sys.exit(1)

    pc = Pinecone(api_key=api_key)

    # Find all batch files
    batch_files = sorted(batch_dir.glob("batch_*.json"))

    if not batch_files:
        print(f"❌ Error: No batch_*.json files found in {batch_dir}")
        sys.exit(1)

    total_batches = len(batch_files)
    doc_namespace = f"doc:{pdf_id}"
    global_namespace = "global"

    print(f"\n📊 Upsert Plan:")
    print(f"   Batches: {total_batches}")
    print(f"   Indexes: 2 ({DENSE_INDEX}, {SPARSE_INDEX})")
    print(f"   Namespaces per index: 2 ({doc_namespace}, {global_namespace})")
    print(f"   Total operations: {total_batches * 2 * 2}")
    print()

    # Define targets
    targets = [
        (DENSE_INDEX, doc_namespace, "Dense Index / Doc Namespace"),
        (DENSE_INDEX, global_namespace, "Dense Index / Global Namespace"),
        (SPARSE_INDEX, doc_namespace, "Sparse Index / Doc Namespace"),
        (SPARSE_INDEX, global_namespace, "Sparse Index / Global Namespace")
    ]

    successful_operations = 0
    failed_operations = 0

    # Process each target
    for target_idx, (index_name, namespace, target_desc) in enumerate(targets, 1):
        print(f"\n{'='*80}")
        print(f"🎯 Target {target_idx}/{len(targets)}: {target_desc}")
        print(f"   Index: {index_name}")
        print(f"   Namespace: {namespace}")
        print(f"{'='*80}")

        # Process each batch
        for batch_idx, batch_file in enumerate(batch_files, 1):
            print(f"\n   📦 Batch {batch_idx}/{total_batches}: {batch_file.name}")

            # Load batch
            records = load_batch_file(batch_file)

            # Upsert
            success = upsert_batch_to_index(
                pc=pc,
                index_name=index_name,
                namespace=namespace,
                records=records,
                batch_num=batch_idx,
                total_batches=total_batches
            )

            if success:
                successful_operations += 1
            else:
                failed_operations += 1

            # Small delay between batches to avoid rate limiting
            if batch_idx < total_batches:
                time.sleep(1)

        # Delay between targets
        if target_idx < len(targets):
            print(f"\n   ⏳ Waiting 2 seconds before next target...")
            time.sleep(2)

    # Summary
    total_ops = successful_operations + failed_operations
    print(f"\n{'='*80}")
    print(f"📋 UPSERT SUMMARY")
    print(f"{'='*80}")
    print(f"   Total operations: {total_ops}")
    print(f"   ✅ Successful: {successful_operations}")
    print(f"   ❌ Failed: {failed_operations}")
    print(f"   Success rate: {(successful_operations/total_ops)*100:.1f}%")

    if failed_operations == 0:
        print(f"\n🎉 All upserts completed successfully!")
        return True
    else:
        print(f"\n⚠️  Some upserts failed. Please review errors above.")
        return False


def verify_upsert(pc: Pinecone, pdf_id: str):
    """Verify that data was successfully upserted by checking index stats"""
    print(f"\n{'='*80}")
    print(f"🔍 Verifying Upsert")
    print(f"{'='*80}")

    try:
        # Check dense index
        print(f"\n   Checking {DENSE_INDEX}...")
        dense_index = pc.Index(DENSE_INDEX)
        dense_stats = dense_index.describe_index_stats()

        print(f"   Total vectors: {dense_stats.total_vector_count}")
        if dense_stats.namespaces:
            print(f"   Namespaces:")
            for ns_name, ns_stats in dense_stats.namespaces.items():
                print(f"      - {ns_name}: {ns_stats.vector_count} vectors")

        # Check sparse index
        print(f"\n   Checking {SPARSE_INDEX}...")
        sparse_index = pc.Index(SPARSE_INDEX)
        sparse_stats = sparse_index.describe_index_stats()

        print(f"   Total vectors: {sparse_stats.total_vector_count}")
        if sparse_stats.namespaces:
            print(f"   Namespaces:")
            for ns_name, ns_stats in sparse_stats.namespaces.items():
                print(f"      - {ns_name}: {ns_stats.vector_count} vectors")

        print(f"\n✅ Verification complete")
        return True

    except Exception as e:
        print(f"❌ Error verifying upsert: {str(e)}")
        return False


def main():
    """Main entry point"""

    print("""
╔════════════════════════════════════════════════════════════════════════════╗
║     DeckBot Automated Pinecone Upsert Script                               ║
║     Using Pinecone Python SDK with Integrated Inference                    ║
╚════════════════════════════════════════════════════════════════════════════╝
""")

    if len(sys.argv) < 2:
        print("""
Usage:
  python upsert_to_pinecone_sdk.py <batch_directory>

Example:
  python upsert_to_pinecone_sdk.py /Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025

Requirements:
  - PINECONE_API_KEY environment variable must be set
  - Batch directory must contain batch_*.json files
  - Indexes must already exist (deckbot-dense-korean, deckbot-sparse-korean)

Features:
  ✓ Uses Pinecone Python SDK with integrated inference
  ✓ Automatically generates embeddings from 'content' field
  ✓ Upserts to both dense and sparse indexes
  ✓ Uses dual namespace strategy (doc-specific + global)
  ✓ Progress tracking and error reporting
  ✓ Verification of successful upsert
        """)
        return 1

    batch_dir = Path(sys.argv[1])

    if not batch_dir.exists():
        print(f"❌ Error: Directory not found: {batch_dir}")
        return 1

    # Load summary to get pdf_id
    summary_file = batch_dir / "summary.json"
    if summary_file.exists():
        with open(summary_file, 'r', encoding='utf-8') as f:
            summary = json.load(f)
            pdf_id = summary['document_info']['pdf_id']
            print(f"📄 Document Info:")
            print(f"   PDF ID: {pdf_id}")
            print(f"   Company: {summary['document_info']['company']}")
            print(f"   Industry: {summary['document_info']['industry']}")
            print(f"   Total Records: {summary['document_info']['total_records']}")
    else:
        # Fallback: use directory name as pdf_id
        pdf_id = batch_dir.name
        print(f"   ⚠️  No summary.json found, using directory name as PDF ID: {pdf_id}")

    # Check for API key
    if not os.getenv("PINECONE_API_KEY"):
        print("\n❌ Error: PINECONE_API_KEY environment variable not set")
        print("   Please set it with: export PINECONE_API_KEY='your-api-key'")
        return 1

    # Confirm before proceeding
    print(f"\n⚠️  This will upsert data to production Pinecone indexes.")
    response = input("Continue? (yes/no): ").strip().lower()

    if response not in ['yes', 'y']:
        print("❌ Cancelled by user")
        return 0

    # Upsert all batches
    success = upsert_all_batches(batch_dir, pdf_id)

    # Verify if successful
    if success:
        api_key = os.getenv("PINECONE_API_KEY")
        pc = Pinecone(api_key=api_key)
        verify_upsert(pc, pdf_id)

    print(f"\n✅ Script complete!")
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
