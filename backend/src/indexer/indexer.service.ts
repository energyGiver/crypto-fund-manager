import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';

interface TransactionData {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string | null;
  value: string;
  gasUsed: string;
  gasPrice: string;
  input: string;
  status: number;
  logs: any[];
}

interface NetworkConfig {
  blockTime: number; // seconds per block
  referenceBlock: number; // known block number
  referenceTimestamp: number; // unix timestamp for reference block
  launchTimestamp: number; // network launch time
  minYear: number; // minimum valid year
  marginSeconds: number; // time margin for block range queries (in seconds)
}

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);

  // Network configurations with accurate reference points
  private readonly networkConfigs: Record<string, NetworkConfig> = {
    mantle: {
      blockTime: 2, // 2 second block time
      referenceBlock: 90167285,
      referenceTimestamp: 1736929482, // Jan-15-2026 08:14:42 AM +UTC
      launchTimestamp: 1688169600, // July 1, 2023 (approximate)
      minYear: 2023,
      marginSeconds: 7200, // 2 hours margin
    },
    ethereum: {
      blockTime: 12, // ~12 second block time
      referenceBlock: 18900000,
      referenceTimestamp: 1704067200, // 2024-01-01 00:00:00 UTC
      launchTimestamp: 1438269988, // July 30, 2015 (genesis)
      minYear: 2015,
      marginSeconds: 86400, // 24 hours margin
    },
    sepolia: {
      blockTime: 12, // ~12 second block time
      referenceBlock: 5000000,
      referenceTimestamp: 1704067200, // 2024-01-01 00:00:00 UTC
      launchTimestamp: 1656586800, // June 30, 2022 (approximate)
      minYear: 2022,
      marginSeconds: 86400, // 24 hours margin
    },
  };

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  private getProvider(network: string): ethers.providers.JsonRpcProvider {
    const drpcKey = this.configService.get<string>('DRPC_KEY');
    let networkName: string;
    if (network === 'sepolia') {
      networkName = 'sepolia';
    } else if (network === 'mantle') {
      networkName = 'mantle';
    } else {
      networkName = 'ethereum';
    }
    const rpcUrl = `https://lb.drpc.org/ogrpc?network=${networkName}&dkey=${drpcKey}`;
    return new ethers.providers.JsonRpcProvider(rpcUrl);
  }

  private getEtherscanApiUrl(network: string): string {
    if (network === 'mantle') {
      return 'https://explorer.mantle.xyz/api';
    }
    return network === 'sepolia'
      ? 'https://api.etherscan.io/v2/api'
      : 'https://api.etherscan.io/v2/api';
  }

  private getChainId(network: string): number {
    if (network === 'mantle') {
      return 5000;
    }
    return network === 'sepolia' ? 11155111 : 1;
  }

  /**
   * Get network configuration
   */
  private getNetworkConfig(network: string): NetworkConfig {
    return this.networkConfigs[network] || this.networkConfigs.ethereum;
  }

  /**
   * Get current block number from RPC provider
   */
  private async getCurrentBlock(network: string): Promise<number> {
    try {
      const provider = this.getProvider(network);
      const blockNumber = await provider.getBlockNumber();
      return blockNumber;
    } catch (error) {
      this.logger.warn(`Failed to get current block for ${network}: ${error.message}`);
      // Return a conservative estimate based on reference point
      const config = this.getNetworkConfig(network);
      const now = Math.floor(Date.now() / 1000);
      const timeDiff = now - config.referenceTimestamp;
      const blockDiff = Math.floor(timeDiff / config.blockTime);
      return config.referenceBlock + blockDiff;
    }
  }

  /**
   * Estimate block number from timestamp using block time (fallback method)
   */
  private async estimateBlockFromTimestamp(timestamp: number, network: string): Promise<number> {
    const config = this.getNetworkConfig(network);

    // Calculate time difference in seconds
    const timeDiff = timestamp - config.referenceTimestamp;

    // Estimate block difference
    const blockDiff = Math.floor(timeDiff / config.blockTime);

    // Calculate estimated block number
    let estimatedBlock = config.referenceBlock + blockDiff;

    // Ensure block is not negative
    estimatedBlock = Math.max(0, estimatedBlock);

    // Check if estimated block is in the future
    const currentBlock = await this.getCurrentBlock(network);
    if (estimatedBlock > currentBlock) {
      this.logger.warn(
        `Estimated block ${estimatedBlock} is beyond current block ${currentBlock}, using current block instead`
      );
      estimatedBlock = currentBlock;
    }

    // Check if timestamp is before network launch
    if (timestamp < config.launchTimestamp) {
      this.logger.warn(
        `Timestamp ${timestamp} is before ${network} launch (${config.launchTimestamp}), using block 0`
      );
      return 0;
    }

    this.logger.debug(
      `Estimated block ${estimatedBlock} for timestamp ${timestamp} on ${network} (block time: ${config.blockTime}s, current block: ${currentBlock})`
    );

    return estimatedBlock;
  }

  /**
   * Get block number by timestamp using Etherscan API
   */
  private async getBlockByTimestamp(
    timestamp: number,
    closest: 'before' | 'after',
    network: string,
  ): Promise<number> {
    const etherscanKey = this.configService.get<string>('ETHERSCAN_KEY');
    const baseUrl = this.getEtherscanApiUrl(network);

    // Mantle Explorer doesn't need chainid parameter (it's Mantle-specific)
    let url: string;
    if (network === 'mantle') {
      url = `${baseUrl}?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=${closest}&apikey=${etherscanKey}`;
    } else {
      const chainId = this.getChainId(network);
      url = `${baseUrl}?chainid=${chainId}&module=block&action=getblocknobytime&timestamp=${timestamp}&closest=${closest}&apikey=${etherscanKey}`;
    }

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === '1' && data.result) {
        const blockNumber = parseInt(data.result);

        // Validate parsed block number
        if (!isNaN(blockNumber) && blockNumber > 0) {
          return blockNumber;
        }

        this.logger.warn(`Invalid block number from API: ${data.result}, using block time estimation`);
        return await this.estimateBlockFromTimestamp(timestamp, network);
      }

      // API failed, use block time estimation as fallback
      this.logger.warn(`API failed to get block for timestamp ${timestamp} (status: ${data.status}, message: ${data.message}), using block time estimation`);
      return await this.estimateBlockFromTimestamp(timestamp, network);
    } catch (error) {
      this.logger.error(`Error fetching block by timestamp: ${error.message}, using block time estimation`);
      // Fallback to block time estimation
      return await this.estimateBlockFromTimestamp(timestamp, network);
    }
  }

  /**
   * Fetch all transactions for an address within a specific year/month
   */
  async fetchTransactions(address: string, year: number, month: number | null, network: string, jobId: string): Promise<void> {
    const config = this.getNetworkConfig(network);
    const periodStr = month ? `${year}-${month.toString().padStart(2, '0')}` : `${year}`;
    this.logger.log(`Fetching transactions for ${address} in ${periodStr} on ${network}`);

    // Validate year for network
    if (year < config.minYear) {
      throw new Error(`${network} network launched in ${config.minYear}. Please select a year from ${config.minYear} onwards.`);
    }

    const provider = this.getProvider(network);

    // Calculate timestamp range
    let startTimestamp: number;
    let endTimestamp: number;

    if (month) {
      // Specific month
      startTimestamp = Math.floor(new Date(`${year}-${month.toString().padStart(2, '0')}-01`).getTime() / 1000);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      endTimestamp = Math.floor(new Date(`${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`).getTime() / 1000);
    } else {
      // Full year
      startTimestamp = Math.floor(new Date(`${year}-01-01`).getTime() / 1000);
      endTimestamp = Math.floor(new Date(`${year+1}-01-01`).getTime() / 1000);
    }

    // Get block numbers for the timestamp range
    this.logger.log(`Fetching block range for timestamps ${startTimestamp} - ${endTimestamp}`);

    let startBlock: number;
    let endBlock: number;

    try {
      startBlock = await this.getBlockByTimestamp(startTimestamp, 'after', network);
      endBlock = await this.getBlockByTimestamp(endTimestamp, 'before', network);

      // Calculate margin in blocks based on marginSeconds configuration
      const marginBlocks = Math.floor(config.marginSeconds / config.blockTime);
      startBlock = Math.max(0, startBlock - marginBlocks);
      endBlock = endBlock + marginBlocks;

      // Ensure endBlock doesn't exceed current block
      const currentBlock = await this.getCurrentBlock(network);
      if (endBlock > currentBlock) {
        this.logger.warn(`End block ${endBlock} exceeds current block ${currentBlock}, using current block`);
        endBlock = currentBlock;
      }

      this.logger.log(
        `Fetching transactions in block range ${startBlock} - ${endBlock} (margin: ${marginBlocks} blocks = ${config.marginSeconds}s)`
      );
    } catch (error) {
      this.logger.warn(`Failed to fetch block numbers by timestamp, using estimation: ${error.message}`);

      // Use network config for estimation
      startBlock = await this.estimateBlockFromTimestamp(startTimestamp, network);
      endBlock = await this.estimateBlockFromTimestamp(endTimestamp, network);

      // Add margin
      const marginBlocks = Math.floor(config.marginSeconds / config.blockTime);
      startBlock = Math.max(0, startBlock - marginBlocks);
      endBlock = Math.min(endBlock + marginBlocks, await this.getCurrentBlock(network));

      this.logger.log(
        `Estimated block range: ${startBlock} - ${endBlock} (margin: ${marginBlocks} blocks)`
      );
    }

    // Fetch transactions using Etherscan API
    const etherscanKey = this.configService.get<string>('ETHERSCAN_KEY');
    if (!etherscanKey) {
      throw new Error('ETHERSCAN_KEY is required');
    }
    const allTxList = await this.fetchFromEtherscan(address, startBlock, endBlock, etherscanKey, network);

    // Filter by exact timestamp
    const txList = allTxList.filter(tx => {
      const timestamp = parseInt(tx.timeStamp);
      return timestamp >= startTimestamp && timestamp < endTimestamp;
    });

    const periodLabel = month ? `month ${month} of ${year}` : `year ${year}`;
    this.logger.log(`Found ${txList.length} transactions in ${periodLabel} (out of ${allTxList.length} total in block range)`);

    // Process each transaction
    for (let i = 0; i < txList.length; i++) {
      const tx = txList[i];

      // Get receipt for logs
      const receipt = await provider.getTransactionReceipt(tx.hash);

      // Get block for timestamp
      const block = await provider.getBlock(parseInt(tx.blockNumber));

      // Save to database
      await this.prisma.transaction.create({
        data: {
          jobId,
          txHash: tx.hash,
          blockNumber: parseInt(tx.blockNumber),
          timestamp: new Date(block.timestamp * 1000),
          from: tx.from,
          to: tx.to,
          value: tx.value,
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: tx.gasPrice || '0',
          input: tx.input || '0x',
          methodSelector: tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : null,
          status: receipt.status || 0,
          logs: JSON.stringify(receipt.logs),
        },
      });

      // Update progress
      const progressPct = Math.floor(((i + 1) / txList.length) * 100);
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          progressPct,
          stage: 'FETCHING_TX',
        },
      });

      // Rate limiting - don't hammer the RPC
      if (i % 10 === 0) {
        await this.sleep(100);
      }
    }

    this.logger.log(`Completed fetching transactions for job ${jobId}`);
  }

  /**
   * Get block range for a specific year
   */
  private async getBlockRangeForYear(year: number): Promise<{ startBlock: number; endBlock: number }> {
    // Approximate blocks - you can use a more accurate API like eth-block-timestamp
    const yearStartTimestamp = Math.floor(new Date(`${year}-01-01`).getTime() / 1000);
    const yearEndTimestamp = Math.floor(new Date(`${year}-12-31`).getTime() / 1000);

    // Ethereum produces ~1 block per 12 seconds on average
    // Genesis block (July 30, 2015) was at timestamp ~1438269988
    const genesisTimestamp = 1438269988;
    const genesisBlock = 0;

    const estimateBlock = (timestamp: number) => {
      const secondsSinceGenesis = timestamp - genesisTimestamp;
      const blocksSinceGenesis = Math.floor(secondsSinceGenesis / 12);
      return genesisBlock + blocksSinceGenesis;
    };

    return {
      startBlock: estimateBlock(yearStartTimestamp),
      endBlock: estimateBlock(yearEndTimestamp),
    };
  }

  /**
   * Fetch transaction list from Etherscan API
   */
  private async fetchFromEtherscan(
    address: string,
    startBlock: number,
    endBlock: number,
    apiKey: string,
    network: string,
  ): Promise<any[]> {
    const baseUrl = this.getEtherscanApiUrl(network);
    const chainId = this.getChainId(network);
    const url = `${baseUrl}?chainid=${chainId}&module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${apiKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === '1' && Array.isArray(data.result)) {
        return data.result;
      }

      this.logger.warn(`Etherscan API returned no transactions or error: ${data.message}`);
      return [];
    } catch (error) {
      this.logger.error(`Error fetching from Etherscan: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch ERC20 token transfers
   */
  async fetchTokenTransfers(address: string, year: number, month: number | null, network: string, jobId: string): Promise<void> {
    const config = this.getNetworkConfig(network);
    const periodStr = month ? `${year}-${month.toString().padStart(2, '0')}` : `${year}`;
    this.logger.log(`Fetching ERC20 transfers for ${address} in ${periodStr} on ${network}`);

    // Calculate timestamp range
    let startTimestamp: number;
    let endTimestamp: number;

    if (month) {
      // Specific month
      startTimestamp = Math.floor(new Date(`${year}-${month.toString().padStart(2, '0')}-01`).getTime() / 1000);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      endTimestamp = Math.floor(new Date(`${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`).getTime() / 1000);
    } else {
      // Full year
      startTimestamp = Math.floor(new Date(`${year}-01-01`).getTime() / 1000);
      endTimestamp = Math.floor(new Date(`${year+1}-01-01`).getTime() / 1000);
    }

    // Get block numbers for the timestamp range
    let startBlock: number;
    let endBlock: number;

    try {
      startBlock = await this.getBlockByTimestamp(startTimestamp, 'after', network);
      endBlock = await this.getBlockByTimestamp(endTimestamp, 'before', network);

      // Calculate margin in blocks
      const marginBlocks = Math.floor(config.marginSeconds / config.blockTime);
      startBlock = Math.max(0, startBlock - marginBlocks);
      endBlock = endBlock + marginBlocks;

      // Ensure endBlock doesn't exceed current block
      const currentBlock = await this.getCurrentBlock(network);
      if (endBlock > currentBlock) {
        this.logger.warn(`End block ${endBlock} exceeds current block ${currentBlock} for token transfers, using current block`);
        endBlock = currentBlock;
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch block numbers for token transfers, using estimation`);

      // Use network config for estimation
      startBlock = await this.estimateBlockFromTimestamp(startTimestamp, network);
      endBlock = await this.estimateBlockFromTimestamp(endTimestamp, network);

      // Add margin
      const marginBlocks = Math.floor(config.marginSeconds / config.blockTime);
      startBlock = Math.max(0, startBlock - marginBlocks);
      endBlock = Math.min(endBlock + marginBlocks, await this.getCurrentBlock(network));

      this.logger.log(`Estimated token transfer block range: ${startBlock} - ${endBlock}`);
    }

    const etherscanKey = this.configService.get<string>('ETHERSCAN_KEY');
    const baseUrl = this.getEtherscanApiUrl(network);
    const chainId = this.getChainId(network);

    const url = `${baseUrl}?chainid=${chainId}&module=account&action=tokentx&address=${address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${etherscanKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === '1' && Array.isArray(data.result)) {
        // Filter by exact timestamp
        const filtered = data.result.filter((tx: any) => {
          const timestamp = parseInt(tx.timeStamp);
          return timestamp >= startTimestamp && timestamp < endTimestamp;
        });

        const periodLabel = month ? `month ${month} of ${year}` : `year ${year}`;
        this.logger.log(`Found ${filtered.length} token transfers in ${periodLabel} (out of ${data.result.length} total in block range)`);

        // Process each token transfer
        // These are transactions where the user appears in Transfer event logs but might not be from/to
        const provider = this.getProvider(network);
        let newTransactions = 0;

        for (let i = 0; i < filtered.length; i++) {
          const transfer = filtered[i];
          const txHash = transfer.hash;

          // Check if we already have this transaction (from regular txlist)
          const existing = await this.prisma.transaction.findFirst({
            where: {
              jobId,
              txHash,
            },
          });

          if (existing) {
            // Already captured, skip
            continue;
          }

          // This is a new transaction - fetch full data
          try {
            const receipt = await provider.getTransactionReceipt(txHash);
            const tx = await provider.getTransaction(txHash);
            const block = await provider.getBlock(parseInt(transfer.blockNumber));

            // Save to database
            await this.prisma.transaction.create({
              data: {
                jobId,
                txHash,
                blockNumber: parseInt(transfer.blockNumber),
                timestamp: new Date(block.timestamp * 1000),
                from: tx.from,
                to: tx.to || null,
                value: tx.value.toString(),
                gasUsed: receipt.gasUsed.toString(),
                gasPrice: tx.gasPrice?.toString() || '0',
                input: tx.data || '0x',
                methodSelector: tx.data && tx.data.length >= 10 ? tx.data.slice(0, 10) : null,
                status: receipt.status || 0,
                logs: JSON.stringify(receipt.logs),
              },
            });

            newTransactions++;

            // Rate limiting
            if (i % 10 === 0) {
              await this.sleep(100);
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch transaction ${txHash}: ${error.message}`);
          }
        }

        if (newTransactions > 0) {
          this.logger.log(`Saved ${newTransactions} new token transfer transactions (airdrops, etc.)`);
        }
      }
    } catch (error) {
      this.logger.error(`Error fetching token transfers: ${error.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
