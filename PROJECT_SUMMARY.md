# Crypto Tax Calculator - Project Summary

## Overview

A comprehensive cryptocurrency tax calculation platform that fetches on-chain transaction data, classifies transactions, calculates tax obligations using FIFO cost basis, and provides personalized tax-saving strategies.

## Technology Stack

### Backend (NestJS)
- **Framework**: NestJS (Node.js)
- **Database**: SQLite with Prisma ORM
- **Blockchain Data**: DRPC + Etherscan APIs
- **Language**: TypeScript

### Frontend (Planned)
- **Framework**: Next.js (recommended)
- **Pages**: Landing, Loading, Report
- **API Integration**: REST API with polling/SSE

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  Landing Page → Loading Page → Report Page (Results + Tips) │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend (NestJS)                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Report Orchestrator                      │  │
│  │         (Manages async job processing)                │  │
│  └───────────┬──────────────────────────────────────────┘  │
│              │                                               │
│    ┌─────────▼─────────┐                                    │
│    │  1. Indexer       │  Fetch on-chain data               │
│    │     (DRPC/        │  - Transactions                    │
│    │     Etherscan)    │  - Receipts & logs                 │
│    └─────────┬─────────┘  - ERC20 transfers                 │
│              │                                               │
│    ┌─────────▼─────────┐                                    │
│    │  2. Classifier    │  Categorize transactions           │
│    │                   │  - DISPOSAL (swaps)                │
│    │                   │  - STAKING (rewards)               │
│    │                   │  - AIRDROP (free tokens)           │
│    │                   │  - TRANSFER (moves)                │
│    │                   │  - DEDUCTION (gas)                 │
│    └─────────┬─────────┘                                    │
│              │                                               │
│    ┌─────────▼─────────┐                                    │
│    │  3. Pricer        │  Price in USD                      │
│    │     (CoinMarket   │  - Historical prices               │
│    │      Cap)         │  - Stablecoin detection            │
│    └─────────┬─────────┘  - Price caching                   │
│              │                                               │
│    ┌─────────▼─────────┐                                    │
│    │  4. Tax Engine    │  Calculate taxes                   │
│    │     (FIFO)        │  - Cost basis tracking             │
│    │                   │  - Realized P&L                    │
│    │                   │  - Short/Long term gains           │
│    │                   │  - Ordinary income                 │
│    └─────────┬─────────┘                                    │
│              │                                               │
│    ┌─────────▼─────────┐                                    │
│    │  5. Advisor       │  Strategy recommendations          │
│    │     (Rule-based)  │  - Loss harvesting                 │
│    │                   │  - Holding period optimization     │
│    │                   │  - Gain harvesting                 │
│    └───────────────────┘  - Fee deductions                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   SQLite DB  │
                  │   (Prisma)   │
                  └──────────────┘
```

## Database Schema

### Core Tables

1. **Job** - Tracks report generation progress
   - Stores: address, year, stage, progress percentage
   - Stages: PENDING → FETCHING_TX → CLASSIFYING → PRICING → CALCULATING → DONE

2. **Transaction** - Raw blockchain data
   - Stores: hash, block, timestamp, from, to, value, gas, logs

3. **TaxEvent** - Classified transactions with USD values
   - Stores: category, tokens in/out, amounts, USD values, P&L

4. **Report** - Final tax calculations
   - Stores: income, gains, losses, tax due, strategy cards

5. **CostLot** - FIFO cost basis tracking
   - Stores: acquisition date, amount, cost basis, remaining amount

6. **PriceCache** - Token price history
   - Stores: token, timestamp, USD price, source

## API Endpoints

### POST /api/report
Create a new tax report job
```json
Request:
{
  "address": "0x...",
  "year": 2025
}

Response:
{
  "jobId": "uuid"
}
```

### GET /api/report/:jobId/status
Poll for job progress
```json
Response:
{
  "jobId": "uuid",
  "stage": "CALCULATING",
  "progressPct": 75
}
```

### GET /api/report/:jobId/result
Get final report
```json
Response:
{
  "summary": {
    "ordinaryIncome": "5000.00",
    "capitalGainRealized": "12500.00",
    "estimatedTaxDue": "4575.00",
    ...
  },
  "strategyCards": [...],
  "events": [...]
}
```

## Tax Calculation Logic

### Transaction Categories

1. **DISPOSAL** (Capital Gains Event)
   - Token swaps on DEXes (Uniswap V2)
   - Selling crypto for stablecoins
   - Tax: Capital gains (short-term 30% / long-term 15%)

2. **STAKING** (Ordinary Income)
   - Staking rewards (Lido, StakeWise)
   - Validator rewards
   - Tax: Ordinary income (30%)

3. **AIRDROP** (Ordinary Income)
   - Free token distributions
   - Tokens received without payment
   - Tax: Ordinary income (30%) at FMV

4. **TRANSFER** (Non-taxable)
   - Wallet-to-wallet transfers
   - Self-transfers
   - Tax: None (but tracks cost basis)

5. **DEDUCTION** (Reduces Tax)
   - Gas fees on transactions
   - Reduces capital gains on sales

### Cost Basis Method: FIFO

```
Example:
- Buy 1 ETH @ $2000 on Jan 1
- Buy 1 ETH @ $2500 on Feb 1
- Sell 1.5 ETH @ $3000 on Mar 1

Calculation (FIFO):
- First 1 ETH: Cost $2000, Proceeds $3000, Gain $1000
- Next 0.5 ETH: Cost $1250, Proceeds $1500, Gain $250
- Total Gain: $1250
- Holding period: Jan 1 - Mar 1 (short-term)
- Tax (30%): $375
```

### Tax Rates (Configurable)

- **Ordinary Income**: 30%
  - Airdrops, staking rewards, mining

- **Short-term Capital Gains**: 30%
  - Assets held < 365 days

- **Long-term Capital Gains**: 15%
  - Assets held ≥ 365 days

## Tax-Saving Strategies

The Advisor module generates personalized strategy cards:

### 1. Loss Harvesting
**Trigger**: Realized gains > 0 and portfolio has unrealized losses
**Strategy**: Sell losing positions to offset gains
**Savings**: Up to 30% of harvested losses

### 2. Holding Period Optimization
**Trigger**: Positions approaching 365 days with gains
**Strategy**: Wait for long-term status
**Savings**: 15% rate difference (30% → 15%)

### 3. Gain Harvesting
**Trigger**: Capital losses offset available gains
**Strategy**: Realize gains tax-free, reset cost basis higher
**Savings**: Future tax reduction

### 4. High Ordinary Income
**Trigger**: Airdrop/staking income > threshold
**Strategy**: Time reward claims strategically
**Advice**: Manage tax bracket impact

### 5. Gas Fee Deduction
**Trigger**: High gas fees paid
**Strategy**: Ensure proper documentation
**Savings**: 30% of gas fees

## Supported Protocols (MVP)

1. **Uniswap V2**
   - Token swaps
   - Liquidity provision (basic)

2. **Lido**
   - ETH staking
   - stETH rewards

3. **Generic ERC20**
   - Transfers
   - Airdrops (heuristic detection)

## Environment Setup

### Required API Keys

1. **DRPC_KEY**
   - Purpose: Ethereum RPC access
   - Get: https://drpc.org

2. **ETHERSCAN_KEY**
   - Purpose: Transaction list API
   - Get: https://etherscan.io/apis

3. **COINMARKETCAP_API_KEY** (Optional)
   - Purpose: Historical price data
   - Get: https://coinmarketcap.com/api

### Configuration (.env)

```env
DRPC_KEY=your_drpc_key_here
ETHERSCAN_KEY=your_etherscan_key_here
COINMARKETCAP_API_KEY=your_coinmarketcap_key_here

DATABASE_URL=file:./dev.db
PORT=3000
NODE_ENV=development
```

## Getting Started

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys
npx prisma generate
npx prisma db push
npm run start:dev
```

The API will be available at `http://localhost:3000`

### Frontend Setup (To Be Built)

```bash
cd frontend
npm install
npm run dev
```

Frontend will connect to backend API at `http://localhost:3000`

## Project Status

### ✅ Completed
- [x] NestJS backend architecture
- [x] Database schema with Prisma
- [x] Indexer module (DRPC + Etherscan)
- [x] Classifier module (transaction categorization)
- [x] Pricer module (USD pricing with caching)
- [x] Tax Engine (FIFO, P&L calculation)
- [x] Advisor module (tax strategies)
- [x] REST API endpoints
- [x] Async job processing
- [x] Environment configuration

### 🚧 To Do
- [ ] Frontend (Next.js)
  - [ ] Landing page (address + year input)
  - [ ] Loading page (progress indicator)
  - [ ] Report page (results + strategies)
- [ ] Testing
  - [ ] Unit tests for each module
  - [ ] Integration tests
  - [ ] E2E tests
- [ ] Deployment
  - [ ] Docker containerization
  - [ ] CI/CD pipeline

### 🔮 Future Enhancements
- Multi-chain support (Polygon, Arbitrum, etc.)
- More DeFi protocols (Aave, Compound, Curve)
- NFT transaction support
- PDF report generation
- CSV export for tax filing
- Real-time price feeds
- Wash sale rule implementation
- Alternative cost basis methods (LIFO, HIFO)

## Development Notes

### Code Structure

```
backend/
├── src/
│   ├── prisma/          # Database service
│   ├── indexer/         # Blockchain data fetching
│   ├── classifier/      # Transaction categorization
│   ├── pricer/          # USD pricing
│   ├── tax-engine/      # Tax calculations
│   ├── advisor/         # Strategy generation
│   ├── report/          # API endpoints
│   ├── app.module.ts    # Main app module
│   └── main.ts          # Entry point
├── prisma/
│   └── schema.prisma    # Database schema
└── .env                 # Environment variables
```

### Key Design Decisions

1. **Async Processing**: Reports are generated asynchronously with progress tracking
2. **FIFO Only**: MVP uses only FIFO for cost basis (simpler, most common)
3. **SQLite**: Lightweight database for hackathon/demo (can upgrade to PostgreSQL)
4. **Price Approximation**: Uses yearly averages for MVP (can add real-time APIs)
5. **Rule-based Advisor**: No AI/ML for MVP (predictable, reliable)

## Testing the API

```bash
# Create a report
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{"address":"0x86973F6C0Ad9D1A1519254f2b89CB341865E8B4E","year":2025}'

# Get status
curl http://localhost:3000/api/report/{jobId}/status

# Get result
curl http://localhost:3000/api/report/{jobId}/result
```

## License

MIT

## Contributors

Built for the crypto tax calculation hackathon.
