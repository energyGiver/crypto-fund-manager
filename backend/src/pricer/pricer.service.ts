import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ethers } from 'ethers';

// Stablecoins (always $1)
const STABLECOINS = new Set([
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
  '0x4fabb145d64652a948d72533023f6e7a623c7c53', // BUSD
]);

// Token decimals (most ERC20 use 18, but stablecoins and WBTC use different)
const TOKEN_DECIMALS: { [address: string]: number } = {
  // Stablecoins (6 decimals)
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,  // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,  // USDT
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': 6,  // BUSD
  // WBTC (8 decimals)
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 8,  // WBTC
  // Default: 18 decimals for most ERC20
};

interface PriceData {
  priceUsd: string;
  source: string;
}

@Injectable()
export class PricerService {
  private readonly logger = new Logger(PricerService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * Price all tax events for a job
   */
  async priceTaxEvents(jobId: string): Promise<void> {
    this.logger.log(`Pricing tax events for job ${jobId}`);

    // Get job to determine network
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const nativeToken = job.network === 'mantle' ? 'MNT' : 'ETH';

    const events = await this.prisma.taxEvent.findMany({
      where: { jobId },
      orderBy: { timestamp: 'asc' },
    });

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      try {
        // Price tokens
        if (event.tokenIn && event.tokenInSymbol && event.tokenInSymbol !== 'UNKNOWN') {
          const price = await this.getTokenPrice(
            event.tokenIn,
            event.tokenInSymbol,
            event.timestamp,
            job.network,
          );

          if (price) {
            const amount = ethers.BigNumber.from(event.tokenInAmount || '0');
            const decimals = await this.getTokenDecimals(event.tokenIn);
            const amountDecimal = parseFloat(ethers.utils.formatUnits(amount, decimals));
            const usdValue = (amountDecimal * parseFloat(price.priceUsd)).toFixed(2);

            await this.prisma.taxEvent.update({
              where: { id: event.id },
              data: { tokenInUsd: usdValue },
            });
          }
        } else if (event.tokenIn && !event.tokenInSymbol) {
          this.logger.debug(`Skipping price lookup for tokenIn ${event.tokenIn}: No symbol available (tx: ${event.txHash})`);
        }

        if (event.tokenOut && event.tokenOutSymbol && event.tokenOutSymbol !== 'UNKNOWN') {
          const price = await this.getTokenPrice(
            event.tokenOut,
            event.tokenOutSymbol,
            event.timestamp,
            job.network,
          );

          if (price) {
            const amount = ethers.BigNumber.from(event.tokenOutAmount || '0');
            const decimals = await this.getTokenDecimals(event.tokenOut);
            const amountDecimal = parseFloat(ethers.utils.formatUnits(amount, decimals));
            const usdValue = (amountDecimal * parseFloat(price.priceUsd)).toFixed(2);

            await this.prisma.taxEvent.update({
              where: { id: event.id },
              data: { tokenOutUsd: usdValue },
            });
          }
        } else if (event.tokenOut && !event.tokenOutSymbol) {
          this.logger.debug(`Skipping price lookup for tokenOut ${event.tokenOut}: No symbol available (tx: ${event.txHash})`);
        }

        // Price gas fee in native token (ETH or MNT)
        const nativePrice = await this.getTokenPrice(nativeToken, nativeToken, event.timestamp, job.network);
        if (nativePrice) {
          const gasFeeEthBN = ethers.BigNumber.from(event.gasFeeEth);
          const gasFeeEthDecimal = parseFloat(ethers.utils.formatEther(gasFeeEthBN));
          const gasFeeUsd = (gasFeeEthDecimal * parseFloat(nativePrice.priceUsd)).toFixed(2);

          await this.prisma.taxEvent.update({
            where: { id: event.id },
            data: { gasFeeUsd },
          });
        }

        // Update progress
        const progressPct = Math.floor(((i + 1) / events.length) * 100);
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            progressPct,
            stage: 'PRICING',
          },
        });

        // Rate limiting
        if (i % 5 === 0) {
          await this.sleep(200);
        }
      } catch (error) {
        this.logger.error(`Error pricing event ${event.id}: ${error.message}`);
      }
    }

    this.logger.log(`Completed pricing tax events for job ${jobId}`);
  }

  /**
   * Get token price at specific timestamp
   */
  private async getTokenPrice(
    tokenAddress: string,
    tokenSymbol: string,
    timestamp: Date,
    network: string,
  ): Promise<PriceData | null> {
    const normalizedAddress = tokenAddress.toLowerCase();

    // Check if stablecoin
    if (STABLECOINS.has(normalizedAddress)) {
      return { priceUsd: '1.0', source: 'stable' };
    }

    // Check cache first
    const cached = await this.prisma.priceCache.findFirst({
      where: {
        tokenAddress: normalizedAddress,
        timestamp: {
          gte: new Date(timestamp.getTime() - 3600000), // Within 1 hour
          lte: new Date(timestamp.getTime() + 3600000),
        },
      },
    });

    if (cached) {
      return { priceUsd: cached.priceUsd, source: cached.source };
    }

    // Fetch from CoinMarketCap or other source
    const price = await this.fetchPriceFromAPI(tokenAddress, tokenSymbol, timestamp, network);

    if (price) {
      // Cache the price
      await this.prisma.priceCache.create({
        data: {
          tokenAddress: normalizedAddress,
          tokenSymbol,
          timestamp,
          priceUsd: price.priceUsd,
          source: price.source,
        },
      });

      return price;
    }

    // Fallback: unknown price
    this.logger.warn(`Could not find price for ${tokenSymbol} at ${timestamp}`);
    return null;
  }

  /**
   * Fetch price from external API (CoinMarketCap, CoinGecko, DefiLlama, etc.)
   */
  private async fetchPriceFromAPI(tokenAddress: string, symbol: string, timestamp: Date, network: string): Promise<PriceData | null> {
    // Try DefiLlama first (supports historical data and is free)
    try {
      const timestampUnix = Math.floor(timestamp.getTime() / 1000);
      let defillamaId: string | null = null;

      // For native tokens, use CoinGecko IDs
      const nativeTokenToCoinGeckoId: Record<string, string> = {
        'ETH': 'coingecko:ethereum',
        'MNT': 'coingecko:mantle',
      };

      if (nativeTokenToCoinGeckoId[symbol]) {
        defillamaId = nativeTokenToCoinGeckoId[symbol];
      } else {
        // For ERC20 tokens, use network:address format
        const networkName = network === 'sepolia' ? 'ethereum' : network; // sepolia uses ethereum prices
        defillamaId = `${networkName}:${tokenAddress.toLowerCase()}`;
      }

      if (defillamaId) {
        const url = `https://coins.llama.fi/prices/historical/${timestampUnix}/${defillamaId}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.coins && data.coins[defillamaId]) {
          const price = data.coins[defillamaId].price;
          return { priceUsd: price.toString(), source: 'defillama' };
        }
      }
    } catch (error) {
      this.logger.debug(`DefiLlama API error for ${symbol}: ${error.message}`);
    }

    // Fallback: ETH price approximation
    if (symbol === 'ETH') {
      const year = timestamp.getFullYear();
      const ethPricesByYear: Record<number, number> = {
        2020: 400,
        2021: 2000,
        2022: 1500,
        2023: 1800,
        2024: 2200,
        2025: 2500,
        2026: 2800,
      };

      const price = ethPricesByYear[year] || 2000;
      return { priceUsd: price.toString(), source: 'approximation' };
    }

    // Fallback: MNT price approximation
    if (symbol === 'MNT') {
      const year = timestamp.getFullYear();
      const mntPricesByYear: Record<number, number> = {
        2023: 0.5,
        2024: 0.8,
        2025: 1.0,
        2026: 1.2,
      };

      const price = mntPricesByYear[year] || 0.8;
      return { priceUsd: price.toString(), source: 'approximation' };
    }

    // Try CoinMarketCap API (if key is available)
    const cmcKey = this.configService.get<string>('COINMARKETCAP_API_KEY');
    if (cmcKey && cmcKey !== 'your_coinmarketcap_key_here') {
      try {
        // Note: CMC historical data requires a paid plan
        // For free tier, we can only get current prices
        const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol}`;
        const response = await fetch(url, {
          headers: {
            'X-CMC_PRO_API_KEY': cmcKey,
          },
        });

        const data = await response.json();
        if (data.data && data.data[symbol]) {
          const price = data.data[symbol].quote.USD.price;
          return { priceUsd: price.toString(), source: 'coinmarketcap' };
        }
      } catch (error) {
        this.logger.error(`Error fetching from CoinMarketCap: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Get token decimals (default to 18 for ERC20)
   */
  private async getTokenDecimals(tokenAddress: string): Promise<number> {
    if (tokenAddress === 'ETH') {
      return 18;
    }

    const normalizedAddress = tokenAddress.toLowerCase();
    return TOKEN_DECIMALS[normalizedAddress] || 18;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
