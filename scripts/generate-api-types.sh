#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Generating TypeScript Types from OpenAPI"
echo "=========================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

OPENAPI_FILE="packages/api/swagger/v1/swagger.yaml"
OUTPUT_DIR="packages/web/src/types"
OUTPUT_FILE="$OUTPUT_DIR/api.ts"

# Check if OpenAPI spec exists
if [ ! -f "$OPENAPI_FILE" ]; then
    echo -e "${YELLOW}OpenAPI spec not found at $OPENAPI_FILE${NC}"
    echo ""
    echo "To generate the OpenAPI spec, run:"
    echo "  cd packages/api && bundle exec rails rswag:specs:swaggerize"
    echo ""

    # Try to generate it
    echo "Attempting to generate OpenAPI spec..."
    cd packages/api

    if bundle exec rails rswag:specs:swaggerize 2>/dev/null; then
        echo -e "${GREEN}OpenAPI spec generated${NC}"
        cd ../..
    else
        echo -e "${YELLOW}Could not generate OpenAPI spec. Make sure rswag is configured.${NC}"
        echo "Skipping type generation."
        exit 0
    fi
fi

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Check if openapi-typescript is installed
if ! command -v npx &> /dev/null; then
    echo -e "${RED}npx not found. Please install Node.js.${NC}"
    exit 1
fi

echo "Generating TypeScript types..."
echo "  Input:  $OPENAPI_FILE"
echo "  Output: $OUTPUT_FILE"
echo ""

# Generate types using openapi-typescript
cd packages/web
npx openapi-typescript "../api/swagger/v1/swagger.yaml" -o "src/types/api.ts" 2>/dev/null || {
    echo -e "${YELLOW}openapi-typescript not installed. Installing...${NC}"
    npm install -D openapi-typescript
    npx openapi-typescript "../api/swagger/v1/swagger.yaml" -o "src/types/api.ts"
}

cd ../..

echo ""
echo -e "${GREEN}TypeScript types generated successfully!${NC}"
echo "  Output: $OUTPUT_FILE"
echo ""
