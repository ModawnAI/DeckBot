#!/usr/bin/env python3
"""
Automated Pinecone Upsert using MCP tool
Loads batch files and prints JSON for MCP tool consumption
"""

import json
import sys
from pathlib import Path

def load_and_print_batch(batch_path: Path):
    """Load batch file and print records as JSON array"""
    with open(batch_path, 'r', encoding='utf-8') as f:
        records = json.load(f)

    # Print as compact JSON for MCP tool
    print(json.dumps(records, ensure_ascii=False, separators=(',', ':')))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python upsert_with_mcp.py <batch_file>")
        sys.exit(1)

    batch_path = Path(sys.argv[1])
    if not batch_path.exists():
        print(f"Error: File not found: {batch_path}")
        sys.exit(1)

    load_and_print_batch(batch_path)
