# 🎉 Crypto Tax Calculator - Complete Setup Guide

Full-stack cryptocurrency tax calculator with on-chain analysis and tax-saving strategies.

## Project Structure

```
luxembourg/
├── backend/          # NestJS API server
│   ├── src/
│   │   ├── prisma/         # Database service
│   │   ├── indexer/        # Blockchain data fetching (DRPC + Etherscan)
│   │   ├── classifier/     # Transaction categorization
│   │   ├── pricer/         # USD pricing (CoinMarketCap)
│   │   ├── tax-engine/     # FIFO cost basis & P&L
│   │   ├── advisor/        # Tax-saving strategies
│   │   └── report/         # API endpoints
│   └── prisma/
│       └── schema.prisma   # Database models
│
├── frontend/         # Next.js web app
│   ├── app/
│   │   ├── page.tsx                 # Landing page
│   │   ├── loading/[jobId]/         # Progress tracking
│   │   └── report/[jobId]/          # Tax report
│   ├── components/                   # Reusable UI
│   └── lib/                          # API client
│
├── PROJECT_SUMMARY.md
├── QUICKSTART.md
└── FINAL_SETUP.md (this file)
```

## 🚀 Quick Start (5 minutes)

### 1. Start Backend

```bash
cd backend
npm install
npx prisma generate --schema=./prisma/schema.prisma
npx prisma db push --schema=./prisma/schema.prisma
npm run start:dev
```

Backend runs on `http://localhost:3000`

### 2. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3001`

### 3. Test It!

Open `http://localhost:3001` in your browser:

1. Enter address: `0x86973F6C0Ad9D1A1519254f2b89CB341865E8B4E`
2. Year: `2025`
3. Click "Calculate Taxes"
4. Watch the progress
5. View your tax report!

## Environment Variables

### Backend (.env)

```env
# Required
DRPC_KEY=your_drpc_key_here
ETHERSCAN_KEY=your_etherscan_key_here

# Optional
COINMARKETCAP_API_KEY=your_coinmarketcap_key_here

# Auto-configured
DATABASE_URL="file:./dev.db"
PORT=3000
FRONTEND_URL=http://localhost:3001
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## API Endpoints

### Create Tax Report
```bash
POST http://localhost:3000/api/report
Content-Type: application/json

{
  "address": "0x86973F6C0Ad9D1A1519254f2b89CB341865E8B4E",
  "year": 2025
}
```

### Check Status
```bash
GET http://localhost:3000/api/report/:jobId/status
```

### Get Results
```bash
GET http://localhost:3000/api/report/:jobId/result
```

## Features

### Backend
- ✅ On-chain transaction fetching (DRPC + Etherscan)
- ✅ Automatic transaction classification
  - Swaps/Disposals (Uniswap V2)
  - Staking (Lido)
  - Airdrops
  - Transfers
  - Gas fees
- ✅ USD pricing with CoinMarketCap
- ✅ FIFO cost basis tracking
- ✅ Short-term vs long-term capital gains
- ✅ Ordinary income calculation
- ✅ Tax-saving strategies:
  - Loss harvesting
  - Holding period optimization
  - Gain harvesting
  - Gas fee deductions

### Frontend
- ✅ Dark cinematic UI
- ✅ Responsive design
- ✅ Real-time progress tracking
- ✅ Interactive tax report
- ✅ Strategy cards with actionable steps
- ✅ Transaction filtering

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TypeScript |
| Backend | NestJS 11, TypeScript |
| Database | SQLite, Prisma ORM 5.x |
| Blockchain | ethers.js 5.7.2, DRPC, Etherscan API |
| Pricing | CoinMarketCap API |

## Database Models

- **Job**: Report generation tracking
- **Transaction**: Raw blockchain data
- **TaxEvent**: Classified tax events
- **Report**: Final tax summary
- **CostLot**: FIFO cost basis tracking
- **PriceCache**: Historical token prices

## Tax Calculation

### Categories
1. **DISPOSAL** → Capital Gains (swap/sell)
2. **STAKING** → Ordinary Income (rewards)
3. **AIRDROP** → Ordinary Income (free tokens)
4. **TRANSFER** → Non-taxable
5. **DEDUCTION** → Gas fees

### Tax Rates
- Ordinary Income: 30%
- Short-term Capital Gains (<365 days): 30%
- Long-term Capital Gains (≥365 days): 15%

## Development Workflow

### Backend Development

```bash
cd backend

# Watch mode
npm run start:dev

# Build
npm run build

# Production
npm run start:prod
```

### Frontend Development

```bash
cd frontend

# Development server
npm run dev

# Build
npm run build

# Production server
npm run start
```

## Troubleshooting

### Backend won't start

```bash
# Regenerate Prisma client
cd backend
npx prisma generate --schema=./prisma/schema.prisma

# Reset database
rm dev.db
npx prisma db push --schema=./prisma/schema.prisma
```

### Frontend shows API errors

Check:
1. Backend is running on port 3000
2. `.env.local` has correct `NEXT_PUBLIC_API_URL`
3. CORS is enabled (already configured)

### No transactions found

This is normal if:
- The address had no transactions in that year
- API rate limits were hit (wait a few minutes)
- Invalid Ethereum address format

## Deployment

### Backend (Railway, Render, Fly.io)

```bash
# Build
npm run build

# Start
npm run start:prod
```

Environment variables needed:
- `DRPC_KEY`
- `ETHERSCAN_KEY`
- `DATABASE_URL` (use PostgreSQL for production)

### Frontend (Vercel, Netlify)

```bash
npm run build
```

Environment variables:
- `NEXT_PUBLIC_API_URL=https://your-api-url.com`

## Next Steps

### Immediate Enhancements
- [ ] Add more DeFi protocols (Aave, Compound)
- [ ] Support more chains (Polygon, Arbitrum)
- [ ] PDF export
- [ ] CSV download for tax filing
- [ ] User authentication

### Future Features
- [ ] Multi-wallet support
- [ ] Historical portfolio tracking
- [ ] Real-time price updates
- [ ] NFT transaction support
- [ ] Advanced cost basis methods (LIFO, HIFO)

## Support

For issues or questions:
- Backend docs: `backend/README.md`
- Frontend docs: `frontend/README.md`
- Full architecture: `PROJECT_SUMMARY.md`
- Quick start: `QUICKSTART.md`

## License

MIT

---

Built with ❤️ for the crypto tax calculation hackathon
