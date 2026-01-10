#!/bin/bash

echo "🚀 Starting Crypto Tax Calculator Backend..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and add your API keys:"
    echo "  cp .env.example .env"
    echo "  # Then edit .env with your DRPC_KEY and ETHERSCAN_KEY"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma

# Push database schema
echo "💾 Setting up database..."
npx prisma db push --schema=./prisma/schema.prisma

# Start the server
echo "✅ Starting development server..."
echo ""
npm run start:dev
