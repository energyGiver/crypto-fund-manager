import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stablecoin addresses (lowercase)
 * These are treated as $1.00 without external API calls
 */
const STABLECOINS = new Set([
  // USDC
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC (Ethereum)
  // USDT
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT (Ethereum)
  // DAI
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI (Ethereum)
  // BUSD
  '0x4fabb145d64652a948d72533023f6e7a623c7c53', // BUSD (Ethereum)
  // FRAX
  '0x853d955acef822db058eb8505911ed77f175b99e', // FRAX (Ethereum)
  // USDbC (Base)
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', // USDbC
]);

/**
 * Well-known token symbols for reference
 */
const TOKEN_SYMBOLS: { [address: string]: string } = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
  // Add more as needed
};

/**
 * Token decimals (most ERC20 use 18, but stablecoins and WBTC use different)
 */
const TOKEN_DECIMALS: { [address: string]: number } = {
  // Stablecoins (6 decimals)
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,  // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,  // USDT
  // WBTC (8 decimals)
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 8,  // WBTC
  // Default: 18 decimals for most ERC20
};

interface PriceResult {
  priceUsd: string;
  source: 'stable' | 'defillama' | 'cache' | 'fallback';
  symbol?: string;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly DEFILLAMA_BASE = 'https://coins.llama.fi';

  constructor(private prisma: PrismaService) {}

  /**
   * Get token price at specific timestamp
   *
   * Priority:
   * 1. Stablecoin → $1.00
   * 2. Cache → return cached price
   * 3. DefiLlama API → fetch and cache
   */
  async getPriceAtTime(
    tokenAddress: string,
    timestamp: Date,
    network: string = 'ethereum',
  ): Promise<PriceResult> {
    const token = tokenAddress.toLowerCase();

    // Special case: ETH (native)
    if (token === 'eth') {
      return this.getPriceAtTime(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
        timestamp,
        network,
      );
    }

    // Step 1: Check if stablecoin
    if (STABLECOINS.has(token)) {
      return {
        priceUsd: '1.0',
        source: 'stable',
        symbol: TOKEN_SYMBOLS[token] || 'Stablecoin',
      };
    }

    // Step 2: Check cache (within 5 minute window)
    const cached = await this.getCachedPrice(token, timestamp);
    if (cached) {
      return {
        priceUsd: cached.priceUsd,
        source: 'cache',
        symbol: cached.tokenSymbol,
      };
    }

    // Step 3: Fetch from DefiLlama
    try {
      const result = await this.fetchFromDefiLlama(token, timestamp, network);

      // Cache the result
      await this.cachePrice(token, timestamp, result.priceUsd, 'defillama', result.symbol);

      return result;
    } catch (error) {
      this.logger.error(`Failed to fetch price for ${token} at ${timestamp}: ${error.message}`);

      // Fallback: return null or error indicator
      return {
        priceUsd: '0',
        source: 'fallback',
        symbol: TOKEN_SYMBOLS[token] || 'UNKNOWN',
      };
    }
  }

  /**
   * Fetch price from DefiLlama API
   */
  private async fetchFromDefiLlama(
    tokenAddress: string,
    timestamp: Date,
    network: string,
  ): Promise<PriceResult> {
    const unixTimestamp = Math.floor(timestamp.getTime() / 1000);
    const coin = `${network}:${tokenAddress}`;

    // DefiLlama endpoint: /prices/historical/{timestamp}/{coins}
    const url = `${this.DEFILLAMA_BASE}/prices/historical/${unixTimestamp}/${coin}`;

    this.logger.debug(`Fetching price from DefiLlama: ${url}`);

    const response = await fetch(url);

    // Check if response is ok (status 200-299)
    if (!response.ok) {
      const statusText = response.statusText || response.status.toString();
      throw new Error(`DefiLlama API error: ${statusText} (status ${response.status})`);
    }

    // Try to parse JSON, catch rate limiting or HTML error pages
    let data: any;
    try {
      data = await response.json();
    } catch (parseError) {
      // If JSON parsing fails, it's likely an HTML error page (rate limiting)
      const contentType = response.headers.get('content-type');
      throw new Error(
        `DefiLlama returned non-JSON response (${contentType}). ` +
        `This usually means rate limiting. Please wait and try again.`
      );
    }

    // Response format: { coins: { "ethereum:0x...": { price, symbol, timestamp, confidence } } }
    if (data.coins && data.coins[coin]) {
      const coinData = data.coins[coin];
      return {
        priceUsd: coinData.price.toString(),
        source: 'defillama',
        symbol: coinData.symbol || TOKEN_SYMBOLS[tokenAddress] || 'UNKNOWN',
      };
    }

    throw new Error(`No price data from DefiLlama for ${coin}`);
  }

  /**
   * Get cached price (within 5 minute window)
   */
  private async getCachedPrice(tokenAddress: string, timestamp: Date): Promise<any | null> {
    const windowStart = new Date(timestamp.getTime() - 5 * 60 * 1000); // -5 min
    const windowEnd = new Date(timestamp.getTime() + 5 * 60 * 1000);   // +5 min

    const cached = await this.prisma.priceCache.findFirst({
      where: {
        tokenAddress,
        timestamp: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    return cached;
  }

  /**
   * Cache price in database
   */
  private async cachePrice(
    tokenAddress: string,
    timestamp: Date,
    priceUsd: string,
    source: string,
    symbol?: string,
  ): Promise<void> {
    try {
      await this.prisma.priceCache.create({
        data: {
          tokenAddress,
          tokenSymbol: symbol || 'UNKNOWN',
          timestamp,
          priceUsd,
          source,
        },
      });
    } catch (error) {
      // Ignore duplicate key errors (race condition)
      if (!error.message?.includes('unique constraint')) {
        this.logger.warn(`Failed to cache price: ${error.message}`);
      }
    }
  }

  /**
   * Batch fetch prices for multiple tokens at same timestamp
   * (Optimization for future use)
   */
  async getBatchPricesAtTime(
    tokens: string[],
    timestamp: Date,
    network: string = 'ethereum',
  ): Promise<Map<string, PriceResult>> {
    const results = new Map<string, PriceResult>();

    // For PoC: sequential fetching with small delay
    for (const token of tokens) {
      const price = await this.getPriceAtTime(token, timestamp, network);
      results.set(token.toLowerCase(), price);

      // Rate limiting: 100ms delay between API calls
      await this.sleep(100);
    }

    return results;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get token symbol (for display)
   */
  getTokenSymbol(tokenAddress: string): string {
    return TOKEN_SYMBOLS[tokenAddress.toLowerCase()] || 'UNKNOWN';
  }

  /**
   * Get token decimals (default 18 for most ERC20)
   */
  getTokenDecimals(tokenAddress: string): number {
    return TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18;
  }
}
