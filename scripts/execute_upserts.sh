#!/bin/bash
# Execute all Pinecone upserts using MCP tool
# This is a tracking script - actual upserts will be done via MCP

CHUNKS_DIR="/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025/chunks"
DENSE_INDEX="deckbot-dense-korean"
SPARSE_INDEX="deckbot-sparse-korean"
DOC_NS="doc:ilgram_2025"
GLOBAL_NS="global"

echo "=================================="
echo "Pinecone Upsert Execution Plan"
echo "=================================="
echo ""
echo "Chunks to process:"
ls -1 "$CHUNKS_DIR" | grep "\.json$"
echo ""
echo "Total chunks: $(ls -1 "$CHUNKS_DIR"/*.json | wc -l | tr -d ' ')"
echo "Targets per chunk: 4"
echo "Total operations: $(($(ls -1 "$CHUNKS_DIR"/*.json | wc -l | tr -d ' ') * 4))"
echo ""
echo "Targets:"
echo "  1. $DENSE_INDEX / $DOC_NS"
echo "  2. $DENSE_INDEX / $GLOBAL_NS"
echo "  3. $SPARSE_INDEX / $DOC_NS"
echo "  4. $SPARSE_INDEX / $GLOBAL_NS"
echo ""
echo "✅ Ready to begin upsert operations"
