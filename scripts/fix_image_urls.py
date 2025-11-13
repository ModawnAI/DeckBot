#!/usr/bin/env python3
"""
Fix Missing Image URLs in Metadata JSON
Adds blob image URLs to slides that are missing them
"""

import json
import sys
from pathlib import Path
from urllib.parse import quote

def fix_image_urls(metadata_path: str):
    """
    Fix missing image_url fields in metadata JSON
    """
    print(f"\n📄 Loading metadata: {metadata_path}")

    with open(metadata_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Get the base URL pattern from the PDF URL
    pdf_url = data['deck_metadata'].get('pdf_url', '')
    if not pdf_url:
        print("❌ Error: No pdf_url found in deck_metadata")
        return False

    # Extract base URL and construct image base URL
    # PDF URL: https://xsctqzbwa1mbabgs.public.blob.vercel-storage.com/pdfs/ilgram-2025-...pdf
    # Image URL: https://xsctqzbwa1mbabgs.public.blob.vercel-storage.com/images/ilgram-2025-.../slide-001.png

    base_url = pdf_url.rsplit('/pdfs/', 1)[0]
    filename = data['deck_metadata']['filename']

    # URL encode the filename for the path (same as Blob storage does)
    # Format: ilgram-2025-더리틀스-온라인-광고-운영-제안서
    encoded_filename = filename.replace('.pdf', '').replace(' ', '-').replace('(', '').replace(')', '')
    encoded_path = quote(encoded_filename, safe='')

    image_base_url = f"{base_url}/images/{encoded_path}"

    print(f"   Base URL: {base_url}")
    print(f"   Image path: {image_base_url}")

    # Fix each slide
    fixed_count = 0
    total_slides = len(data['slide_data'])

    for slide in data['slide_data']:
        slide_num = slide['slide_number']

        # Check if image_url is missing or empty
        if not slide.get('image_url'):
            # Construct the image URL
            slide['image_url'] = f"{image_base_url}/slide-{slide_num:03d}.png"
            fixed_count += 1
            print(f"   ✓ Fixed slide {slide_num}: {slide['image_url']}")

    print(f"\n📊 Summary:")
    print(f"   Total slides: {total_slides}")
    print(f"   Fixed slides: {fixed_count}")
    print(f"   Already had URLs: {total_slides - fixed_count}")

    if fixed_count > 0:
        # Save the fixed metadata
        output_path = metadata_path.replace('.json', '_fixed.json')
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"\n💾 Saved fixed metadata to: {output_path}")

        # Also overwrite original
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"💾 Updated original file: {metadata_path}")
        return True
    else:
        print(f"\n✅ No fixes needed - all slides already have image URLs")
        return True


def main():
    if len(sys.argv) < 2:
        print("""
╔════════════════════════════════════════════════════════════════════════════╗
║     Fix Missing Image URLs Script                                         ║
║     Adds blob image URLs to metadata JSON slides                          ║
╚════════════════════════════════════════════════════════════════════════════╝

Usage:
  python fix_image_urls.py <metadata_json_path>

Example:
  python fix_image_urls.py output/ilgram_2025____________________metadata.json

This script will:
  ✓ Read the metadata JSON
  ✓ Extract the blob URL pattern from pdf_url
  ✓ Add image_url to all slides that are missing it
  ✓ Save both a *_fixed.json backup and update the original file
        """)
        return 1

    metadata_path = sys.argv[1]

    if not Path(metadata_path).exists():
        print(f"❌ Error: File not found: {metadata_path}")
        return 1

    success = fix_image_urls(metadata_path)

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
