# Quick Start Guide

Get the Crypto Tax Calculator running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- DRPC API key ([Get one here](https://drpc.org))
- Etherscan API key ([Get one here](https://etherscan.io/apis))

## Setup Steps

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your API keys
# Required:
DRPC_KEY=your_drpc_key_here
ETHERSCAN_KEY=your_etherscan_key_here

# Optional (for better pricing):
COINMARKETCAP_API_KEY=your_coinmarketcap_key_here
```

### 3. Setup Database

```bash
# Generate Prisma client
npx prisma generate --schema=./prisma/schema.prisma

# Create database
npx prisma db push --schema=./prisma/schema.prisma
```

### 4. Start the Server

**Option A: Using the run script (recommended)**
```bash
./RUN.sh
```

**Option B: Manual**
```bash
# Development mode (with hot reload)
npm run start:dev

# The server will start at http://localhost:3000
```

## Test the API

### 1. Create a Report

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x86973F6C0Ad9D1A1519254f2b89CB341865E8B4E",
    "year": 2025
  }'
```

Response:
```json
{
  "jobId": "some-uuid-here"
}
```

### 2. Check Status

```bash
curl http://localhost:3000/api/report/{jobId}/status
```

Response:
```json
{
  "jobId": "some-uuid-here",
  "stage": "CALCULATING",
  "progressPct": 75,
  "etaHint": null,
  "errors": null
}
```

Stages:
- `PENDING` - Job created
- `FETCHING_TX` - Downloading blockchain data
- `CLASSIFYING` - Categorizing transactions
- `PRICING` - Getting USD prices
- `CALCULATING` - Computing taxes
- `DONE` - Complete!

### 3. Get Results

```bash
curl http://localhost:3000/api/report/{jobId}/result
```

Response:
```json
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
    "estimatedTaxDue": "4575.00"
  },
  "strategyCards": [
    {
      "title": "Tax-Loss Harvesting Opportunity",
      "body": "...",
      "estimatedSavings": "$1200.00",
      "priority": "high",
      "actions": ["..."]
    }
  ],
  "events": [...]
}
```

## Understanding the Results

### Summary Metrics

- **ordinaryIncome**: Total income from airdrops and staking (taxed at 30%)
- **capitalGainRealized**: Total realized gains/losses from selling/swapping
- **shortTermGain**: Gains from assets held < 365 days (taxed at 30%)
- **longTermGain**: Gains from assets held ≥ 365 days (taxed at 15%)
- **totalGasFee**: Total gas fees paid (deductible)
- **estimatedTaxDue**: Total estimated tax owed

### Strategy Cards

Each card provides:
- **title**: Name of the strategy
- **body**: Detailed explanation
- **estimatedSavings**: Potential tax savings
- **priority**: high / medium / low
- **actions**: Specific steps to take

### Events

List of all transactions with:
- Transaction hash
- Date and category
- Tokens in/out with amounts
- USD values
- Realized gain/loss (if applicable)
- Protocol used

## Common Issues

### "Module not found" errors

```bash
# Make sure you ran:
npm install
npx prisma generate
```

### "Database not found" errors

```bash
# Create the database:
npx prisma db push
```

### "Invalid API key" errors

```bash
# Check your .env file has valid keys:
cat .env

# Make sure DRPC_KEY and ETHERSCAN_KEY are set
```

### No transactions found

This can happen if:
- The address had no transactions in that year
- The year is before the address was created
- API rate limits were hit (try again in a few minutes)

## Next Steps

### Build the Frontend

Create a Next.js frontend that:
1. Collects address and year from user
2. Calls POST /api/report
3. Polls GET /api/report/:jobId/status
4. Displays GET /api/report/:jobId/result

See `PROJECT_SUMMARY.md` for architecture details.

### Customize Tax Rates

Edit `src/tax-engine/tax-engine.service.ts`:

```typescript
private readonly ORDINARY_INCOME_TAX_RATE = 0.30;  // 30%
private readonly SHORT_TERM_CG_RATE = 0.30;        // 30%
private readonly LONG_TERM_CG_RATE = 0.15;         // 15%
```

### Add More Protocols

1. Identify contract addresses and method signatures
2. Add detection logic in `src/classifier/classifier.service.ts`
3. Update transaction parsing for that protocol

### Deploy to Production

```bash
# Build
npm run build

# Run production server
npm run start:prod

# Or use Docker (see backend/README.md)
```

## Learn More

- Full documentation: `backend/README.md`
- Architecture overview: `PROJECT_SUMMARY.md`
- Database schema: `backend/prisma/schema.prisma`

## Support

For issues or questions:
1. Check the README files
2. Review the code comments
3. Create an issue in the repository

---

Happy tax calculating! 🧮📊
