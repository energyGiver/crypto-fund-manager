/**
 * Contract Analysis Script
 *
 * Analyzes transactions for a specific address and identifies unknown contracts
 * Uses Etherscan API to fetch contract information (verified contracts only)
 * Uses block timestamp estimation to save API costs
 *
 * Usage:
 *   npx ts-node scripts/analyze-contracts.ts <address> <year> [month]
 *
 * Examples:
 *   npx ts-node scripts/analyze-contracts.ts 0x64338FD8e7b1918B4a806A175e26eD152B3d0b7b 2025       # Full year 2025
 *   npx ts-node scripts/analyze-contracts.ts 0x64338FD8e7b1918B4a806A175e26eD152B3d0b7b 2025 12    # Only December 2025
 *   npx ts-node scripts/analyze-contracts.ts 0x64338FD8e7b1918B4a806A175e26eD152B3d0b7b 2026 1     # Only January 2026
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_KEY;
const ETHERSCAN_BASE_URL = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 1; // Ethereum mainnet

interface ContractInfo {
  address: string;
  name: string;
  verified: boolean;
  txCount: number;
  methods: Set<string>;
  firstSeen: number;
  lastSeen: number;
}

interface AnalysisResult {
  totalTransactions: number;
  uniqueContracts: number;
  verifiedContracts: number;
  contracts: { [address: string]: Omit<ContractInfo, 'methods'> & { methods: string[] } };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTransactions(address: string, startBlock: number, endBlock: number): Promise<any[]> {
  const url = `${ETHERSCAN_BASE_URL}?chainid=${CHAIN_ID}&module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${ETHERSCAN_API_KEY}`;

  console.log(`Fetching transactions for ${address} (blocks ${startBlock}-${endBlock})...`);
  console.log(`API URL: ${url}\n`);

  const response = await fetch(url);
  const data = await response.json();

  console.log(`API Response:`, data);

  if (data.status === '1' && Array.isArray(data.result)) {
    console.log(`✓ Found ${data.result.length} transactions`);
    return data.result;
  }

  // Check if it's a "No transactions found" case (which is valid)
  if (data.message === 'No transactions found') {
    console.log(`✓ No transactions found`);
    return [];
  }

  throw new Error(`Failed to fetch transactions: ${data.message || data.result}`);
}

async function getContractInfo(address: string): Promise<{ name: string; verified: boolean } | null> {
  const url = `${ETHERSCAN_BASE_URL}?chainid=${CHAIN_ID}&module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === '1' && data.result && data.result[0]) {
      const result = data.result[0];
      const verified = result.SourceCode !== '';
      const name = result.ContractName || 'Unknown';

      return { name, verified };
    }
  } catch (error) {
    console.error(`Error fetching contract info for ${address}:`, error);
  }

  return null;
}

async function analyzeContracts(address: string, year: number, startMonth: number, endMonth: number): Promise<AnalysisResult> {
  // Calculate block range based on dates
  const startDate = new Date(`${year}-${startMonth.toString().padStart(2, '0')}-01`);

  // Calculate end date (first day of next month after endMonth)
  const endYear = endMonth === 12 ? year + 1 : year;
  const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
  const endDate = new Date(`${endYear}-${nextMonth.toString().padStart(2, '0')}-01`);

  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);

  console.log(`\nAnalyzing ${address}`);
  console.log(`Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  console.log(`Timestamp range: ${startTimestamp} - ${endTimestamp}\n`);

  // Get block numbers by timestamp with margin (to save API calls)
  console.log('Fetching block range from timestamps...');
  let startBlock: number;
  let endBlock: number;

  try {
    startBlock = await getBlockByTimestamp(startTimestamp, 'after');
    console.log(`  Start block: ${startBlock}`);
    await sleep(250); // Rate limiting

    endBlock = await getBlockByTimestamp(endTimestamp, 'before');
    console.log(`  End block: ${endBlock}`);

    // Add margin: ~7200 blocks per day (12 sec per block)
    const marginBlocks = 7200;
    startBlock = Math.max(0, startBlock - marginBlocks);
    endBlock = endBlock + marginBlocks;

    console.log(`  With margin: ${startBlock} - ${endBlock} (saves API costs!)\n`);
  } catch (error) {
    console.warn(`Failed to fetch block numbers, using full range: ${error.message}`);
    startBlock = 0;
    endBlock = 99999999;
    console.log('');
  }

  // Fetch transactions
  const transactions = await fetchTransactions(address, startBlock, endBlock);

  // Filter by actual timestamp
  const filteredTxs = transactions.filter(tx => {
    const timestamp = parseInt(tx.timeStamp);
    return timestamp >= startTimestamp && timestamp < endTimestamp;
  });

  console.log(`\nFiltered to ${filteredTxs.length} transactions within exact date range\n`);

  // Collect contract addresses
  const contractMap = new Map<string, ContractInfo>();

  for (const tx of filteredTxs) {
    const toAddress = tx.to?.toLowerCase();
    if (!toAddress) continue; // Contract creation

    const timestamp = parseInt(tx.timeStamp);
    const methodSelector = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : null;

    if (!contractMap.has(toAddress)) {
      contractMap.set(toAddress, {
        address: toAddress,
        name: 'Unknown',
        verified: false,
        txCount: 0,
        methods: new Set<string>(),
        firstSeen: timestamp,
        lastSeen: timestamp,
      });
    }

    const info = contractMap.get(toAddress)!;
    info.txCount++;
    if (methodSelector) {
      info.methods.add(methodSelector);
    }
    info.lastSeen = Math.max(info.lastSeen, timestamp);
  }

  console.log(`Found ${contractMap.size} unique contract addresses\n`);
  console.log('Fetching contract information from Etherscan...');

  // Fetch contract info (rate limit: 5 calls/sec)
  let processed = 0;
  let verified = 0;

  for (const [address, info] of contractMap.entries()) {
    const contractInfo = await getContractInfo(address);

    if (contractInfo) {
      info.name = contractInfo.name;
      info.verified = contractInfo.verified;

      if (contractInfo.verified) {
        verified++;
        console.log(`✓ [${processed + 1}/${contractMap.size}] ${address.slice(0, 10)}... → ${info.name} (${info.txCount} txs)`);
      } else {
        console.log(`  [${processed + 1}/${contractMap.size}] ${address.slice(0, 10)}... → Unverified (${info.txCount} txs)`);
      }
    }

    processed++;

    // Rate limit: 5 calls/sec = 200ms between calls
    await sleep(220);
  }

  console.log(`\n✓ Found ${verified} verified contracts out of ${contractMap.size} total\n`);

  // Convert to serializable format
  const contracts: AnalysisResult['contracts'] = {};
  for (const [address, info] of contractMap.entries()) {
    contracts[address] = {
      ...info,
      methods: Array.from(info.methods),
    };
  }

  // Sort by transaction count
  const sortedAddresses = Object.keys(contracts).sort((a, b) =>
    contracts[b].txCount - contracts[a].txCount
  );

  const sortedContracts: AnalysisResult['contracts'] = {};
  for (const address of sortedAddresses) {
    sortedContracts[address] = contracts[address];
  }

  return {
    totalTransactions: filteredTxs.length,
    uniqueContracts: contractMap.size,
    verifiedContracts: verified,
    contracts: sortedContracts,
  };
}

async function getBlockByTimestamp(timestamp: number, closest: 'before' | 'after' = 'before'): Promise<number> {
  const url = `${ETHERSCAN_BASE_URL}?chainid=${CHAIN_ID}&module=block&action=getblocknobytime&timestamp=${timestamp}&closest=${closest}&apikey=${ETHERSCAN_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    console.log(`Block API response for timestamp ${timestamp}:`, data);

    if (data.status === '1' && data.result) {
      return parseInt(data.result);
    }

    // If API fails, estimate block number (avg 12 sec per block since genesis)
    const GENESIS_TIMESTAMP = 1438269973; // Ethereum genesis
    const AVG_BLOCK_TIME = 12;
    const estimatedBlock = Math.floor((timestamp - GENESIS_TIMESTAMP) / AVG_BLOCK_TIME);
    console.log(`API failed, using estimated block: ${estimatedBlock}`);
    return estimatedBlock;
  } catch (error) {
    console.error(`Error fetching block: ${error.message}`);
    // Fallback to estimation
    const GENESIS_TIMESTAMP = 1438269973;
    const AVG_BLOCK_TIME = 12;
    return Math.floor((timestamp - GENESIS_TIMESTAMP) / AVG_BLOCK_TIME);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx ts-node scripts/analyze-contracts.ts <address> <year> [month]');
    console.error('');
    console.error('Examples:');
    console.error('  npx ts-node scripts/analyze-contracts.ts 0x64338FD8e7b1918B4a806A175e26eD152B3d0b7b 2025       # Full year 2025');
    console.error('  npx ts-node scripts/analyze-contracts.ts 0x64338FD8e7b1918B4a806A175e26eD152B3d0b7b 2025 12    # Only December 2025');
    console.error('  npx ts-node scripts/analyze-contracts.ts 0x64338FD8e7b1918B4a806A175e26eD152B3d0b7b 2026 1     # Only January 2026');
    process.exit(1);
  }

  if (!ETHERSCAN_API_KEY) {
    console.error('Error: ETHERSCAN_KEY not found in .env file');
    process.exit(1);
  }

  const ADDRESS = args[0];
  const YEAR = parseInt(args[1]);
  const MONTH = args[2] ? parseInt(args[2]) : null;

  // Validate inputs
  if (!ADDRESS.startsWith('0x') || ADDRESS.length !== 42) {
    console.error('Error: Invalid Ethereum address format');
    process.exit(1);
  }

  if (YEAR < 2015 || YEAR > 2030) {
    console.error('Error: Year must be between 2015 and 2030');
    process.exit(1);
  }

  if (MONTH && (MONTH < 1 || MONTH > 12)) {
    console.error('Error: Month must be between 1 and 12');
    process.exit(1);
  }

  let START_MONTH: number;
  let END_MONTH: number;

  if (MONTH) {
    // Specific month only
    START_MONTH = MONTH;
    END_MONTH = MONTH;
  } else {
    // Full year
    START_MONTH = 1;
    END_MONTH = 12;
  }

  console.log('='.repeat(60));
  console.log('Contract Analysis Tool');
  console.log('='.repeat(60));

  const result = await analyzeContracts(ADDRESS, YEAR, START_MONTH, END_MONTH);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Transactions: ${result.totalTransactions}`);
  console.log(`Unique Contracts: ${result.uniqueContracts}`);
  console.log(`Verified Contracts: ${result.verifiedContracts}`);
  console.log(`Unverified Contracts: ${result.uniqueContracts - result.verifiedContracts}`);

  console.log('\n' + '-'.repeat(60));
  console.log('TOP 20 MOST USED CONTRACTS (VERIFIED ONLY)');
  console.log('-'.repeat(60));

  const verifiedOnly = Object.entries(result.contracts)
    .filter(([_, info]) => info.verified)
    .slice(0, 20);

  for (const [address, info] of verifiedOnly) {
    console.log(`${info.name.padEnd(30)} | ${address} | ${info.txCount} txs`);
  }

  // Save to JSON
  const outputPath = path.join(__dirname, 'contract-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\n✓ Full results saved to: ${outputPath}`);
}

main().catch(console.error);
