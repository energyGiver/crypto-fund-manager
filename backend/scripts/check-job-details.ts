/**
 * Check job details
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobId = process.argv[2] || '766f0378-c996-40be-9178-73307b6dddd0';

  const job = await prisma.job.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    console.log(`Job ${jobId} not found`);
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('JOB DETAILS');
  console.log('='.repeat(80));
  console.log(`\nJob ID: ${job.id}`);
  console.log(`Address: ${job.address}`);
  console.log(`Year: ${job.year}`);
  console.log(`Month: ${job.month}`);
  console.log(`Network: ${job.network}`);
  console.log(`Stage: ${job.stage}`);
  console.log(`Progress: ${job.progressPct}%`);
  console.log(`Created: ${job.createdAt}`);

  const txCount = await prisma.transaction.count({
    where: { jobId: job.id }
  });

  console.log(`\nTransactions: ${txCount}`);

  // Check a few transactions
  const transactions = await prisma.transaction.findMany({
    where: { jobId: job.id },
    orderBy: { blockNumber: 'desc' },
    take: 5
  });

  console.log(`\nLast 5 transactions:`);
  transactions.forEach(tx => {
    console.log(`  ${tx.txHash.slice(0, 20)}... block ${tx.blockNumber} @ ${tx.timestamp}`);
  });

  // Check for specific airdrop tx
  const airdropTx = await prisma.transaction.findFirst({
    where: {
      jobId: job.id,
      txHash: '0xf26797dc0957d533c98ab7dbe7c45dfe0538a9ccb5cac2bb45af49b415335c3a'
    }
  });

  console.log(`\nAirdrop tx (0xf26797dc...) in this job: ${airdropTx ? 'YES ✓' : 'NO ✗'}`);

  // Check tax events
  const taxEventCount = await prisma.taxEvent.count({
    where: { jobId: job.id }
  });

  console.log(`\nTax Events: ${taxEventCount}`);

  // Count by category
  const disposals = await prisma.taxEvent.count({
    where: { jobId: job.id, category: 'DISPOSAL' }
  });

  const airdrops = await prisma.taxEvent.count({
    where: { jobId: job.id, category: 'AIRDROP' }
  });

  const transfers = await prisma.taxEvent.count({
    where: { jobId: job.id, category: 'TRANSFER' }
  });

  console.log(`  DISPOSAL: ${disposals}`);
  console.log(`  AIRDROP: ${airdrops}`);
  console.log(`  TRANSFER: ${transfers}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
