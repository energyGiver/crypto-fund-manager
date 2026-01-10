# Crypto Tax Calculator Backend

NestJS backend for calculating cryptocurrency taxes based on on-chain transaction data.

## Features

- **Indexer**: Fetches on-chain transaction data via DRPC and Etherscan APIs
- **Classifier**: Categorizes transactions into tax events (Disposal, Staking, Airdrop, Transfer, Deduction)
- **Pricer**: Determines USD fair market value at transaction time
- **Tax Engine**: Calculates cost basis using FIFO, computes realized/unrealized P&L
- **Advisor**: Generates personalized tax-saving strategy recommendations

## Architecture

```
┌─────────────────┐
│   Report API    │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Indexer │──► Fetch transactions from blockchain
    └────┬────┘
         │
    ┌────▼────────┐
    │ Classifier  │──► Categorize into tax events
    └────┬────────┘
         │
    ┌────▼────┐
    │ Pricer  │──► Add USD prices
    └────┬────┘
         │
    ┌────▼──────────┐
    │  Tax Engine   │──► Calculate P&L, cost basis
    └────┬──────────┘
         │
    ┌────▼────────┐
    │   Advisor   │──► Generate tax strategies
    └─────────────┘
```

## Setup

### Prerequisites

- Node.js 18+ and npm
- DRPC API key (for blockchain data)
- Etherscan API key (for transaction lists)
- CoinMarketCap API key (optional, for pricing)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```env
DRPC_KEY=your_drpc_key_here
ETHERSCAN_KEY=your_etherscan_key_here
COINMARKETCAP_API_KEY=your_coinmarketcap_key_here
```

3. Generate Prisma client and create database:
```bash
npx prisma generate
npx prisma db push
```

### Running the Application

Development mode:
```bash
npm run start:dev
```

Production mode:
```bash
npm run build
npm run start:prod
```

The server will start on `http://localhost:3000`

## API Endpoints

### Create Report
```http
POST /api/report
Content-Type: application/json

{
  "address": "0x86973F6C0Ad9D1A1519254f2b89CB341865E8B4E",
  "year": 2025
}

Response:
{
  "jobId": "uuid"
}
```

### Get Job Status
```http
GET /api/report/:jobId/status

Response:
{
  "jobId": "uuid",
  "stage": "CALCULATING",
  "progressPct": 75,
  "etaHint": null,
  "errors": null
}
```

Stages: `PENDING` → `FETCHING_TX` → `CLASSIFYING` → `PRICING` → `CALCULATING` → `DONE`

### Get Report Result
```http
GET /api/report/:jobId/result

Response:
{
  "status": "completed",
  "summary": {
    "address": "0x...",
    "year": 2025,
    "ordinaryIncome": "5000.00",
    "capitalGainRealized": "12500.00",
    "shortTermGain": "8000.00",
    "longTermGain": "4500.00",
    "totalGasFee": "350.00",
    "estimatedTaxDue": "4575.00",
    "taxRates": {
      "ordinaryIncome": 0.30,
      "shortTermCg": 0.30,
      "longTermCg": 0.15
    }
  },
  "strategyCards": [
    {
      "title": "Tax-Loss Harvesting Opportunity",
      "body": "...",
      "estimatedSavings": "$1200.00",
      "priority": "high",
      "actions": [...]
    }
  ],
  "events": [...]
}
```

## Database Schema

The application uses SQLite with Prisma ORM. Key models:

- **Job**: Tracks report generation progress
- **Transaction**: Raw blockchain transaction data
- **TaxEvent**: Classified tax events with USD values
- **Report**: Final tax calculations and summary
- **CostLot**: FIFO cost basis tracking
- **PriceCache**: Token price cache

## Tax Calculation Logic

### Categories

1. **DISPOSAL**: Swap/sell transactions (capital gains event)
2. **STAKING**: Staking rewards (ordinary income)
3. **AIRDROP**: Free token distributions (ordinary income)
4. **TRANSFER**: Non-taxable transfers
5. **DEDUCTION**: Gas fees

### Cost Basis Method

- **FIFO (First-In-First-Out)**: Default method for calculating cost basis
- Tracks acquisition date for short-term vs long-term determination
- 365+ days holding = long-term capital gains (15% rate)
- <365 days = short-term capital gains (30% rate)

### Tax Rates (Configurable)

- Ordinary income: 30%
- Short-term capital gains: 30%
- Long-term capital gains: 15%

## Tax-Saving Strategies

The Advisor module generates strategy cards based on:

1. **Loss Harvesting**: Offset gains with unrealized losses
2. **Holding Period Optimization**: Wait for long-term rates
3. **Gain Harvesting**: Utilize capital losses to realize gains tax-free
4. **Gas Fee Deduction**: Ensure proper documentation of fees

## Development

### Project Structure

```
src/
├── prisma/           # Database service
├── indexer/          # Blockchain data fetching
├── classifier/       # Transaction categorization
├── pricer/           # USD pricing
├── tax-engine/       # Tax calculations
├── advisor/          # Strategy generation
└── report/           # API endpoints & orchestration
```

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Deployment

### Environment Variables

Production environment should set:
```env
NODE_ENV=production
DATABASE_URL=file:./prod.db
PORT=3000
FRONTEND_URL=https://your-frontend-url.com
```

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build
CMD ["npm", "run", "start:prod"]
```

## Limitations & Future Enhancements

### Current Limitations (MVP)

- Only supports Ethereum mainnet
- Limited to Uniswap V2 and Lido protocols
- Simplified price fetching (approximations for some tokens)
- No support for NFTs or complex DeFi protocols

### Future Enhancements

- Multi-chain support (Polygon, Arbitrum, etc.)
- More DeFi protocols (Aave, Compound, Curve)
- Real-time price feeds integration
- PDF report generation
- CSV export for tax filing
- Support for wash sale rules
- Advanced cost basis methods (LIFO, HIFO)

## License

MIT
