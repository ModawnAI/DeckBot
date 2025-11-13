#!/usr/bin/env python3
"""
Upload prepared batches to Pinecone
This script is meant to be called by Claude Code with MCP access
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any

def load_batch_file(batch_file: Path) -> List[Dict[str, Any]]:
    """Load a prepared batch file"""
    with open(batch_file, "r", encoding="utf-8") as f:
        return json.load(f)

def get_prepared_batches(directory: Path) -> List[Path]:
    """Get all prepared batch files"""
    batch_dir = directory / "prepared_batches"
    if not batch_dir.exists():
        return []
    return sorted(batch_dir.glob("prepared_batch_*.json"))

def print_batch_info(batch_file: Path, batch_num: int):
    """Print information about a batch file"""
    data = load_batch_file(batch_file)
    print(f"\nBatch {batch_num}: {batch_file.name}")
    print(f"  Records: {len(data)}")
    if data:
        print(f"  Sample ID: {data[0].get('id', 'N/A')}")
        print(f"  Content length: {len(data[0].get('content', ''))} chars")

def main():
    """Main function to display batch information"""
    output_dir = Path("/Users/kjyoo/DeckBot/output")
    batches = get_prepared_batches(output_dir)

    if not batches:
        print("No prepared batches found!")
        print(f"Run pinecone_batch_upsert.py first to prepare batches.")
        return 1

    print(f"Found {len(batches)} prepared batches")
    print("=" * 80)

    for idx, batch_file in enumerate(batches, 1):
        print_batch_info(batch_file, idx)

    print("\n" + "=" * 80)
    print("\nTo upload to Pinecone:")
    print("  Ask Claude to use mcp__pinecone-mcp__upsert-records with these batch files")
    print(f"  Index options: deckbot-sparse-korean (sparse) or deckbot-dense-korean (dense)")
    print(f"  Namespace: deckbot-docs (or your preferred namespace)")

    return 0

if __name__ == "__main__":
    sys.exit(main())
