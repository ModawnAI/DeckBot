#!/usr/bin/env python3
"""
DeckBot Unified Index Architecture
Single index approach for 400 PDFs with cascading retrieval
"""

import os
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from pinecone import Pinecone

# Configuration
DENSE_INDEX_NAME = "deckbot-dense-korean"
SPARSE_INDEX_NAME = "deckbot-sparse-korean"
GLOBAL_NAMESPACE = "global"

class DeckBotIndexManager:
    """Manages unified Pinecone index architecture for DeckBot"""

    def __init__(self, api_key: Optional[str] = None):
        self.pc = Pinecone(api_key=api_key or os.environ.get("PINECONE_API_KEY"))

    def setup_indexes(self):
        """Create dense and sparse indexes if they don't exist"""
        print("🔧 Setting up DeckBot unified indexes...")

        # Create dense index
        if not self.pc.has_index(DENSE_INDEX_NAME):
            print(f"Creating dense index: {DENSE_INDEX_NAME}")
            self.pc.create_index_for_model(
                name=DENSE_INDEX_NAME,
                embed={
                    "model": "multilingual-e5-large",
                    "field_map": {"text": "content"}
                }
            )
            print("✅ Dense index created")
        else:
            print(f"✓ Dense index {DENSE_INDEX_NAME} already exists")

        # Create sparse index
        if not self.pc.has_index(SPARSE_INDEX_NAME):
            print(f"Creating sparse index: {SPARSE_INDEX_NAME}")
            self.pc.create_index_for_model(
                name=SPARSE_INDEX_NAME,
                embed={
                    "model": "pinecone-sparse-english-v0",
                    "field_map": {"text": "content"}
                }
            )
            print("✅ Sparse index created")
        else:
            print(f"✓ Sparse index {SPARSE_INDEX_NAME} already exists")

        print("\n✅ Index setup complete!")

    def ingest_pdf_metadata(self, metadata_path: str, namespace: Optional[str] = None):
        """
        Ingest a single PDF's metadata JSON

        Args:
            metadata_path: Path to *_metadata.json file
            namespace: Optional namespace (defaults to doc:{pdf_id})
        """
        print(f"\n📥 Ingesting: {metadata_path}")

        # Load metadata
        with open(metadata_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Extract document info
        deck_meta = data['deck_metadata']
        slides = data['slide_data']

        # Generate document ID from filename
        pdf_filename = deck_meta['filename']
        doc_id = Path(pdf_filename).stem

        # Set namespace
        if namespace is None:
            namespace = f"doc:{doc_id}"

        print(f"   Document ID: {doc_id}")
        print(f"   Namespace: {namespace}")
        print(f"   Industry: {deck_meta.get('deck_industry', 'N/A')}")
        print(f"   Company: {deck_meta.get('company_name', 'N/A')}")

        # Prepare records
        records = []

        # Add deck metadata record
        deck_record = {
            "_id": f"{doc_id}_meta",
            "content": self._build_deck_content(deck_meta),
            "type": "deck_metadata",
            "pdf_id": doc_id,
            "pdf_title": pdf_filename,
            "company": deck_meta.get('company_name', ''),
            "industry": deck_meta.get('deck_industry', ''),
            "total_pages": deck_meta.get('total_pages', 0),
            "created_date": deck_meta.get('created_date', '')
        }
        records.append(deck_record)

        # Add slide records
        for slide in slides:
            slide_record = {
                "_id": f"{doc_id}_slide_{slide['slide_number']:03d}",
                "content": self._build_slide_content(slide),
                "type": "slide",
                "pdf_id": doc_id,
                "pdf_title": pdf_filename,
                "company": deck_meta.get('company_name', ''),
                "industry": deck_meta.get('deck_industry', ''),
                "slide_number": slide['slide_number'],
                "keywords": ", ".join(slide.get('keywords', [])),
                "layout": slide.get('slide_layout', ''),
                "image_url": slide.get('image_url', '')
            }
            records.append(slide_record)

        # Upsert to both indexes and namespaces
        dense_index = self.pc.Index(DENSE_INDEX_NAME)
        sparse_index = self.pc.Index(SPARSE_INDEX_NAME)

        print(f"   Upserting {len(records)} records...")

        # Upsert to document-specific namespace
        dense_index.upsert_records(records=records, namespace=namespace)
        sparse_index.upsert_records(records=records, namespace=namespace)

        # Also upsert to global namespace for cross-document search
        dense_index.upsert_records(records=records, namespace=GLOBAL_NAMESPACE)
        sparse_index.upsert_records(records=records, namespace=GLOBAL_NAMESPACE)

        print(f"   ✅ Ingested to namespaces: {namespace}, {GLOBAL_NAMESPACE}")

        return doc_id

    def _build_deck_content(self, deck_meta: Dict) -> str:
        """Build searchable content from deck metadata"""
        parts = [
            f"Filename: {deck_meta.get('filename', '')}",
            f"Industry: {deck_meta.get('deck_industry', '')}",
            f"Company: {deck_meta.get('company_name', '')}",
            f"Summary: {deck_meta.get('executive_summary', '')}"
        ]
        return "\n".join(parts)

    def _build_slide_content(self, slide: Dict) -> str:
        """Build searchable content from slide data"""
        parts = []
        if slide.get('slide_content'):
            parts.append(f"Content: {slide['slide_content']}")
        if slide.get('slide_summary'):
            parts.append(f"Summary: {slide['slide_summary']}")
        return "\n".join(parts) if parts else slide.get('slide_summary', '')

    def ingest_bulk(self, output_dir: str = "/Users/kjyoo/DeckBot/output"):
        """
        Ingest all *_metadata.json files from output directory

        Args:
            output_dir: Directory containing metadata JSON files
        """
        output_path = Path(output_dir)
        metadata_files = list(output_path.glob("*_metadata.json"))

        print(f"\n📦 Found {len(metadata_files)} metadata files to ingest")

        ingested = []
        failed = []

        for metadata_file in metadata_files:
            try:
                doc_id = self.ingest_pdf_metadata(str(metadata_file))
                ingested.append(doc_id)
            except Exception as e:
                print(f"   ❌ Failed: {e}")
                failed.append(str(metadata_file))

        print(f"\n✅ Bulk ingestion complete!")
        print(f"   Successful: {len(ingested)}")
        print(f"   Failed: {len(failed)}")

        if failed:
            print("\n❌ Failed files:")
            for f in failed:
                print(f"   - {f}")

        return ingested, failed

    def cascading_search(
        self,
        query: str,
        namespace: str = GLOBAL_NAMESPACE,
        filters: Optional[Dict] = None,
        top_k: int = 20,
        rerank_top_n: int = 5
    ) -> Dict:
        """
        Perform cascading retrieval: dense + sparse + rerank

        Args:
            query: Search query
            namespace: Namespace to search (use GLOBAL_NAMESPACE for cross-document)
            filters: Metadata filters (e.g., {"industry": "insurance"})
            top_k: Results from each index
            rerank_top_n: Final results after reranking
        """
        print(f"\n🔍 Cascading Search")
        print(f"   Query: {query}")
        print(f"   Namespace: {namespace}")
        if filters:
            print(f"   Filters: {filters}")
        print("=" * 60)

        dense_index = self.pc.Index(DENSE_INDEX_NAME)
        sparse_index = self.pc.Index(SPARSE_INDEX_NAME)

        # Build query with filters
        search_query = {
            "top_k": top_k,
            "inputs": {"text": query}
        }
        if filters:
            search_query["filter"] = filters

        # 1. Dense search (semantic)
        print("\n1️⃣ Dense search (semantic understanding)...")
        dense_results = dense_index.search(
            namespace=namespace,
            query=search_query
        )
        print(f"   Found {len(dense_results['result']['hits'])} dense results")

        # 2. Sparse search (keyword matching)
        print("2️⃣ Sparse search (keyword matching)...")
        sparse_results = sparse_index.search(
            namespace=namespace,
            query=search_query
        )
        print(f"   Found {len(sparse_results['result']['hits'])} sparse results")

        # 3. Merge and deduplicate
        print("3️⃣ Merging results...")
        merged = self._merge_results(dense_results, sparse_results)
        print(f"   Merged to {len(merged)} unique results")

        # 4. Rerank
        print("4️⃣ Reranking with bge-reranker-v2-m3...")
        final_results = self.pc.inference.rerank(
            model="bge-reranker-v2-m3",
            query=query,
            documents=merged,
            rank_fields=["content"],
            top_n=min(rerank_top_n, len(merged)),
            return_documents=True,
            parameters={"truncate": "END"}
        )

        # Display results
        self._display_results(final_results, query)

        return final_results

    def _merge_results(self, dense_results: Dict, sparse_results: Dict) -> List[Dict]:
        """Merge and deduplicate results from dense and sparse searches"""
        hits = {}

        # Process dense results
        for hit in dense_results['result']['hits']:
            doc = {
                '_id': hit['_id'],
                'content': hit['fields']['content'],
                '_score': hit['_score']
            }
            # Add all available fields
            for key, value in hit['fields'].items():
                if key != 'content':
                    doc[key] = value
            hits[hit['_id']] = doc

        # Process sparse results
        for hit in sparse_results['result']['hits']:
            if hit['_id'] in hits:
                # Average scores if exists in both
                hits[hit['_id']]['_score'] = (
                    hits[hit['_id']]['_score'] + hit['_score']
                ) / 2
            else:
                doc = {
                    '_id': hit['_id'],
                    'content': hit['fields']['content'],
                    '_score': hit['_score']
                }
                for key, value in hit['fields'].items():
                    if key != 'content':
                        doc[key] = value
                hits[hit['_id']] = doc

        # Sort by score
        return sorted(hits.values(), key=lambda x: x['_score'], reverse=True)

    def _display_results(self, results: Dict, query: str):
        """Display search results in a formatted way"""
        print(f"\n✅ Top Results for: '{query}'")
        print("=" * 60)

        for i, item in enumerate(results.data, 1):
            doc = item['document']
            score = item['score']

            print(f"\n{i}. Relevance Score: {score:.4f}")
            print(f"   ID: {doc['_id']}")

            if 'company' in doc:
                print(f"   Company: {doc['company']}")
            if 'industry' in doc:
                print(f"   Industry: {doc['industry']}")
            if 'slide_number' in doc:
                print(f"   Slide: #{doc['slide_number']}")
            if 'keywords' in doc:
                print(f"   Keywords: {doc['keywords'][:100]}")

            # Show content preview
            content = doc.get('content', '')
            preview = content[:200] + "..." if len(content) > 200 else content
            print(f"   Preview: {preview}")
            print("   " + "-" * 58)

    def search_by_company(self, query: str, company: str, top_n: int = 5):
        """Search within a specific company's documents"""
        return self.cascading_search(
            query=query,
            namespace=GLOBAL_NAMESPACE,
            filters={"company": {"$eq": company}},
            rerank_top_n=top_n
        )

    def search_by_industry(self, query: str, industry: str, top_n: int = 5):
        """Search within a specific industry"""
        return self.cascading_search(
            query=query,
            namespace=GLOBAL_NAMESPACE,
            filters={"industry": {"$eq": industry}},
            rerank_top_n=top_n
        )

    def get_index_stats(self):
        """Get statistics for both indexes"""
        print("\n📊 Index Statistics")
        print("=" * 60)

        for index_name in [DENSE_INDEX_NAME, SPARSE_INDEX_NAME]:
            try:
                stats = self.pc.describe_index_stats(index_name)
                print(f"\n{index_name}:")
                print(f"   Total records: {stats.get('totalRecordCount', 0)}")

                namespaces = stats.get('namespaces', {})
                print(f"   Namespaces: {len(namespaces)}")
                for ns_name, ns_info in namespaces.items():
                    print(f"      - {ns_name}: {ns_info.get('recordCount', 0)} records")
            except Exception as e:
                print(f"\n{index_name}: Error - {e}")


def main():
    """Main CLI interface"""
    import sys

    manager = DeckBotIndexManager()

    if len(sys.argv) < 2:
        print("""
DeckBot Unified Index Manager

Commands:
  setup                           - Create indexes
  ingest <path>                   - Ingest single metadata JSON
  ingest-all                      - Ingest all files from output/
  search <query>                  - Search all documents
  search-company <company> <query> - Search by company
  search-industry <industry> <query> - Search by industry
  stats                           - Show index statistics

Examples:
  python deckbot_unified_index.py setup
  python deckbot_unified_index.py ingest output/ilgram_DB_insurance_0529_metadata.json
  python deckbot_unified_index.py ingest-all
  python deckbot_unified_index.py search "유튜버 협업 마케팅"
  python deckbot_unified_index.py search-company "DB손해보험" "캠페인 전략"
  python deckbot_unified_index.py stats
        """)
        return

    command = sys.argv[1]

    if command == "setup":
        manager.setup_indexes()

    elif command == "ingest" and len(sys.argv) > 2:
        metadata_path = sys.argv[2]
        manager.ingest_pdf_metadata(metadata_path)

    elif command == "ingest-all":
        manager.ingest_bulk()

    elif command == "search" and len(sys.argv) > 2:
        query = " ".join(sys.argv[2:])
        manager.cascading_search(query)

    elif command == "search-company" and len(sys.argv) > 3:
        company = sys.argv[2]
        query = " ".join(sys.argv[3:])
        manager.search_by_company(query, company)

    elif command == "search-industry" and len(sys.argv) > 3:
        industry = sys.argv[2]
        query = " ".join(sys.argv[3:])
        manager.search_by_industry(query, industry)

    elif command == "stats":
        manager.get_index_stats()

    else:
        print(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
