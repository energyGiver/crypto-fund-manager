/**
 * Test unrealized gains calculation
 */

import { PrismaClient } from '@prisma/client';
import { PricingService } from '../src/pricing/pricing.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaService();

class SimpleConfigService {
  get(key: string): string | undefined {
    return process.env[key];
  }
}

async function main() {
  const address = '0x444444a7eef5c5182a29e76f69814e324e6621fc';

  const configService = new SimpleConfigService() as any;
  const pricingService = new PricingService(prisma);

  console.log('\n' + '='.repeat(80));
  console.log('UNREALIZED GAINS CALCULATION TEST');
  console.log('='.repeat(80));

  // Get all undisposed lots
  const lots = await prisma.costLot.findMany({
    where: {
      address: address.toLowerCase(),
      disposed: false,
      remainingAmount: { gt: '0' },
    },
  });

  console.log(`\nTotal held positions: ${lots.length}\n`);

  // Group by token
  const lotsByToken = new Map<string, typeof lots>();
  for (const lot of lots) {
    const token = lot.tokenAddress.toLowerCase();
    if (!lotsByToken.has(token)) {
      lotsByToken.set(token, []);
    }
    lotsByToken.get(token)!.push(lot);
  }

  let totalUnrealizedGain = 0;

  // Test calculation for first few tokens
  let count = 0;
  for (const [tokenAddress, tokenLots] of lotsByToken) {
    if (count >= 5) break; // Test first 5 tokens
    count++;

    const symbol = tokenLots[0].tokenSymbol;
    const totalCostBasis = tokenLots.reduce((sum, lot) => {
      const remaining = ethers.BigNumber.from(lot.remainingAmount);
      const original = ethers.BigNumber.from(lot.amount);
      const costBasis = parseFloat(lot.costBasisUsd);
      return sum + (costBasis * remaining.toNumber() / original.toNumber());
    }, 0);

    console.log(`\n${count}. Token: ${symbol}`);
    console.log(`   Address: ${tokenAddress}`);
    console.log(`   Lots: ${tokenLots.length}`);
    console.log(`   Total cost basis: $${totalCostBasis.toFixed(2)}`);

    try {
      // Get current price
      const priceResult = await pricingService.getPriceAtTime(
        tokenAddress,
        new Date(),
        'ethereum',
      );

      const currentPrice = parseFloat(priceResult.priceUsd);
      console.log(`   Current price: $${currentPrice.toFixed(2)} (source: ${priceResult.source})`);

      // Calculate current value and unrealized gain
      const decimals = pricingService.getTokenDecimals(tokenAddress);

      let totalTokens = 0;
      for (const lot of tokenLots) {
        const remaining = ethers.BigNumber.from(lot.remainingAmount);
        const tokens = parseFloat(ethers.utils.formatUnits(remaining, decimals));
        totalTokens += tokens;
      }

      const currentValue = totalTokens * currentPrice;
      const unrealizedGain = currentValue - totalCostBasis;

      console.log(`   Total tokens: ${totalTokens.toFixed(4)}`);
      console.log(`   Current value: $${currentValue.toFixed(2)}`);
      console.log(`   Unrealized gain: $${unrealizedGain.toFixed(2)}`);

      totalUnrealizedGain += unrealizedGain;
    } catch (error) {
      console.log(`   ✗ ERROR: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`TOTAL UNREALIZED GAIN (first 5 tokens): $${totalUnrealizedGain.toFixed(2)}`);
  console.log('='.repeat(80));
}

main()
  .catch(error => {
    console.error('\n✗ ERROR:', error.message);
    console.error(error.stack);
  })
  .finally(() => prisma.$disconnect());
