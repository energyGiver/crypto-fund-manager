import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { ethers } from 'ethers';
import { PROTOCOLS, CONTRACT_TO_PROTOCOL, EVENT_SIGNATURES } from './protocols';

export enum TaxCategory {
  DISPOSAL = 'DISPOSAL',
  STAKING = 'STAKING',
  AIRDROP = 'AIRDROP',
  TRANSFER = 'TRANSFER',
  DEDUCTION = 'DEDUCTION',
}

interface ClassifiedEvent {
  txHash: string;
  timestamp: Date;
  category: TaxCategory;
  tokenIn?: string;
  tokenInSymbol?: string;
  tokenInAmount?: string;
  tokenInUsd?: string;
  tokenOut?: string;
  tokenOutSymbol?: string;
  tokenOutAmount?: string;
  tokenOutUsd?: string;
  gasFeeEth: string;
  gasFeeUsd?: string;
  protocol?: string;
  notes?: string;
}

@Injectable()
export class ClassifierService {
  private readonly logger = new Logger(ClassifierService.name);

  constructor(
    private prisma: PrismaService,
    private pricingService: PricingService,
  ) {}

  /**
   * Classify all transactions for a job
   */
  async classifyTransactions(jobId: string): Promise<void> {
    this.logger.log(`Classifying transactions for job ${jobId}`);

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { jobId },
      orderBy: { timestamp: 'asc' },
    });

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      try {
        const events = await this.classifyTransaction(tx, job.address);

        // Enrich events with USD prices
        for (const event of events) {
          await this.enrichWithPrices(event, job.network);
        }

        // Save each classified event
        for (const event of events) {
          await this.prisma.taxEvent.create({
            data: {
              jobId,
              txHash: event.txHash,
              timestamp: event.timestamp,
              category: event.category,
              tokenIn: event.tokenIn,
              tokenInSymbol: event.tokenInSymbol,
              tokenInAmount: event.tokenInAmount,
              tokenInUsd: event.tokenInUsd,
              tokenOut: event.tokenOut,
              tokenOutSymbol: event.tokenOutSymbol,
              tokenOutAmount: event.tokenOutAmount,
              tokenOutUsd: event.tokenOutUsd,
              gasFeeEth: event.gasFeeEth,
              gasFeeUsd: event.gasFeeUsd,
              protocol: event.protocol,
              notes: event.notes,
            },
          });
        }

        // Update progress
        const progressPct = Math.floor(((i + 1) / transactions.length) * 100);
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            progressPct,
            stage: 'CLASSIFYING',
          },
        });
      } catch (error) {
        this.logger.error(`Error classifying tx ${tx.txHash}: ${error.message}`);
      }
    }

    this.logger.log(`Completed classifying transactions for job ${jobId}`);
  }

  /**
   * Classify a single transaction
   */
  private async classifyTransaction(tx: any, userAddress: string): Promise<ClassifiedEvent[]> {
    const events: ClassifiedEvent[] = [];
    const logs = JSON.parse(tx.logs);

    // Calculate gas fee
    const gasFeeEth = ethers.BigNumber.from(tx.gasUsed)
      .mul(ethers.BigNumber.from(tx.gasPrice))
      .toString();

    // Normalize addresses
    const toAddress = tx.to?.toLowerCase();
    const userAddr = userAddress.toLowerCase();

    // Check if transaction is to a known protocol
    const protocolInfo = toAddress ? CONTRACT_TO_PROTOCOL[toAddress] : null;

    if (protocolInfo) {
      // Known protocol - use specialized classification
      const protocol = PROTOCOLS[protocolInfo.protocolId];
      const methodInfo = tx.methodSelector ? protocol.methods[tx.methodSelector] : null;

      if (methodInfo) {
        const event = this.classifyKnownProtocol(
          tx,
          logs,
          gasFeeEth,
          protocol,
          methodInfo,
          userAddr,
        );
        if (event) {
          events.push(event);
          return events;
        }
      }
    }

    // Fallback: Generic classification based on transfers
    const transferEvents = this.classifyByTransfers(tx, logs, gasFeeEth, userAddr);
    if (transferEvents.length > 0) {
      events.push(...transferEvents);
      return events;
    }

    // Check for ETH transfers
    if (ethers.BigNumber.from(tx.value).gt(0)) {
      events.push({
        txHash: tx.txHash,
        timestamp: tx.timestamp,
        category: TaxCategory.TRANSFER,
        tokenOut: 'ETH',
        tokenOutSymbol: 'ETH',
        tokenOutAmount: tx.value,
        gasFeeEth,
        notes: 'ETH transfer',
      });
    }

    // If no events, just record gas deduction
    if (events.length === 0) {
      events.push({
        txHash: tx.txHash,
        timestamp: tx.timestamp,
        category: TaxCategory.DEDUCTION,
        gasFeeEth,
        notes: 'Gas fee only',
      });
    }

    return events;
  }

  /**
   * Classify transaction from known protocol
   */
  private classifyKnownProtocol(
    tx: any,
    logs: any[],
    gasFeeEth: string,
    protocol: any,
    methodInfo: any,
    userAddress: string,
  ): ClassifiedEvent | null {
    const transfers = logs.filter(log => log.topics[0] === EVENT_SIGNATURES.TRANSFER);

    // Determine category based on method and protocol
    let category: TaxCategory;
    let notes = `${protocol.name} - ${methodInfo.name}`;

    if (protocol.category === 'DEX' && methodInfo.category === 'SWAP') {
      category = TaxCategory.DISPOSAL;
      notes = `${protocol.name} swap`;
    } else if (protocol.category === 'STAKING' && methodInfo.category === 'STAKE') {
      category = TaxCategory.STAKING;
      notes = `${protocol.name} staking`;
    } else if (methodInfo.category === 'DEPOSIT' || methodInfo.category === 'STAKE') {
      category = TaxCategory.DISPOSAL; // Depositing is disposing
      notes = `${protocol.name} deposit`;
    } else if (methodInfo.category === 'WITHDRAW' || methodInfo.category === 'CLAIM') {
      category = TaxCategory.TRANSFER; // Withdrawing is receiving
      notes = `${protocol.name} withdrawal`;
    } else if (methodInfo.category === 'BORROW') {
      category = TaxCategory.TRANSFER; // Borrowing is receiving (with debt)
      notes = `${protocol.name} borrow`;
    } else if (methodInfo.category === 'REPAY') {
      category = TaxCategory.DISPOSAL; // Repaying is disposing
      notes = `${protocol.name} repay`;
    } else {
      category = TaxCategory.DEDUCTION;
    }

    // Parse token transfers to determine amounts
    let tokenIn: string | undefined;
    let tokenInSymbol: string | undefined;
    let tokenInAmount: string | undefined;
    let tokenOut: string | undefined;
    let tokenOutSymbol: string | undefined;
    let tokenOutAmount: string | undefined;

    // Find transfers involving user
    const userTransfersOut = transfers.filter(t => {
      const from = t.topics[1] ? '0x' + t.topics[1].slice(26).toLowerCase() : '';
      return from === userAddress;
    });

    const userTransfersIn = transfers.filter(t => {
      const to = t.topics[2] ? '0x' + t.topics[2].slice(26).toLowerCase() : '';
      return to === userAddress;
    });

    // Token out (user sent)
    if (userTransfersOut.length > 0) {
      const transfer = userTransfersOut[0];
      tokenOut = transfer.address.toLowerCase();
      tokenOutAmount = ethers.BigNumber.from(transfer.data).toString();
    }

    // Token in (user received)
    if (userTransfersIn.length > 0) {
      const transfer = userTransfersIn[userTransfersIn.length - 1];
      tokenIn = transfer.address.toLowerCase();
      tokenInAmount = ethers.BigNumber.from(transfer.data).toString();
    }

    // Handle ETH value
    const ethValue = tx.value;
    if (ethers.BigNumber.from(ethValue).gt(0)) {
      if (!tokenOut) {
        tokenOut = 'ETH';
        tokenOutSymbol = 'ETH';
        tokenOutAmount = ethValue;
      }
    }

    return {
      txHash: tx.txHash,
      timestamp: tx.timestamp,
      category,
      tokenIn,
      tokenInSymbol,
      tokenInAmount,
      tokenOut,
      tokenOutSymbol,
      tokenOutAmount,
      gasFeeEth,
      protocol: protocol.name,
      notes,
    };
  }

  /**
   * Generic classification based on token transfers
   *
   * This handles cases where user initiates tx but transfers happen
   * through proxy contracts, vaults, or aggregators (user not in Transfer logs)
   */
  private classifyByTransfers(
    tx: any,
    logs: any[],
    gasFeeEth: string,
    userAddress: string,
  ): ClassifiedEvent[] {
    const events: ClassifiedEvent[] = [];
    const transfers = logs.filter(log => log.topics[0] === EVENT_SIGNATURES.TRANSFER);

    if (transfers.length === 0) {
      return events;
    }

    // Check if user is directly in any Transfer logs
    const userInTransfers = transfers.some(t => {
      const from = t.topics[1] ? '0x' + t.topics[1].slice(26).toLowerCase() : '';
      const to = t.topics[2] ? '0x' + t.topics[2].slice(26).toLowerCase() : '';
      return from === userAddress || to === userAddress;
    });

    if (userInTransfers) {
      // User appears in Transfer logs - use direct matching
      return this.classifyByDirectTransfers(tx, transfers, gasFeeEth, userAddress);
    }

    // User NOT in Transfer logs - tx initiated by user but executed through proxy/aggregator
    // This is common with DEX aggregators, vaults, etc.
    if (tx.from.toLowerCase() === userAddress) {
      return this.classifyByProxyTransfers(tx, transfers, gasFeeEth);
    }

    return events;
  }

  /**
   * Classify when user address appears directly in Transfer logs
   */
  private classifyByDirectTransfers(
    tx: any,
    transfers: any[],
    gasFeeEth: string,
    userAddress: string,
  ): ClassifiedEvent[] {
    const events: ClassifiedEvent[] = [];

    for (const transfer of transfers) {
      const from = transfer.topics[1] ? '0x' + transfer.topics[1].slice(26).toLowerCase() : '';
      const to = transfer.topics[2] ? '0x' + transfer.topics[2].slice(26).toLowerCase() : '';
      const amount = ethers.BigNumber.from(transfer.data).toString();

      // Incoming transfer to user
      if (to === userAddress) {
        // Check if it's an airdrop (no corresponding outflow in same tx)
        const hasOutflow = transfers.some(t => {
          const outFrom = t.topics[1] ? '0x' + t.topics[1].slice(26).toLowerCase() : '';
          return outFrom === userAddress;
        });

        // Check if from is zero address (mint/airdrop)
        const isFromZero = from === '0x0000000000000000000000000000000000000000';

        const category = !hasOutflow || isFromZero ? TaxCategory.AIRDROP : TaxCategory.TRANSFER;

        events.push({
          txHash: tx.txHash,
          timestamp: tx.timestamp,
          category,
          tokenIn: transfer.address.toLowerCase(),
          tokenInAmount: amount,
          gasFeeEth,
          notes: category === TaxCategory.AIRDROP ? 'Potential airdrop/reward' : 'Token received',
        });
      }

      // Outgoing transfer from user
      if (from === userAddress && to !== userAddress) {
        // Check if it's a swap (has incoming transfer in same tx)
        const hasInflow = transfers.some(t => {
          const inTo = t.topics[2] ? '0x' + t.topics[2].slice(26).toLowerCase() : '';
          return inTo === userAddress;
        });

        const category = hasInflow ? TaxCategory.DISPOSAL : TaxCategory.TRANSFER;

        events.push({
          txHash: tx.txHash,
          timestamp: tx.timestamp,
          category,
          tokenOut: transfer.address.toLowerCase(),
          tokenOutAmount: amount,
          gasFeeEth,
          notes: category === TaxCategory.DISPOSAL ? 'Token swap/exchange' : 'Token sent',
        });
      }
    }

    return events;
  }

  /**
   * Classify when user initiates tx but transfers happen through proxy/aggregator
   * User address NOT in Transfer logs
   */
  private classifyByProxyTransfers(
    tx: any,
    transfers: any[],
    gasFeeEth: string,
  ): ClassifiedEvent[] {
    const events: ClassifiedEvent[] = [];

    // Group transfers by token address
    const tokenMap = new Map<string, any[]>();
    transfers.forEach(t => {
      const token = t.address.toLowerCase();
      if (!tokenMap.has(token)) {
        tokenMap.set(token, []);
      }
      tokenMap.get(token)!.push(t);
    });

    // If multiple different tokens involved → likely a SWAP
    if (tokenMap.size >= 2) {
      // Find net flows for each token
      const netFlows = new Map<string, { in: string; out: string; net: ethers.BigNumber }>();

      for (const [token, tokenTransfers] of tokenMap) {
        let totalIn = ethers.BigNumber.from(0);
        let totalOut = ethers.BigNumber.from(0);

        // Calculate net flow (this helps identify which token was exchanged for which)
        tokenTransfers.forEach(t => {
          const amount = ethers.BigNumber.from(t.data);
          // We can't track specific from/to, so we sum all transfers
          totalIn = totalIn.add(amount);
          totalOut = totalOut.add(amount);
        });

        netFlows.set(token, {
          in: totalIn.toString(),
          out: totalOut.toString(),
          net: totalIn.sub(totalOut),
        });
      }

      // Create a single DISPOSAL event with tokens involved
      const tokens = Array.from(tokenMap.keys());

      // First token group is typically tokenOut, second is tokenIn
      // This is a heuristic but works for most swap patterns
      const tokenOut = tokens[0];
      const tokenOutTransfers = tokenMap.get(tokenOut)!;
      const tokenOutAmount = ethers.BigNumber.from(tokenOutTransfers[0].data).toString();

      const tokenIn = tokens[tokens.length - 1];
      const tokenInTransfers = tokenMap.get(tokenIn)!;
      const tokenInAmount = ethers.BigNumber.from(tokenInTransfers[tokenInTransfers.length - 1].data).toString();

      events.push({
        txHash: tx.txHash,
        timestamp: tx.timestamp,
        category: TaxCategory.DISPOSAL,
        tokenOut,
        tokenOutAmount,
        tokenIn,
        tokenInAmount,
        gasFeeEth,
        notes: 'Swap via aggregator/proxy',
      });
    } else if (tokenMap.size === 1) {
      // Single token - could be deposit/withdraw to vault or simple transfer
      // Since user initiated, likely a deposit or interaction with protocol
      const token = Array.from(tokenMap.keys())[0];
      const tokenTransfers = tokenMap.get(token)!;

      // If there are multiple transfers of same token, it's likely a deposit/withdraw cycle
      // For now, classify as TRANSFER (can be refined later)
      events.push({
        txHash: tx.txHash,
        timestamp: tx.timestamp,
        category: TaxCategory.TRANSFER,
        tokenOut: token,
        tokenOutAmount: ethers.BigNumber.from(tokenTransfers[0].data).toString(),
        gasFeeEth,
        notes: 'Token interaction via proxy',
      });
    }

    return events;
  }

  /**
   * Enrich event with USD prices
   */
  private async enrichWithPrices(event: ClassifiedEvent, network: string): Promise<void> {
    try {
      // Get ETH price for gas fee (WETH as proxy)
      const ethPrice = await this.pricingService.getPriceAtTime(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
        event.timestamp,
        network,
      );

      // Calculate gas fee in USD
      const gasFeeEthFloat = parseFloat(ethers.utils.formatEther(event.gasFeeEth));
      event.gasFeeUsd = (gasFeeEthFloat * parseFloat(ethPrice.priceUsd)).toFixed(6);

      // Get tokenIn price and calculate USD value
      if (event.tokenIn && event.tokenInAmount) {
        const tokenInPrice = await this.pricingService.getPriceAtTime(
          event.tokenIn,
          event.timestamp,
          network,
        );

        // Update symbol if we got it from pricing service
        if (tokenInPrice.symbol && !event.tokenInSymbol) {
          event.tokenInSymbol = tokenInPrice.symbol;
        }

        // Calculate USD value using correct decimals
        const decimalsIn = this.pricingService.getTokenDecimals(event.tokenIn);
        const amountFloat = parseFloat(event.tokenInAmount) / Math.pow(10, decimalsIn);
        event.tokenInUsd = (amountFloat * parseFloat(tokenInPrice.priceUsd)).toFixed(2);
      }

      // Get tokenOut price and calculate USD value
      if (event.tokenOut && event.tokenOutAmount) {
        const tokenOutPrice = await this.pricingService.getPriceAtTime(
          event.tokenOut,
          event.timestamp,
          network,
        );

        // Update symbol if we got it from pricing service
        if (tokenOutPrice.symbol && !event.tokenOutSymbol) {
          event.tokenOutSymbol = tokenOutPrice.symbol;
        }

        // Calculate USD value using correct decimals
        const decimalsOut = this.pricingService.getTokenDecimals(event.tokenOut);
        const amountFloat = parseFloat(event.tokenOutAmount) / Math.pow(10, decimalsOut);
        event.tokenOutUsd = (amountFloat * parseFloat(tokenOutPrice.priceUsd)).toFixed(2);
      }
    } catch (error) {
      this.logger.warn(`Failed to enrich event ${event.txHash} with prices: ${error.message}`);
      // Continue without prices - they'll be null in the database
    }
  }
}
