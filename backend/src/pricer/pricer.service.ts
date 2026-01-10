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

    const events = await this.prisma.taxEvent.findMany({
      where: { jobId },
      orderBy: { timestamp: 'asc' },
    });

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      try {
        // Price tokens
        if (event.tokenIn) {
          const price = await this.getTokenPrice(
            event.tokenIn,
            event.tokenInSymbol || 'UNKNOWN',
            event.timestamp,
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
        }

        if (event.tokenOut) {
          const price = await this.getTokenPrice(
            event.tokenOut,
            event.tokenOutSymbol || 'UNKNOWN',
            event.timestamp,
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
        }

        // Price gas fee in ETH
        const ethPrice = await this.getTokenPrice('ETH', 'ETH', event.timestamp);
        if (ethPrice) {
          const gasFeeEthBN = ethers.BigNumber.from(event.gasFeeEth);
          const gasFeeEthDecimal = parseFloat(ethers.utils.formatEther(gasFeeEthBN));
          const gasFeeUsd = (gasFeeEthDecimal * parseFloat(ethPrice.priceUsd)).toFixed(2);

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
    const price = await this.fetchPriceFromAPI(tokenSymbol, timestamp);

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
   * Fetch price from external API (CoinMarketCap, CoinGecko, etc.)
   */
  private async fetchPriceFromAPI(symbol: string, timestamp: Date): Promise<PriceData | null> {
    // For MVP, we'll use a simple approach
    // In production, you'd use CoinMarketCap historical data API

    // ETH price approximation (for demo)
    if (symbol === 'ETH') {
      // You can replace this with actual API call
      // For now, use approximate ETH prices by year
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

    // For MVP, assume 18 decimals
    // In production, you'd fetch this from the token contract
    return 18;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
