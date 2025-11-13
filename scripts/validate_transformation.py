#!/usr/bin/env python3
"""
Transformation Validation Script for DeckBot

This script validates that the TypeScript-generated JSON structure can be
properly transformed into Pinecone-compatible records.

Usage:
    python validate_transformation.py <metadata_json_path>

Example:
    python validate_transformation.py output/ilgram_DB_____________________________0529_metadata.json
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
import re


class TransformationValidator:
    """Validates and transforms TypeScript metadata to Pinecone format"""

    REQUIRED_DECK_FIELDS = {"filename", "deck_industry", "company_name", "executive_summary", "total_pages"}
    REQUIRED_SLIDE_FIELDS = {"slide_number", "slide_summary", "keywords", "slide_layout", "image_url"}

    def __init__(self):
        self.validation_errors = []
        self.warnings = []

    def sanitize_filename(self, filename: str) -> str:
        """Extract clean PDF ID from filename"""
        # Remove extension
        base = Path(filename).stem
        # Extract document identifier (ilgram_db_insurance_0529)
        # Pattern: company_product_date format
        parts = base.split('_')
        if len(parts) >= 3:
            return '_'.join(parts[:4]) if len(parts) >= 4 else base
        return base

    def validate_typescript_structure(self, data: Dict[str, Any]) -> bool:
        """Validate the TypeScript JSON structure"""
        print("📋 Validating TypeScript structure...")

        # Check top-level structure
        if "deck_metadata" not in data:
            self.validation_errors.append("Missing 'deck_metadata' field")
            return False

        if "slide_data" not in data:
            self.validation_errors.append("Missing 'slide_data' field")
            return False

        # Validate deck_metadata
        deck_meta = data["deck_metadata"]
        missing_deck_fields = self.REQUIRED_DECK_FIELDS - set(deck_meta.keys())
        if missing_deck_fields:
            self.validation_errors.append(f"Missing deck_metadata fields: {missing_deck_fields}")

        # Validate slide_data
        if not isinstance(data["slide_data"], list):
            self.validation_errors.append("slide_data must be an array")
            return False

        for idx, slide in enumerate(data["slide_data"]):
            missing_slide_fields = self.REQUIRED_SLIDE_FIELDS - set(slide.keys())
            if missing_slide_fields:
                self.validation_errors.append(
                    f"Slide {idx + 1} missing fields: {missing_slide_fields}"
                )

            # Validate keywords is array
            if "keywords" in slide and not isinstance(slide["keywords"], list):
                self.validation_errors.append(
                    f"Slide {idx + 1}: keywords must be an array"
                )

        if self.validation_errors:
            print("❌ Validation errors found:")
            for error in self.validation_errors:
                print(f"   - {error}")
            return False

        print("✅ TypeScript structure is valid")
        return True

    def transform_to_pinecone(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Transform TypeScript structure to Pinecone records"""
        print("\n🔄 Transforming to Pinecone format...")

        records = []
        deck_meta = data["deck_metadata"]

        # Extract PDF identifier
        pdf_id = self.sanitize_filename(deck_meta["filename"])
        pdf_title = deck_meta["filename"]
        company = deck_meta["company_name"]
        industry = deck_meta["deck_industry"]

        print(f"   PDF ID: {pdf_id}")
        print(f"   Company: {company}")
        print(f"   Industry: {industry}")

        # Transform deck metadata record
        deck_record = {
            "_id": f"{pdf_id}_meta",
            "content": self._build_deck_content(deck_meta),
            "type": "deck_metadata",
            "filename": deck_meta["filename"],
            "industry": industry,
            "company": company,
            "total_pages": deck_meta["total_pages"],
            "pdf_id": pdf_id,
            "pdf_title": pdf_title
        }

        # Add optional created_date if present
        if "created_date" in deck_meta:
            deck_record["created_date"] = deck_meta["created_date"]

        records.append(deck_record)

        # Transform slide records
        for slide in data["slide_data"]:
            slide_record = {
                "_id": f"{pdf_id}_slide_{slide['slide_number']:03d}",
                "content": self._build_slide_content(slide),
                "type": "slide",
                "slide_number": slide["slide_number"],
                "keywords": self._format_keywords(slide.get("keywords", [])),
                "layout": slide["slide_layout"],
                "image_url": slide["image_url"],
                "pdf_id": pdf_id,
                "pdf_title": pdf_title,
                "company": company,
                "industry": industry
            }
            records.append(slide_record)

        print(f"✅ Transformed {len(records)} records (1 deck + {len(records)-1} slides)")
        return records

    def _build_deck_content(self, deck_meta: Dict[str, Any]) -> str:
        """Build searchable content string for deck metadata"""
        parts = [
            f"Filename: {deck_meta['filename']}",
            f"Industry: {deck_meta['deck_industry']}",
            f"Company: {deck_meta['company_name']}",
            f"Summary: {deck_meta['executive_summary']}"
        ]
        return "\n".join(parts)

    def _build_slide_content(self, slide: Dict[str, Any]) -> str:
        """Build searchable content string for slide"""
        parts = []

        # Add slide_content if present and not empty
        if slide.get("slide_content"):
            parts.append(f"Content: {slide['slide_content']}")

        # Always add summary
        parts.append(f"Summary: {slide['slide_summary']}")

        return "\n".join(parts)

    def _format_keywords(self, keywords: List[str]) -> str:
        """Convert keywords array to comma-separated string"""
        if isinstance(keywords, list):
            return ", ".join(keywords)
        return str(keywords)

    def validate_pinecone_records(self, records: List[Dict[str, Any]]) -> bool:
        """Validate the Pinecone record structure"""
        print("\n📊 Validating Pinecone records...")

        required_fields = {"_id", "content", "type", "pdf_id", "pdf_title", "company", "industry"}

        for idx, record in enumerate(records):
            missing_fields = required_fields - set(record.keys())
            if missing_fields:
                self.validation_errors.append(
                    f"Record {idx}: Missing required fields {missing_fields}"
                )

            # Validate _id format
            if not record.get("_id"):
                self.validation_errors.append(f"Record {idx}: Empty _id")

            # Validate content is string and not empty
            if not isinstance(record.get("content"), str) or not record.get("content"):
                self.validation_errors.append(f"Record {idx}: content must be non-empty string")

            # Validate type
            if record.get("type") not in ["deck_metadata", "slide"]:
                self.validation_errors.append(
                    f"Record {idx}: type must be 'deck_metadata' or 'slide'"
                )

            # Type-specific validation
            if record.get("type") == "slide":
                if "slide_number" not in record:
                    self.validation_errors.append(f"Record {idx}: slide missing slide_number")
                if "keywords" not in record:
                    self.validation_errors.append(f"Record {idx}: slide missing keywords")

        if self.validation_errors:
            print("❌ Pinecone validation errors:")
            for error in self.validation_errors:
                print(f"   - {error}")
            return False

        print("✅ All Pinecone records are valid")
        return True

    def generate_comparison_report(self, original: Dict, records: List[Dict]) -> str:
        """Generate a comparison report between original and transformed data"""
        report = []
        report.append("\n" + "="*80)
        report.append("TRANSFORMATION COMPARISON REPORT")
        report.append("="*80)

        # Original structure
        report.append("\n📥 ORIGINAL TYPESCRIPT STRUCTURE:")
        report.append(f"   Deck Metadata Fields: {list(original['deck_metadata'].keys())}")
        report.append(f"   Total Slides: {len(original['slide_data'])}")
        if original['slide_data']:
            report.append(f"   Slide Fields: {list(original['slide_data'][0].keys())}")

        # Transformed structure
        report.append("\n📤 TRANSFORMED PINECONE STRUCTURE:")
        report.append(f"   Total Records: {len(records)}")
        report.append(f"   Deck Metadata Records: 1")
        report.append(f"   Slide Records: {len(records) - 1}")
        if records:
            report.append(f"   Record Fields: {list(records[0].keys())}")

        # Field mapping
        report.append("\n🔄 FIELD TRANSFORMATIONS:")
        report.append("   TypeScript → Pinecone")
        report.append("   ─────────────────────────────────")
        report.append("   deck_metadata.filename → filename, pdf_id (sanitized)")
        report.append("   deck_metadata.deck_industry → industry")
        report.append("   deck_metadata.company_name → company")
        report.append("   deck_metadata.executive_summary → content (partial)")
        report.append("   slide_data[].keywords (array) → keywords (string)")
        report.append("   slide_data[].slide_content + slide_summary → content")

        # Data preservation check
        report.append("\n✅ DATA PRESERVATION:")
        report.append(f"   Original slides: {len(original['slide_data'])}")
        report.append(f"   Transformed slides: {len(records) - 1}")
        report.append(f"   Match: {'✓' if len(original['slide_data']) == len(records) - 1 else '✗'}")

        return "\n".join(report)


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_transformation.py <metadata_json_path>")
        print("\nExample:")
        print("  python validate_transformation.py output/ilgram_DB_____________________________0529_metadata.json")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    if not input_path.exists():
        print(f"❌ Error: File not found: {input_path}")
        sys.exit(1)

    print(f"🔍 Validating transformation for: {input_path.name}\n")

    # Load TypeScript JSON
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            typescript_data = json.load(f)
    except Exception as e:
        print(f"❌ Error loading JSON: {e}")
        sys.exit(1)

    # Validate and transform
    validator = TransformationValidator()

    # Step 1: Validate TypeScript structure
    if not validator.validate_typescript_structure(typescript_data):
        sys.exit(1)

    # Step 2: Transform to Pinecone format
    pinecone_records = validator.transform_to_pinecone(typescript_data)

    # Step 3: Validate Pinecone records
    if not validator.validate_pinecone_records(pinecone_records):
        sys.exit(1)

    # Step 4: Generate comparison report
    report = validator.generate_comparison_report(typescript_data, pinecone_records)
    print(report)

    # Step 5: Save transformed records (optional)
    output_path = input_path.parent / f"{input_path.stem}_pinecone_validated.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(pinecone_records, f, ensure_ascii=False, indent=2)

    print(f"\n💾 Validated Pinecone records saved to:")
    print(f"   {output_path}")

    print("\n✅ VALIDATION COMPLETE - All checks passed!")
    print("\n📋 Next Steps:")
    print("   1. Review the transformed records in the output file")
    print("   2. Use these records with the DeckBot ingestion script")
    print("   3. Run: python scripts/deckbot_unified_index.py ingest <output_file>")


if __name__ == "__main__":
    main()
