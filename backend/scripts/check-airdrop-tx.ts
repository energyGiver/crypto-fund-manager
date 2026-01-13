/**
 * Check if airdrop transaction exists in database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targetTxHash = '0xf26797dc0957d533c98ab7dbe7c45dfe0538a9ccb5cac2bb45af49b415335c3a';

  // Check if transaction exists
  const tx = await prisma.transaction.findFirst({
    where: {
      txHash: targetTxHash
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('AIRDROP TRANSACTION CHECK');
  console.log('='.repeat(80));
  console.log(`\nTransaction hash: ${targetTxHash}`);
  console.log(`Found in database: ${tx ? 'YES ✓' : 'NO ✗'}`);

  if (tx) {
    console.log(`\nDetails:`);
    console.log(`  Block: ${tx.blockNumber}`);
    console.log(`  Timestamp: ${tx.timestamp}`);
    console.log(`  From: ${tx.from}`);
    console.log(`  To: ${tx.to}`);
    console.log(`  Job ID: ${tx.jobId}`);
    console.log(`  Status: ${tx.status}`);

    // Check if it was classified
    const taxEvent = await prisma.taxEvent.findFirst({
      where: {
        txHash: targetTxHash
      }
    });

    console.log(`\nTax Event:`);
    if (taxEvent) {
      console.log(`  Category: ${taxEvent.category}`);
      console.log(`  Token In: ${taxEvent.tokenIn} (${taxEvent.tokenInAmount})`);
      console.log(`  Token In USD: ${taxEvent.tokenInUsd}`);
      console.log(`  Notes: ${taxEvent.notes}`);
    } else {
      console.log(`  Not classified yet ✗`);
    }
  } else {
    console.log(`\nThis transaction was not captured during indexing.`);
    console.log(`Possible reasons:`);
    console.log(`  1. fetchTokenTransfers may not have been called`);
    console.log(`  2. Transaction didn't match the time range filter`);
    console.log(`  3. Etherscan API didn't return it in tokentx`);
  }

  // Check how many transactions were captured for this job
  const latestJob = await prisma.job.findFirst({
    where: {
      address: '0x444444a7eef5c5182a29e76f69814e324e6621fc'
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (latestJob) {
    const txCount = await prisma.transaction.count({
      where: { jobId: latestJob.id }
    });

    console.log(`\n\nLatest job for address 0x444444a7...:`);
    console.log(`  Job ID: ${latestJob.id}`);
    console.log(`  Year/Month: ${latestJob.year}${latestJob.month ? `-${latestJob.month}` : ''}`);
    console.log(`  Total transactions: ${txCount}`);
    console.log(`  Stage: ${latestJob.stage}`);
    console.log(`  Progress: ${latestJob.progressPct}%`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
