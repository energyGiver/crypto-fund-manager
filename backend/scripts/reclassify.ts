/**
 * Reclassify transactions for a specific address
 */

import { PrismaClient } from '@prisma/client';
import { ClassifierService } from '../src/classifier/classifier.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PricingService } from '../src/pricing/pricing.service';

const prisma = new PrismaService();
const pricingService = new PricingService(prisma);

async function main() {
  const address = '0x444444a7eef5c5182a29e76f69814e324e6621fc'.toLowerCase();

  // Find job
  const job = await prisma.job.findFirst({
    where: { address },
    orderBy: { createdAt: 'desc' },
  });

  if (!job) {
    console.log('No job found for address:', address);
    return;
  }

  console.log(`\nReclassifying job: ${job.id}`);
  console.log(`Address: ${job.address}`);
  console.log(`Period: ${job.year}${job.month ? `-${job.month}` : ''}\n`);

  // Delete existing tax events
  await prisma.taxEvent.deleteMany({
    where: { jobId: job.id },
  });
  console.log('✓ Deleted existing tax events\n');

  // Create classifier service
  const classifier = new ClassifierService(prisma, pricingService);

  // Classify transactions
  console.log('Starting classification...\n');
  await classifier.classifyTransactions(job.id);

  // Check results
  const taxEvents = await prisma.taxEvent.findMany({
    where: { jobId: job.id },
  });

  console.log('\n' + '='.repeat(80));
  console.log('CLASSIFICATION RESULTS');
  console.log('='.repeat(80));

  const categoryCount = new Map<string, number>();
  taxEvents.forEach(e => {
    categoryCount.set(e.category, (categoryCount.get(e.category) || 0) + 1);
  });

  console.log(`\nTotal tax events: ${taxEvents.length}\n`);
  console.log('By category:');
  for (const [category, count] of categoryCount) {
    console.log(`  ${category}: ${count}`);
  }

  // Show some examples
  console.log('\n' + '='.repeat(80));
  console.log('SAMPLE EVENTS');
  console.log('='.repeat(80) + '\n');

  const disposals = taxEvents.filter(e => e.category === 'DISPOSAL').slice(0, 3);
  if (disposals.length > 0) {
    console.log('DISPOSAL (Swap) examples:');
    disposals.forEach(e => {
      console.log(`  ${e.txHash}`);
      console.log(`    Out: ${e.tokenOut || 'N/A'} (${e.tokenOutAmount || 'N/A'})`);
      console.log(`    In:  ${e.tokenIn || 'N/A'} (${e.tokenInAmount || 'N/A'})`);
      console.log(`    Notes: ${e.notes || 'N/A'}`);
      console.log('');
    });
  }

  const airdrops = taxEvents.filter(e => e.category === 'AIRDROP').slice(0, 3);
  if (airdrops.length > 0) {
    console.log('AIRDROP/CLAIM examples:');
    airdrops.forEach(e => {
      console.log(`  ${e.txHash}`);
      console.log(`    Token: ${e.tokenIn || 'N/A'} (${e.tokenInAmount || 'N/A'})`);
      console.log(`    Notes: ${e.notes || 'N/A'}`);
      console.log('');
    });
  }

  console.log('✓ Reclassification complete!\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
