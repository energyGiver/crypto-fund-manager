/**
 * Direct test of fetchTokenTransfers with updated code
 */

import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from '../src/indexer/indexer.service';
import { PrismaService } from '../src/prisma/prisma.service';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaService();

// Create a simple config service
class SimpleConfigService {
  get(key: string): string | undefined {
    return process.env[key];
  }
}

async function main() {
  const address = '0x444444a7eef5c5182a29e76f69814e324e6621fc';
  const targetTxHash = '0xf26797dc0957d533c98ab7dbe7c45dfe0538a9ccb5cac2bb45af49b415335c3a';

  // Delete existing job if any
  await prisma.job.deleteMany({
    where: {
      address: address.toLowerCase(),
      year: 2026,
      month: 1,
      network: 'ethereum',
    },
  });

  // Create a test job
  console.log('\n' + '='.repeat(80));
  console.log('TEST: fetchTokenTransfers with updated code');
  console.log('='.repeat(80));

  const job = await prisma.job.create({
    data: {
      address: address.toLowerCase(),
      year: 2026,
      month: 1,
      network: 'ethereum',
      stage: 'FETCHING_TX',
      progressPct: 0,
    },
  });

  console.log(`\nCreated test job: ${job.id}`);

  // Create indexer service
  const configService = new SimpleConfigService() as any;
  const indexer = new IndexerService(configService, prisma);

  // Call fetchTokenTransfers
  console.log(`\nCalling fetchTokenTransfers...`);
  await indexer.fetchTokenTransfers(address, 2026, 1, 'ethereum', job.id);

  // Check if transaction was saved
  const tx = await prisma.transaction.findFirst({
    where: {
      jobId: job.id,
      txHash: targetTxHash,
    },
  });

  console.log(`\n${'='.repeat(80)}`);
  if (tx) {
    console.log('✓ SUCCESS! Transaction was saved to database!');
    console.log(`${'='.repeat(80)}`);
    console.log(`\nTransaction details:`);
    console.log(`  Hash: ${tx.txHash}`);
    console.log(`  Block: ${tx.blockNumber}`);
    console.log(`  Timestamp: ${tx.timestamp}`);
    console.log(`  From: ${tx.from}`);
    console.log(`  To: ${tx.to}`);
  } else {
    console.log('✗ FAILED: Transaction was NOT saved');
    console.log(`${'='.repeat(80)}`);

    // Check how many transactions were saved
    const txCount = await prisma.transaction.count({
      where: { jobId: job.id },
    });

    console.log(`\nTransactions saved in this test job: ${txCount}`);

    if (txCount > 0) {
      console.log(`\nSome transactions were saved, but not the airdrop one.`);
      console.log(`This might mean there's an issue with fetching the specific transaction.`);
    } else {
      console.log(`\nNo transactions were saved at all.`);
      console.log(`This might mean there's an error in fetchTokenTransfers.`);
    }
  }

  // Clean up
  console.log(`\n\nCleaning up test job...`);
  await prisma.transaction.deleteMany({ where: { jobId: job.id } });
  await prisma.job.delete({ where: { id: job.id } });
  console.log('✓ Cleanup complete');
}

main()
  .catch(error => {
    console.error('\n✗ ERROR:', error.message);
    console.error(error.stack);
  })
  .finally(() => prisma.$disconnect());
