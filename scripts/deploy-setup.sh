#!/bin/bash

echo "🚀 Crypto Tax Calculator - Deployment Setup"
echo "============================================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

echo ""
echo "✅ Prerequisites installed!"
echo ""
echo "Next steps:"
echo "1. Create Neon database: https://neon.tech"
echo "2. Update backend/.env with DATABASE_URL"
echo "3. Run: cd backend && npx prisma db push"
echo "4. Deploy backend: railway login && railway up"
echo "5. Deploy frontend: cd frontend && vercel"
echo ""
echo "For detailed instructions, see: DEPLOYMENT_PLAN.md"
