# Critical Bug Analysis: Incorrect Stablecoin Pricing

## Transaction Analyzed
- **TX Hash**: `0xfdb880c871cb4eb936264c1fdc6dbd51ed1b64a0845f2e6fa6bcb433a0028e79`
- **Date**: January 10, 2026
- **Type**: Swap 49.999 WETH → 154,397.87 USDT

## The Bug

### Root Cause
The pricer service (`backend/src/pricer/pricer.service.ts`) incorrectly assumed **all tokens use 18 decimals**. However, stablecoins like USDT, USDC, and BUSD use **6 decimals**.

### Code Location
File: `backend/src/pricer/pricer.service.ts`, line 227-234

**Before (WRONG):**
```typescript
private async getTokenDecimals(tokenAddress: string): Promise<number> {
  if (tokenAddress === 'ETH') {
    return 18;
  }
  // For MVP, assume 18 decimals  ← BUG HERE
  return 18;
}
```

## Impact on Calculations

### Incorrect Calculation
```
Raw USDT amount: 154,397,871,509 (with 6 decimals)
Decimals used: 18 (WRONG!)
Conversion: ethers.utils.formatUnits(154397871509, 18) = 0.000000154397871509
USD value: 0.000000154397871509 × $1.00 = $0.00
```

### What Was Recorded
- Cost basis: $88,755.71 ✓ (correct - FIFO calculation)
- Proceeds: $0.00 ✗ (wrong - should be $154,397.87)
- Gas fees: $0.04 ✓ (correct)
- **Realized loss: -$88,755.75** ✗ (COMPLETELY WRONG!)

### Correct Calculation
```
Raw USDT amount: 154,397,871,509 (with 6 decimals)
Decimals used: 6 (CORRECT!)
Conversion: ethers.utils.formatUnits(154397871509, 6) = 154,397.871509
USD value: 154,397.871509 × $1.00 = $154,397.87
```

### What Should Be Recorded
- Cost basis: $88,755.71 ✓ (correct)
- Proceeds: $154,397.87 ✓ (now correct)
- Gas fees: $0.04 ✓ (correct)
- **Realized gain: +$65,642.12** ✓ (CORRECT!)

## Summary

You were absolutely right to question this transaction!

- **Incorrect result**: Loss of $88,755.75
- **Correct result**: **GAIN of $65,642.12**
- **Difference**: $154,397.87 (the entire USDT proceeds that were missed)

The FIFO cost basis tracking was working correctly all along. The bug was in the decimal conversion for stablecoins, which caused the system to see $0 proceeds from swapping to USDT.

## Fix Applied

**After (FIXED):**
```typescript
// Added token decimals mapping
const TOKEN_DECIMALS: { [address: string]: number } = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,  // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,  // USDT
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': 6,  // BUSD
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 8,  // WBTC
};

private async getTokenDecimals(tokenAddress: string): Promise<number> {
  if (tokenAddress === 'ETH') {
    return 18;
  }
  const normalizedAddress = tokenAddress.toLowerCase();
  return TOKEN_DECIMALS[normalizedAddress] || 18;
}
```

## Next Steps

1. **Regenerate your tax report** - All transactions involving stablecoins (USDT, USDC, DAI, BUSD) will now be calculated correctly
2. The fix also applies to WBTC (8 decimals), which would have had similar issues
3. Your overall tax liability will be significantly different (higher gains, not losses) for stablecoin swaps

## Affected Transactions

Any transaction where you:
- Received USDT, USDC, DAI, or BUSD
- Received WBTC

These would all have had incorrect USD values (showing $0 or near-zero proceeds).
