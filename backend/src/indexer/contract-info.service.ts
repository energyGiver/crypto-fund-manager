import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ContractInfo {
  address: string;
  name: string;
  verified: boolean;
  compiler?: string;
  optimization?: boolean;
  runs?: number;
  constructorArguments?: string;
  abi?: string;
  implementation?: string; // For proxy contracts
  isProxy?: boolean;
}

@Injectable()
export class ContractInfoService {
  private readonly logger = new Logger(ContractInfoService.name);
  private cache = new Map<string, ContractInfo>();

  constructor(private configService: ConfigService) {}

  private getEtherscanApiUrl(network: string): string {
    return network === 'sepolia'
      ? 'https://api.etherscan.io/v2/api'
      : 'https://api.etherscan.io/v2/api';
  }

  private getChainId(network: string): number {
    return network === 'sepolia' ? 11155111 : 1;
  }

  /**
   * Get contract source code and metadata from Etherscan
   */
  async getContractInfo(
    address: string,
    network: string = 'mainnet',
  ): Promise<ContractInfo | null> {
    const lowerAddress = address.toLowerCase();

    // Check cache
    if (this.cache.has(lowerAddress)) {
      return this.cache.get(lowerAddress)!;
    }

    const etherscanKey = this.configService.get<string>('ETHERSCAN_KEY');
    if (!etherscanKey) {
      throw new Error('ETHERSCAN_KEY is required');
    }

    const baseUrl = this.getEtherscanApiUrl(network);
    const chainId = this.getChainId(network);
    const url = `${baseUrl}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${etherscanKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
        const result = data.result[0];

        // Check if contract is verified
        if (!result.SourceCode || result.SourceCode === '') {
          const info: ContractInfo = {
            address: lowerAddress,
            name: 'Unknown',
            verified: false,
          };
          this.cache.set(lowerAddress, info);
          return info;
        }

        // Parse implementation address if it's a proxy
        const implementation = result.Implementation || null;
        const isProxy = implementation && implementation !== '';

        const info: ContractInfo = {
          address: lowerAddress,
          name: result.ContractName || 'Unknown',
          verified: true,
          compiler: result.CompilerVersion,
          optimization: result.OptimizationUsed === '1',
          runs: parseInt(result.Runs) || 0,
          constructorArguments: result.ConstructorArguments,
          abi: result.ABI,
          implementation,
          isProxy,
        };

        this.cache.set(lowerAddress, info);
        this.logger.log(`Fetched contract info for ${address}: ${info.name} (verified: ${info.verified})`);

        return info;
      }

      // Not a contract or error
      this.logger.warn(`Failed to fetch contract info for ${address}: ${data.message || 'Unknown error'}`);
      return null;
    } catch (error) {
      this.logger.error(`Error fetching contract info for ${address}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get contract info for multiple addresses (batch with rate limiting)
   */
  async getContractInfoBatch(
    addresses: string[],
    network: string = 'mainnet',
  ): Promise<Map<string, ContractInfo>> {
    const result = new Map<string, ContractInfo>();
    const uniqueAddresses = [...new Set(addresses.map(a => a.toLowerCase()))];

    this.logger.log(`Fetching contract info for ${uniqueAddresses.length} unique addresses...`);

    for (let i = 0; i < uniqueAddresses.length; i++) {
      const address = uniqueAddresses[i];

      try {
        const info = await this.getContractInfo(address, network);
        if (info) {
          result.set(address, info);
        }

        // Rate limiting: 5 calls per second (Etherscan free tier)
        if ((i + 1) % 5 === 0) {
          await this.sleep(1000);
          this.logger.log(`Progress: ${i + 1}/${uniqueAddresses.length} contracts`);
        }
      } catch (error) {
        this.logger.error(`Error fetching contract ${address}: ${error.message}`);
      }
    }

    this.logger.log(`Completed fetching ${result.size} contract infos`);
    return result;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
