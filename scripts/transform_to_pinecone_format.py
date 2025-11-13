#!/usr/bin/env python3
"""
Unified DeckBot → Pinecone Transformation Script
Transforms TypeScript metadata JSON to Pinecone-compatible format

Based on Pinecone cascading retrieval pattern (pinecone.txt)
- Uses _id and content fields (compatible with field_map: {"text": "content"})
- Batches limited to 96 records max (Pinecone integrated embedding limit)
- Consistent schema across all records
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any, Tuple
from datetime import datetime


# Configuration based on pinecone.txt requirements
MAX_BATCH_SIZE = 96  # Pinecone integrated embedding limit
DENSE_INDEX = "deckbot-dense-korean"
SPARSE_INDEX = "deckbot-sparse-korean"


def sanitize_id(text: str) -> str:
    """
    Create clean ASCII-safe IDs
    IMPORTANT: Pinecone requires ASCII-only characters for namespaces
    """
    # Remove extension if present
    if text.endswith('.pdf'):
        text = text[:-4]

    # Replace spaces and special chars with underscores
    clean = text.replace(' ', '_').replace('(', '').replace(')', '')
    clean = clean.replace('[', '').replace(']', '').replace('-', '_')

    # Keep only ASCII alphanumeric and underscore (removes Korean, Chinese, etc.)
    clean = ''.join(c if (c.isascii() and (c.isalnum() or c == '_')) else '_' for c in clean)

    # Remove consecutive underscores
    while '__' in clean:
        clean = clean.replace('__', '_')

    return clean.strip('_').lower()


def transform_metadata_to_records(
    metadata_path: str
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Transform TypeScript metadata JSON to Pinecone-compatible records

    Input format (from TypeScript):
    {
        "deck_metadata": {
            "filename": str,
            "deck_industry": str,
            "company_name": str,
            "executive_summary": str,
            "total_pages": int,
            "created_date": str
        },
        "slide_data": [
            {
                "slide_number": int,
                "slide_content": str,
                "slide_summary": str,
                "keywords": [str],
                "slide_layout": str,
                "image_url": str
            }
        ]
    }

    Output format (for Pinecone with field_map: {"text": "content"}):
    [
        {
            "_id": str,
            "content": str,  # Main searchable text field
            "type": str,     # "deck_metadata" or "slide"
            "pdf_id": str,
            "company": str,
            "industry": str,
            ... (other metadata)
        }
    ]
    """
    print(f"\n📄 Processing: {Path(metadata_path).name}")

    # Load metadata
    with open(metadata_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    deck_meta = data['deck_metadata']
    slides = data['slide_data']

    # Generate clean PDF ID (ASCII-only for Pinecone namespace compatibility)
    filename = deck_meta['filename']
    pdf_id = sanitize_id(filename)

    # If sanitization results in empty string, use timestamp-based ID
    if not pdf_id or pdf_id == '_':
        from datetime import datetime
        pdf_id = f"doc_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        print(f"   ⚠️  Warning: Filename contains no ASCII chars, using generated ID: {pdf_id}")

    print(f"   Original filename: {filename}")
    print(f"   Sanitized PDF ID: {pdf_id}")
    print(f"   Company: {deck_meta.get('company_name', 'N/A')}")
    print(f"   Industry: {deck_meta.get('deck_industry', 'N/A')}")
    print(f"   Slides: {len(slides)}")

    records = []

    # Record 1: Deck-level metadata
    deck_record = {
        "_id": f"{pdf_id}_meta",
        "content": build_deck_content(deck_meta),
        "type": "deck_metadata",
        "pdf_id": pdf_id,
        "pdf_filename": filename,
        "company": deck_meta.get('company_name', ''),
        "industry": deck_meta.get('deck_industry', ''),
        "total_pages": deck_meta.get('total_pages', 0),
        "created_date": deck_meta.get('created_date', '')
    }

    # Add PDF URL if available (Vercel Blob)
    if deck_meta.get('pdf_url'):
        deck_record['pdf_url'] = deck_meta['pdf_url']

    records.append(deck_record)

    # Records 2-N: Individual slides
    for slide in slides:
        slide_record = {
            "_id": f"{pdf_id}_slide_{slide['slide_number']:03d}",
            "content": build_slide_content(slide),
            "type": "slide",
            "pdf_id": pdf_id,
            "pdf_filename": filename,
            "company": deck_meta.get('company_name', ''),
            "industry": deck_meta.get('deck_industry', ''),
            "slide_number": slide['slide_number'],
            "keywords": ", ".join(slide.get('keywords', [])),
            "slide_layout": slide.get('slide_layout', ''),
            "image_url": slide.get('image_url', '')
        }
        records.append(slide_record)

    # Document info for summary
    doc_info = {
        "pdf_id": pdf_id,
        "filename": filename,
        "company": deck_meta.get('company_name', ''),
        "industry": deck_meta.get('deck_industry', ''),
        "total_records": len(records),
        "deck_metadata_record": 1,
        "slide_records": len(slides)
    }

    return records, doc_info


def build_deck_content(deck_meta: Dict) -> str:
    """
    Build searchable content string from deck metadata
    Combines all important fields into single searchable text
    """
    parts = [
        f"Filename: {deck_meta.get('filename', '')}",
        f"Industry: {deck_meta.get('deck_industry', '')}",
        f"Company: {deck_meta.get('company_name', '')}",
        f"Executive Summary: {deck_meta.get('executive_summary', '')}"
    ]
    return "\n".join(parts)


def build_slide_content(slide: Dict) -> str:
    """
    Build searchable content string from slide data
    Prioritizes slide_summary and slide_content
    """
    parts = []

    # Add slide content if available (raw OCR text)
    if slide.get('slide_content'):
        parts.append(f"Content: {slide['slide_content']}")

    # Add summary (AI-generated summary)
    if slide.get('slide_summary'):
        parts.append(f"Summary: {slide['slide_summary']}")

    # Add keywords for additional context
    if slide.get('keywords'):
        parts.append(f"Keywords: {', '.join(slide['keywords'])}")

    # Add layout description
    if slide.get('slide_layout'):
        parts.append(f"Layout: {slide['slide_layout']}")

    return "\n".join(parts)


def create_batches(
    records: List[Dict[str, Any]],
    batch_size: int = MAX_BATCH_SIZE
) -> List[List[Dict[str, Any]]]:
    """
    Split records into batches respecting Pinecone's limit
    """
    batches = []
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        batches.append(batch)
    return batches


def validate_record(record: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Validate record has required fields for Pinecone
    """
    # Required fields
    if '_id' not in record:
        return False, "Missing '_id' field"

    if 'content' not in record:
        return False, "Missing 'content' field"

    if not record['content'] or not isinstance(record['content'], str):
        return False, "Invalid or empty 'content' field"

    if len(record['content'].strip()) == 0:
        return False, "Empty 'content' field"

    return True, "Valid"


def save_batches(
    batches: List[List[Dict]],
    pdf_id: str,
    output_dir: Path
) -> List[Path]:
    """
    Save batches as separate JSON files for Pinecone MCP upsert
    """
    batch_dir = output_dir / "pinecone_batches" / pdf_id
    batch_dir.mkdir(parents=True, exist_ok=True)

    batch_files = []
    for idx, batch in enumerate(batches, 1):
        batch_file = batch_dir / f"batch_{idx:03d}.json"

        with open(batch_file, 'w', encoding='utf-8') as f:
            json.dump(batch, f, ensure_ascii=False, indent=2)

        batch_files.append(batch_file)
        print(f"   ✓ Batch {idx}: {len(batch)} records → {batch_file.name}")

    return batch_files


def generate_upsert_instructions(
    pdf_id: str,
    doc_info: Dict,
    batch_files: List[Path]
):
    """
    Generate instructions for using Pinecone MCP to upsert batches
    """
    print("\n" + "=" * 80)
    print("📋 PINECONE UPSERT INSTRUCTIONS")
    print("=" * 80)

    print(f"\n📄 Document: {doc_info['filename']}")
    print(f"   PDF ID: {pdf_id}")
    print(f"   Company: {doc_info['company']}")
    print(f"   Industry: {doc_info['industry']}")
    print(f"   Total Records: {doc_info['total_records']}")
    print(f"   Total Batches: {len(batch_files)}")

    print(f"\n🎯 STEP 1: Create Indexes (if not exist)")
    print(f"   Use Pinecone MCP: mcp__pinecone-mcp__create-index-for-model")
    print(f"\n   Dense Index:")
    print(f'   {{')
    print(f'     "name": "{DENSE_INDEX}",')
    print(f'     "embed": {{')
    print(f'       "model": "multilingual-e5-large",')
    print(f'       "fieldMap": {{"text": "content"}}')
    print(f'     }}')
    print(f'   }}')
    print(f"\n   Sparse Index:")
    print(f'   {{')
    print(f'     "name": "{SPARSE_INDEX}",')
    print(f'     "embed": {{')
    print(f'       "model": "pinecone-sparse-english-v0",')
    print(f'       "fieldMap": {{"text": "content"}}')
    print(f'     }}')
    print(f'   }}')

    print(f"\n🎯 STEP 2: Upsert Batches")
    print(f"   Use Pinecone MCP: mcp__pinecone-mcp__upsert-records")
    print(f"\n   For EACH batch file:")

    for idx, batch_file in enumerate(batch_files, 1):
        print(f"\n   Batch {idx}: {batch_file}")
        print(f"   → Upsert to {DENSE_INDEX}, namespace: doc:{pdf_id}")
        print(f"   → Upsert to {SPARSE_INDEX}, namespace: doc:{pdf_id}")
        print(f"   → Upsert to {DENSE_INDEX}, namespace: global")
        print(f"   → Upsert to {SPARSE_INDEX}, namespace: global")

    print(f"\n📝 Namespace Strategy:")
    print(f"   doc:{pdf_id} - Document-specific searches")
    print(f"   global - Cross-document searches")

    print("\n" + "=" * 80)


def process_metadata_file(metadata_path: str, output_dir: str = "/Users/kjyoo/DeckBot/output"):
    """
    Main processing function for a single metadata JSON file
    """
    try:
        # Transform to Pinecone format
        records, doc_info = transform_metadata_to_records(metadata_path)

        # Validate all records
        print(f"\n🔍 Validating {len(records)} records...")
        invalid_count = 0
        for record in records:
            is_valid, message = validate_record(record)
            if not is_valid:
                print(f"   ❌ Invalid record {record.get('_id', 'unknown')}: {message}")
                invalid_count += 1

        if invalid_count > 0:
            print(f"\n❌ Found {invalid_count} invalid records. Aborting.")
            return False

        print(f"   ✅ All records valid")

        # Create batches (max 96 records per batch)
        print(f"\n📦 Creating batches (max {MAX_BATCH_SIZE} records per batch)...")
        batches = create_batches(records, batch_size=MAX_BATCH_SIZE)
        print(f"   Created {len(batches)} batches")

        # Save batches
        print(f"\n💾 Saving batch files...")
        output_path = Path(output_dir)
        batch_files = save_batches(batches, doc_info['pdf_id'], output_path)

        # Save summary
        summary = {
            "processed_at": datetime.now().isoformat(),
            "input_file": metadata_path,
            "document_info": doc_info,
            "batch_info": {
                "total_batches": len(batches),
                "max_batch_size": MAX_BATCH_SIZE,
                "batch_files": [str(f) for f in batch_files]
            },
            "index_config": {
                "dense_index": DENSE_INDEX,
                "sparse_index": SPARSE_INDEX,
                "field_map": {"text": "content"}
            },
            "namespaces": [
                f"doc:{doc_info['pdf_id']}",
                "global"
            ]
        }

        summary_file = output_path / "pinecone_batches" / doc_info['pdf_id'] / "summary.json"
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        print(f"   ✅ Summary saved: {summary_file}")

        # Generate instructions
        generate_upsert_instructions(doc_info['pdf_id'], doc_info, batch_files)

        print("\n✅ Transformation complete!")
        print(f"   Batch files: {output_path / 'pinecone_batches' / doc_info['pdf_id']}")

        return True

    except Exception as e:
        print(f"\n❌ Error processing {metadata_path}: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """
    CLI interface
    """
    if len(sys.argv) < 2:
        print("""
╔════════════════════════════════════════════════════════════════════════════╗
║     DeckBot → Pinecone Transformation Script                               ║
║     Converts TypeScript metadata JSON to Pinecone-compatible format        ║
╚════════════════════════════════════════════════════════════════════════════╝

Usage:
  python transform_to_pinecone_format.py <metadata_json_path>

Example:
  python transform_to_pinecone_format.py output/example_metadata.json

Features:
  ✓ Consistent field naming (_id, content)
  ✓ Batch size ≤ 96 (Pinecone integrated embedding limit)
  ✓ Compatible with cascading retrieval pattern
  ✓ Dual namespace strategy (doc-specific + global)
  ✓ Ready for Pinecone MCP upsert

Output:
  - Batch JSON files in output/pinecone_batches/<pdf_id>/
  - Summary JSON with processing details
  - Upsert instructions for Pinecone MCP
        """)
        return 1

    metadata_path = sys.argv[1]

    if not Path(metadata_path).exists():
        print(f"❌ Error: File not found: {metadata_path}")
        return 1

    success = process_metadata_file(metadata_path)

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
