import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

async function analyzeTransaction(txHash: string) {
  try {
    console.log(`\n=== Analyzing Transaction ${txHash} ===\n`);

    // Find the tax event for this transaction
    const taxEvent = await prisma.taxEvent.findFirst({
      where: { txHash },
    });

    if (!taxEvent) {
      console.log('❌ No tax event found for this transaction');
      return;
    }

    console.log('📊 Tax Event Details:');
    console.log(`  Category: ${taxEvent.category}`);
    console.log(`  Date: ${taxEvent.timestamp}`);
    console.log(`  Protocol: ${taxEvent.protocol || 'N/A'}`);
    console.log(`  Token Out: ${taxEvent.tokenOut || 'N/A'} (${taxEvent.tokenOutSymbol || 'N/A'})`);
    console.log(`  Token Out Amount: ${taxEvent.tokenOutAmount || 'N/A'}`);
    console.log(`  Token In: ${taxEvent.tokenIn || 'N/A'} (${taxEvent.tokenInSymbol || 'N/A'})`);
    console.log(`  Token In Amount: ${taxEvent.tokenInAmount || 'N/A'}`);
    console.log(`  Token In USD: $${taxEvent.tokenInUsd || '0'}`);
    console.log(`  Gas Fee USD: $${taxEvent.gasFeeUsd || '0'}`);
    console.log(`  Cost Basis: $${taxEvent.costBasis || '0'}`);
    console.log(`  Proceeds: $${taxEvent.proceeds || '0'}`);
    console.log(`  Realized Gain: $${taxEvent.realizedGain || '0'}`);
    console.log(`  Holding Period: ${taxEvent.holdingPeriod || 0} days`);

    if (taxEvent.category === 'DISPOSAL' && taxEvent.tokenOut) {
      console.log('\n💰 Looking up cost lots used for this disposal...');

      // Find the job to get the address
      const job = await prisma.job.findUnique({
        where: { id: taxEvent.jobId },
      });

      if (!job) {
        console.log('⚠️ Could not find job for this tax event');
        return;
      }

      // Find cost lots for this token that were disposed around this time
      // Note: We can't definitively tell which lots were used since there's no join table,
      // but we can show the lots that existed before this transaction
      const lotsBeforeDisposal = await prisma.costLot.findMany({
        where: {
          address: job.address.toLowerCase(),
          tokenAddress: taxEvent.tokenOut.toLowerCase(),
          acquiredDate: { lte: taxEvent.timestamp },
        },
        orderBy: { acquiredDate: 'asc' },
        take: 10,
      });

      if (lotsBeforeDisposal.length > 0) {
        console.log(`\n  Found ${lotsBeforeDisposal.length} cost lots acquired before this disposal (FIFO order):`);

        for (const lot of lotsBeforeDisposal) {
          console.log(`\n  Lot ID: ${lot.id}`);
          console.log(`    Acquired: ${lot.acquiredDate.toISOString().split('T')[0]}`);
          console.log(`    Acquired Tx: ${lot.acquiredTxHash.slice(0, 10)}...`);
          console.log(`    Original Amount: ${lot.amount}`);
          console.log(`    Remaining Amount: ${lot.remainingAmount}`);
          console.log(`    Cost Basis: $${lot.costBasisUsd}`);
          console.log(`    Disposed: ${lot.disposed ? 'Yes' : 'No'}`);
          if (lot.disposed && lot.disposedTxHash === txHash) {
            console.log(`    ⭐ This lot was fully disposed in THIS transaction`);
          } else if (lot.disposedTxHash === txHash) {
            console.log(`    ⭐ This lot was partially used in THIS transaction`);
          }
        }
      } else {
        console.log('  ⚠️ No cost lots found! This is a problem.');
        console.log('  This means the token was sold without establishing a cost basis first.');
      }

      console.log('\n📈 Calculation Summary:');
      const costBasis = parseFloat(taxEvent.costBasis || '0');
      const proceeds = parseFloat(taxEvent.proceeds || '0');
      const realizedGain = parseFloat(taxEvent.realizedGain || '0');
      const tokenInUsd = parseFloat(taxEvent.tokenInUsd || '0');
      const gasFee = parseFloat(taxEvent.gasFeeUsd || '0');

      console.log(`  1. What you received (Token In): $${tokenInUsd.toFixed(2)}`);
      console.log(`  2. Gas fees paid: -$${gasFee.toFixed(2)}`);
      console.log(`  3. Net proceeds: $${proceeds.toFixed(2)}`);
      console.log(`  4. Cost basis (what you paid): $${costBasis.toFixed(2)}`);
      console.log(`  5. Realized gain/loss: $${realizedGain.toFixed(2)}`);

      console.log('\n✅ Verification:');
      const calculatedProceeds = tokenInUsd - gasFee;
      const calculatedGain = calculatedProceeds - costBasis;
      console.log(`  Expected proceeds: $${calculatedProceeds.toFixed(2)}`);
      console.log(`  Recorded proceeds: $${proceeds.toFixed(2)}`);
      console.log(`  Proceeds match: ${Math.abs(calculatedProceeds - proceeds) < 0.01 ? '✓' : '✗'}`);
      console.log(`  Expected gain: $${calculatedGain.toFixed(2)}`);
      console.log(`  Recorded gain: $${realizedGain.toFixed(2)}`);
      console.log(`  Gain match: ${Math.abs(calculatedGain - realizedGain) < 0.01 ? '✓' : '✗'}`);

      // Show simple example
      console.log('\n📝 In Simple Terms:');
      if (realizedGain < 0) {
        console.log(`  You bought ${taxEvent.tokenOutSymbol} for $${costBasis.toFixed(2)}`);
        console.log(`  You sold it for $${proceeds.toFixed(2)} (after gas)`);
        console.log(`  You lost $${Math.abs(realizedGain).toFixed(2)}`);
      } else {
        console.log(`  You bought ${taxEvent.tokenOutSymbol} for $${costBasis.toFixed(2)}`);
        console.log(`  You sold it for $${proceeds.toFixed(2)} (after gas)`);
        console.log(`  You gained $${realizedGain.toFixed(2)}`);
      }

    } else if (taxEvent.category === 'DISPOSAL') {
      console.log('\n⚠️ Warning: This is a DISPOSAL event but tokenOut is missing.');
      console.log('This might indicate an issue with transaction classification.');
    }

  } catch (error) {
    console.error('Error analyzing transaction:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const txHash = process.argv[2];
if (!txHash) {
  console.error('Usage: npx tsx src/scripts/analyze-transaction.ts <txHash>');
  process.exit(1);
}

analyzeTransaction(txHash);
