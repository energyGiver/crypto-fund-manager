/**
 * Check held tokens and unrealized gains
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const address = '0x444444a7eef5c5182a29e76f69814e324e6621fc';

  // Get all undisposed cost lots
  const lots = await prisma.costLot.findMany({
    where: {
      address: address.toLowerCase(),
      disposed: false,
      remainingAmount: { gt: '0' },
    },
    orderBy: { acquiredDate: 'desc' },
  });

  console.log('\n' + '='.repeat(80));
  console.log('HELD TOKENS (UNDISPOSED COST LOTS)');
  console.log('='.repeat(80));
  console.log(`\nTotal held positions: ${lots.length}\n`);

  // Group by token
  const byToken = new Map<string, typeof lots>();
  for (const lot of lots) {
    const token = lot.tokenAddress.toLowerCase();
    if (!byToken.has(token)) {
      byToken.set(token, []);
    }
    byToken.get(token)!.push(lot);
  }

  console.log(`Unique tokens held: ${byToken.size}\n`);

  for (const [tokenAddress, tokenLots] of byToken) {
    const firstLot = tokenLots[0];
    const totalCostBasis = tokenLots.reduce((sum, lot) => sum + parseFloat(lot.costBasisUsd), 0);

    console.log(`\nToken: ${firstLot.tokenSymbol}`);
    console.log(`  Address: ${tokenAddress}`);
    console.log(`  Lots: ${tokenLots.length}`);
    console.log(`  Total cost basis: $${totalCostBasis.toFixed(2)}`);

    tokenLots.forEach((lot, i) => {
      console.log(`    Lot ${i+1}: ${lot.remainingAmount} (cost basis: $${lot.costBasisUsd})`);
      console.log(`           Acquired: ${lot.acquiredDate.toISOString()}`);
      console.log(`           Tx: ${lot.acquiredTxHash.slice(0, 20)}...`);
    });
  }

  // Check latest report
  const latestJob = await prisma.job.findFirst({
    where: {
      address: address.toLowerCase(),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (latestJob) {
    const report = await prisma.report.findFirst({
      where: { jobId: latestJob.id },
    });

    if (report) {
      console.log('\n' + '='.repeat(80));
      console.log('LATEST REPORT');
      console.log('='.repeat(80));
      console.log(`\nUnrealized Gains: $${report.capitalGainUnrealizedUsd}`);
      console.log(`Realized Gains: $${report.capitalGainRealizedUsd}`);
      console.log(`Ordinary Income: $${report.ordinaryIncomeUsd}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
