#!/usr/bin/env python3
"""
Hybrid Search Setup for Korean Insurance Deck
Based on Pinecone cascading retrieval pattern
"""

import os
from pinecone import Pinecone
import json

# Initialize Pinecone
pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))

# Index names
DENSE_INDEX = "ilgram-db-insurance-korean"
SPARSE_INDEX = "ilgram-db-insurance-korean-sparse"
NAMESPACE = "db-insurance-campaign"

def create_sparse_index():
    """Create sparse index for keyword search"""
    if not pc.has_index(SPARSE_INDEX):
        print(f"Creating sparse index: {SPARSE_INDEX}")
        pc.create_index_for_model(
            name=SPARSE_INDEX,
            embed={
                "model": "pinecone-sparse-english-v0",  # Works for Korean too
                "field_map": {"text": "content"}
            }
        )
        print("✅ Sparse index created")
    else:
        print(f"Sparse index {SPARSE_INDEX} already exists")

def upsert_to_sparse_index():
    """Upsert data to sparse index"""
    # Load formatted records
    with open('/Users/kjyoo/DeckBot/output/pinecone_records_formatted.json', 'r', encoding='utf-8') as f:
        records = json.load(f)

    sparse_index = pc.Index(SPARSE_INDEX)

    print(f"Upserting {len(records)} records to sparse index...")
    sparse_index.upsert_records(records=records, namespace=NAMESPACE)
    print("✅ Records upserted to sparse index")

def hybrid_search(query: str, top_k: int = 10, rerank_top_n: int = 5):
    """
    Perform hybrid search: dense + sparse + rerank

    Args:
        query: Search query in Korean
        top_k: Number of results from each index
        rerank_top_n: Final number of results after reranking
    """
    dense_index = pc.Index(DENSE_INDEX)
    sparse_index = pc.Index(SPARSE_INDEX)

    print(f"\n🔍 Searching for: {query}")
    print("=" * 50)

    # 1. Search dense index (semantic)
    print("\n1️⃣ Dense search (semantic)...")
    dense_results = dense_index.search(
        namespace=NAMESPACE,
        query={
            "top_k": top_k,
            "inputs": {"text": query}
        }
    )

    # 2. Search sparse index (keyword)
    print("2️⃣ Sparse search (keyword)...")
    sparse_results = sparse_index.search(
        namespace=NAMESPACE,
        query={
            "top_k": top_k,
            "inputs": {"text": query}
        }
    )

    # 3. Merge and deduplicate
    print("3️⃣ Merging results...")
    merged = merge_results(dense_results, sparse_results)

    # 4. Rerank
    print("4️⃣ Reranking...")
    final_results = pc.inference.rerank(
        model="bge-reranker-v2-m3",  # Best for multilingual
        query=query,
        documents=merged,
        rank_fields=["content"],
        top_n=rerank_top_n,
        return_documents=True
    )

    # Display results
    print(f"\n✅ Top {rerank_top_n} Results:")
    print("=" * 50)
    for i, result in enumerate(final_results.data, 1):
        doc = result['document']
        score = result['score']
        print(f"\n{i}. Score: {score:.4f}")
        print(f"   ID: {doc['_id']}")
        if 'slide_number' in doc:
            print(f"   Slide: {doc['slide_number']}")
        if 'keywords' in doc:
            print(f"   Keywords: {doc['keywords']}")
        print(f"   Content preview: {doc['content'][:150]}...")

    return final_results

def merge_results(dense_results, sparse_results):
    """Merge and deduplicate results from both indexes"""
    hits = {}

    # Add dense results
    for hit in dense_results['result']['hits']:
        hits[hit['_id']] = {
            '_id': hit['_id'],
            'content': hit['fields']['content'],
            '_score': hit['_score']
        }
        # Add other fields if present
        for key in ['keywords', 'slide_number', 'type']:
            if key in hit['fields']:
                hits[hit['_id']][key] = hit['fields'][key]

    # Add sparse results (update score if already exists)
    for hit in sparse_results['result']['hits']:
        if hit['_id'] in hits:
            # Average the scores if exists in both
            hits[hit['_id']]['_score'] = (hits[hit['_id']]['_score'] + hit['_score']) / 2
        else:
            hits[hit['_id']] = {
                '_id': hit['_id'],
                'content': hit['fields']['content'],
                '_score': hit['_score']
            }
            for key in ['keywords', 'slide_number', 'type']:
                if key in hit['fields']:
                    hits[hit['_id']][key] = hit['fields'][key]

    # Sort by score
    return sorted(hits.values(), key=lambda x: x['_score'], reverse=True)

def example_searches():
    """Run example searches"""
    queries = [
        "유튜버 협업 마케팅 전략",
        "소비자 참여 캠페인",
        "SNS 인증 방법",
        "보험 상품 출시 전략",
        "브랜드 신뢰도 구축"
    ]

    for query in queries:
        try:
            hybrid_search(query, top_k=10, rerank_top_n=3)
            print("\n" + "=" * 70 + "\n")
        except Exception as e:
            print(f"Error searching '{query}': {e}")

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "setup":
            # Setup: create sparse index and upsert data
            create_sparse_index()
            upsert_to_sparse_index()
            print("\n✅ Hybrid search setup complete!")

        elif command == "search":
            # Search with query
            if len(sys.argv) > 2:
                query = " ".join(sys.argv[2:])
                hybrid_search(query)
            else:
                print("Usage: python setup_hybrid_search.py search <query>")

        elif command == "examples":
            # Run example searches
            example_searches()

        else:
            print("Unknown command. Use: setup, search, or examples")
    else:
        print("""
Usage:
  python setup_hybrid_search.py setup      # Create sparse index and upsert data
  python setup_hybrid_search.py search <query>  # Search with hybrid approach
  python setup_hybrid_search.py examples   # Run example searches
        """)
