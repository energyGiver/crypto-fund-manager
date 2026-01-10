/**
 * Test Etherscan tokentx API to see if it returns the airdrop transaction
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const address = '0x444444a7eef5c5182a29e76f69814e324e6621fc';
  const targetTxHash = '0xf26797dc0957d533c98ab7dbe7c45dfe0538a9ccb5cac2bb45af49b415335c3a';
  const targetBlock = 24185338; // Jan-07-2026 08:57:59 PM UTC

  const etherscanKey = process.env.ETHERSCAN_KEY;
  if (!etherscanKey) {
    console.error('ETHERSCAN_KEY not found in .env');
    return;
  }

  // Calculate block range for Jan 2026
  const startTimestamp = Math.floor(new Date('2026-01-01').getTime() / 1000);
  const endTimestamp = Math.floor(new Date('2026-02-01').getTime() / 1000);

  // Estimate blocks
  const REFERENCE_TIMESTAMP = 1768030043; // Jan-10-2026
  const REFERENCE_BLOCK = 24202797;
  const AVG_BLOCK_TIME = 12;

  const startBlock = REFERENCE_BLOCK + Math.floor((startTimestamp - REFERENCE_TIMESTAMP) / AVG_BLOCK_TIME) - 7200;
  const endBlock = REFERENCE_BLOCK + Math.floor((endTimestamp - REFERENCE_TIMESTAMP) / AVG_BLOCK_TIME) + 7200;

  console.log('\n' + '='.repeat(80));
  console.log('ETHERSCAN TOKENTX API TEST');
  console.log('='.repeat(80));
  console.log(`\nAddress: ${address}`);
  console.log(`Block range: ${startBlock} - ${endBlock}`);
  console.log(`Target block: ${targetBlock} (should be in range: ${targetBlock >= startBlock && targetBlock <= endBlock})`);
  console.log(`Target tx: ${targetTxHash}`);

  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${etherscanKey}`;

  console.log(`\nFetching from Etherscan...`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === '1' && Array.isArray(data.result)) {
      console.log(`\nTotal token transfers in block range: ${data.result.length}`);

      // Filter by exact timestamp
      const filtered = data.result.filter((tx: any) => {
        const timestamp = parseInt(tx.timeStamp);
        return timestamp >= startTimestamp && timestamp < endTimestamp;
      });

      console.log(`After timestamp filter (Jan 2026): ${filtered.length}`);

      // Check if target tx is in results
      const found = filtered.find((tx: any) => tx.hash.toLowerCase() === targetTxHash.toLowerCase());

      console.log(`\n${'='.repeat(80)}`);
      if (found) {
        console.log('✓ AIRDROP TRANSACTION FOUND IN API RESPONSE!');
        console.log(`${'='.repeat(80)}`);
        console.log(`\nDetails:`);
        console.log(`  Block: ${found.blockNumber}`);
        console.log(`  Timestamp: ${new Date(parseInt(found.timeStamp) * 1000).toISOString()}`);
        console.log(`  From: ${found.from}`);
        console.log(`  To: ${found.to}`);
        console.log(`  Token: ${found.tokenSymbol} (${found.tokenName})`);
        console.log(`  Amount: ${found.value}`);
        console.log(`  Contract: ${found.contractAddress}`);
      } else {
        console.log('✗ AIRDROP TRANSACTION NOT FOUND IN API RESPONSE');
        console.log(`${'='.repeat(80)}`);
        console.log(`\nThis means Etherscan's tokentx API doesn't include this transaction.`);
        console.log(`Possible reasons:`);
        console.log(`  1. Not an ERC20 token transfer`);
        console.log(`  2. Etherscan hasn't indexed it yet`);
        console.log(`  3. The transaction doesn't have a standard Transfer event`);
      }

      // Show some examples
      if (filtered.length > 0) {
        console.log(`\n\nSample token transfers (first 5):`);
        filtered.slice(0, 5).forEach((tx: any) => {
          console.log(`  ${tx.hash.slice(0, 20)}... block ${tx.blockNumber} ${tx.tokenSymbol}`);
        });
      }
    } else {
      console.log(`\nAPI Error: ${data.message}`);
    }
  } catch (error) {
    console.error(`\nError: ${error.message}`);
  }
}

main();
