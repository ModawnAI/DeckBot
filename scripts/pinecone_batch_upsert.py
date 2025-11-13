#!/usr/bin/env python3
"""
Pinecone Batch Upserter for DeckBot
Efficiently upserts large JSON files to Pinecone in configurable batches
"""

import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any
import time
from datetime import datetime

# Configuration
BATCH_SIZE = 50  # Records per batch (adjust based on your data size)
NAMESPACE = "deckbot-docs"  # Default namespace
OUTPUT_DIR = Path("/Users/kjyoo/DeckBot/output")
LOG_FILE = OUTPUT_DIR / "upsert_log.txt"

# You'll need to implement the actual Pinecone upsert via MCP
# This script prepares the data and calls the MCP tool


def log_message(message: str, level: str = "INFO"):
    """Log messages to both console and file"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] [{level}] {message}"
    print(log_entry)

    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(log_entry + "\n")


def load_json_file(file_path: Path) -> List[Dict[str, Any]]:
    """Load and parse a JSON file"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Handle both array and single object formats
        if isinstance(data, list):
            return data
        else:
            return [data]
    except Exception as e:
        log_message(f"Error loading {file_path}: {str(e)}", "ERROR")
        return []


def validate_record(record: Dict[str, Any]) -> bool:
    """Validate that a record has required fields for Pinecone"""
    required_fields = ["id", "content"]

    for field in required_fields:
        if field not in record:
            log_message(f"Record missing required field '{field}': {record.get('id', 'unknown')}", "WARNING")
            return False

    # Check that content is not empty
    if not record.get("content") or not isinstance(record["content"], str):
        log_message(f"Record has invalid content: {record.get('id', 'unknown')}", "WARNING")
        return False

    return True


def prepare_batch(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Prepare and validate a batch of records"""
    return [r for r in records if validate_record(r)]


def chunk_list(items: List[Any], chunk_size: int) -> List[List[Any]]:
    """Split a list into chunks of specified size"""
    return [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]


def save_batch_to_file(batch: List[Dict[str, Any]], batch_num: int, output_dir: Path):
    """Save a batch to a separate JSON file for manual review/upload"""
    batch_file = output_dir / f"prepared_batch_{batch_num:03d}.json"

    try:
        with open(batch_file, "w", encoding="utf-8") as f:
            json.dump(batch, f, ensure_ascii=False, indent=2)
        log_message(f"Saved batch {batch_num} ({len(batch)} records) to {batch_file}")
        return batch_file
    except Exception as e:
        log_message(f"Error saving batch {batch_num}: {str(e)}", "ERROR")
        return None


def get_json_files(directory: Path, pattern: str = "*.json") -> List[Path]:
    """Get all JSON files from directory, optionally filtered by pattern"""
    files = list(directory.glob(pattern))
    # Exclude log files and prepared batches
    files = [f for f in files if not f.name.startswith("upsert_log")
             and not f.name.startswith("prepared_batch")]
    return sorted(files)


def analyze_files(files: List[Path]) -> Dict[str, Any]:
    """Analyze files to provide statistics"""
    total_records = 0
    file_stats = []

    for file in files:
        records = load_json_file(file)
        file_stats.append({
            "file": file.name,
            "records": len(records),
            "size_mb": file.stat().st_size / (1024 * 1024)
        })
        total_records += len(records)

    return {
        "total_files": len(files),
        "total_records": total_records,
        "file_stats": file_stats
    }


def process_files(files: List[Path], batch_size: int = BATCH_SIZE,
                  save_batches: bool = True) -> Dict[str, Any]:
    """
    Process all JSON files and prepare batches for upload

    Args:
        files: List of JSON file paths to process
        batch_size: Number of records per batch
        save_batches: Whether to save prepared batches to disk

    Returns:
        Dictionary with processing results
    """
    all_records = []

    # Load all records from all files
    log_message(f"Loading records from {len(files)} files...")
    for file in files:
        records = load_json_file(file)
        all_records.extend(records)
        log_message(f"Loaded {len(records)} records from {file.name}")

    log_message(f"Total records loaded: {len(all_records)}")

    # Validate and prepare all records
    log_message("Validating records...")
    valid_records = prepare_batch(all_records)
    log_message(f"Valid records: {len(valid_records)} / {len(all_records)}")

    if not valid_records:
        log_message("No valid records to process!", "ERROR")
        return {"success": False, "batches": 0, "records": 0}

    # Split into batches
    batches = chunk_list(valid_records, batch_size)
    log_message(f"Split into {len(batches)} batches of up to {batch_size} records")

    # Save batches to files if requested
    batch_files = []
    if save_batches:
        log_message("Saving batches to files...")
        prepared_dir = OUTPUT_DIR / "prepared_batches"
        prepared_dir.mkdir(exist_ok=True)

        for idx, batch in enumerate(batches, 1):
            batch_file = save_batch_to_file(batch, idx, prepared_dir)
            if batch_file:
                batch_files.append(batch_file)

    return {
        "success": True,
        "batches": len(batches),
        "records": len(valid_records),
        "batch_files": batch_files,
        "batches_data": batches  # Return the actual batch data
    }


def main():
    """Main execution function"""
    log_message("=" * 80)
    log_message("Starting Pinecone Batch Upsert Process")
    log_message("=" * 80)

    # Get command line arguments
    file_pattern = sys.argv[1] if len(sys.argv) > 1 else "*.json"
    batch_size = int(sys.argv[2]) if len(sys.argv) > 2 else BATCH_SIZE

    log_message(f"Configuration:")
    log_message(f"  Output Directory: {OUTPUT_DIR}")
    log_message(f"  File Pattern: {file_pattern}")
    log_message(f"  Batch Size: {batch_size}")
    log_message(f"  Namespace: {NAMESPACE}")

    # Get files to process
    files = get_json_files(OUTPUT_DIR, file_pattern)

    if not files:
        log_message(f"No JSON files found matching pattern: {file_pattern}", "ERROR")
        return 1

    # Analyze files
    log_message("\nAnalyzing files...")
    stats = analyze_files(files)

    log_message(f"\nFile Statistics:")
    log_message(f"  Total Files: {stats['total_files']}")
    log_message(f"  Total Records: {stats['total_records']}")
    log_message(f"  Estimated Batches: {(stats['total_records'] + batch_size - 1) // batch_size}")

    for file_stat in stats['file_stats']:
        log_message(f"    {file_stat['file']}: {file_stat['records']} records ({file_stat['size_mb']:.2f} MB)")

    # Process files
    log_message("\n" + "=" * 80)
    result = process_files(files, batch_size=batch_size, save_batches=True)

    if result["success"]:
        log_message("\n" + "=" * 80)
        log_message("Processing completed successfully!")
        log_message(f"  Total Batches: {result['batches']}")
        log_message(f"  Total Records: {result['records']}")
        log_message(f"  Batch Files Saved: {len(result['batch_files'])}")
        log_message("\nNext Steps:")
        log_message("  1. Review prepared batch files in: output/prepared_batches/")
        log_message("  2. Use Claude to upsert batches via Pinecone MCP")
        log_message("  3. Monitor upsert progress in upsert_log.txt")
        log_message("=" * 80)
        return 0
    else:
        log_message("Processing failed!", "ERROR")
        return 1


if __name__ == "__main__":
    sys.exit(main())
