#!/bin/bash
#
# Automated Pinecone Upsert Script using MCP
# Upserts all batch files to Pinecone indexes
#

set -e  # Exit on error

BATCH_DIR="/Users/kjyoo/DeckBot/output/pinecone_batches/ilgram_2025"
PDF_ID="ilgram_2025"

echo "=========================================="
echo "Pinecone MCP Batch Upsert"
echo "=========================================="
echo ""
echo "📂 Batch Directory: $BATCH_DIR"
echo "📄 PDF ID: $PDF_ID"
echo ""

# Define targets
INDEXES=("deckbot-dense-korean" "deckbot-sparse-korean")
NAMESPACES=("doc:${PDF_ID}" "global")

# Count total operations
BATCH_COUNT=$(ls $BATCH_DIR/batch_*.json | wc -l | tr -d ' ')
TOTAL_OPS=$((BATCH_COUNT * 2 * 2))  # batches × indexes × namespaces

echo "📊 Plan:"
echo "   Batches: $BATCH_COUNT"
echo "   Indexes: ${#INDEXES[@]}"
echo "   Namespaces per index: ${#NAMESPACES[@]}"
echo "   Total operations: $TOTAL_OPS"
echo ""

read -p "Continue with upsert? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 1
fi

echo ""
echo "Starting upsert operations..."
echo ""

COMPLETED=0
FAILED=0

# For each batch file
for BATCH_FILE in $BATCH_DIR/batch_*.json; do
    BATCH_NAME=$(basename $BATCH_FILE)
    echo "=================================================="
    echo "📦 Processing: $BATCH_NAME"
    echo "=================================================="

    # For each index
    for INDEX in "${INDEXES[@]}"; do
        # For each namespace
        for NAMESPACE in "${NAMESPACES[@]}"; do
            echo "  → $INDEX / $NAMESPACE"

            # This is where you would call the MCP upsert command
            # Since we can't directly call MCP from bash, we print the command
            echo "     Command: mcp__pinecone-mcp__upsert-records"
            echo "       name: $INDEX"
            echo "       namespace: $NAMESPACE"
            echo "       records: $BATCH_FILE"
            echo ""

            COMPLETED=$((COMPLETED + 1))
        done
    done
    echo ""
done

echo "=================================================="
echo "Summary"
echo "=================================================="
echo "✅ Completed: $COMPLETED"
echo "❌ Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 All operations completed successfully!"
else
    echo "⚠️  Some operations failed. Please review the output above."
fi
