/**
 * Analyze Swap Transaction Script
 *
 * Analyzes a specific transaction to understand swap patterns
 */

import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

const TRANSFER_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function main() {
  const userAddress = '0x444444a7eef5c5182a29e76f69814e324e6621fc'.toLowerCase();

  // Get one transaction
  const tx = await prisma.transaction.findFirst({
    where: {
      jobId: {
        in: (await prisma.job.findMany({
          where: { address: userAddress },
          select: { id: true },
        })).map(j => j.id),
      },
    },
  });

  if (!tx) {
    console.log('No transaction found');
    return;
  }

  console.log('='.repeat(80));
  console.log(`Analyzing Transaction: ${tx.txHash}`);
  console.log('='.repeat(80));
  console.log(`From: ${tx.from}`);
  console.log(`To: ${tx.to}`);
  console.log(`Value: ${tx.value}`);
  console.log(`Method: ${tx.methodSelector}`);
  console.log('');

  const logs = JSON.parse(tx.logs as string);
  const transfers = logs.filter((log: any) => log.topics[0] === TRANSFER_SIGNATURE);

  console.log(`Total Transfer events: ${transfers.length}\n`);

  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i];
    const from = transfer.topics[1] ? '0x' + transfer.topics[1].slice(26).toLowerCase() : '';
    const to = transfer.topics[2] ? '0x' + transfer.topics[2].slice(26).toLowerCase() : '';
    const amount = ethers.BigNumber.from(transfer.data).toString();
    const token = transfer.address.toLowerCase();

    console.log(`Transfer #${i + 1}:`);
    console.log(`  Token: ${token}`);
    console.log(`  From: ${from}`);
    console.log(`  To: ${to}`);
    console.log(`  Amount: ${amount}`);

    // Check if user is involved
    if (from === userAddress) {
      console.log(`  ✓ USER SENT (tokenOut)`);
    }
    if (to === userAddress) {
      console.log(`  ✓ USER RECEIVED (tokenIn)`);
    }
    console.log('');
  }

  // Summary
  const userTransfersOut = transfers.filter((t: any) => {
    const from = t.topics[1] ? '0x' + t.topics[1].slice(26).toLowerCase() : '';
    return from === userAddress;
  });

  const userTransfersIn = transfers.filter((t: any) => {
    const to = t.topics[2] ? '0x' + t.topics[2].slice(26).toLowerCase() : '';
    return to === userAddress;
  });

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`User sent ${userTransfersOut.length} token(s)`);
  console.log(`User received ${userTransfersIn.length} token(s)`);

  if (userTransfersOut.length > 0 && userTransfersIn.length > 0) {
    console.log('\n✓ This is a SWAP transaction (DISPOSAL)');
    console.log('\nTokens Out:');
    userTransfersOut.forEach((t: any) => {
      const token = t.address.toLowerCase();
      const amount = ethers.BigNumber.from(t.data).toString();
      console.log(`  - ${token}: ${amount}`);
    });
    console.log('\nTokens In:');
    userTransfersIn.forEach((t: any) => {
      const token = t.address.toLowerCase();
      const amount = ethers.BigNumber.from(t.data).toString();
      console.log(`  - ${token}: ${amount}`);
    });
  } else if (userTransfersIn.length > 0 && userTransfersOut.length === 0) {
    console.log('\n✓ This is an AIRDROP/CLAIM (income)');
  } else if (userTransfersOut.length > 0 && userTransfersIn.length === 0) {
    console.log('\n✓ This is a TRANSFER (sent only)');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
