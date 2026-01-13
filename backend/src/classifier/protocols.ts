/**
 * Protocol Database
 * Known DeFi protocol contracts and their method signatures
 */

export interface ProtocolInfo {
  name: string;
  category: 'DEX' | 'LENDING' | 'STAKING' | 'YIELD' | 'BRIDGE';
  contracts: {
    [key: string]: string; // address -> contract name
  };
  methods: {
    [selector: string]: {
      name: string;
      category: 'SWAP' | 'DEPOSIT' | 'WITHDRAW' | 'STAKE' | 'CLAIM' | 'BORROW' | 'REPAY';
    };
  };
}

export const PROTOCOLS: { [key: string]: ProtocolInfo } = {
  // Uniswap V2
  uniswap_v2: {
    name: 'Uniswap V2',
    category: 'DEX',
    contracts: {
      '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Router',
    },
    methods: {
      '0x38ed1739': { name: 'swapExactTokensForTokens', category: 'SWAP' },
      '0x8803dbee': { name: 'swapTokensForExactTokens', category: 'SWAP' },
      '0x7ff36ab5': { name: 'swapExactETHForTokens', category: 'SWAP' },
      '0x18cbafe5': { name: 'swapExactTokensForETH', category: 'SWAP' },
    },
  },

  // Uniswap V3
  uniswap_v3: {
    name: 'Uniswap V3',
    category: 'DEX',
    contracts: {
      '0xe592427a0aece92de3edee1f18e0157c05861564': 'SwapRouter',
      '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'SwapRouter02',
    },
    methods: {
      '0x414bf389': { name: 'exactInputSingle', category: 'SWAP' },
      '0xb858183f': { name: 'exactInput', category: 'SWAP' },
      '0xdb3e2198': { name: 'exactOutputSingle', category: 'SWAP' },
      '0x09b81346': { name: 'exactOutput', category: 'SWAP' },
    },
  },

  // Lido
  lido: {
    name: 'Lido',
    category: 'STAKING',
    contracts: {
      '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'stETH',
      '0x889edc2edab5f40e902b864ad4d7ade8e412f9b1': 'Withdrawal Queue',
    },
    methods: {
      '0xa1903eab': { name: 'submit', category: 'STAKE' },
      '0x00f714ce': { name: 'submit (with referral)', category: 'STAKE' },
      '0x3a4b66f1': { name: 'requestWithdrawals', category: 'WITHDRAW' },
      '0xf7ec0e5e': { name: 'claimWithdrawals', category: 'CLAIM' },
    },
  },

  // Rocket Pool
  rocket_pool: {
    name: 'Rocket Pool',
    category: 'STAKING',
    contracts: {
      '0xae78736cd615f374d3085123a210448e74fc6393': 'rETH',
      '0x2cac916b2a963bf162f076c0a8a4a8200bcfbfb4': 'Deposit Pool',
    },
    methods: {
      '0xd0e30db0': { name: 'deposit', category: 'DEPOSIT' },
      '0x2e1a7d4d': { name: 'withdraw', category: 'WITHDRAW' },
    },
  },

  // Aave V2
  aave_v2: {
    name: 'Aave V2',
    category: 'LENDING',
    contracts: {
      '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9': 'Lending Pool',
    },
    methods: {
      '0xe8eda9df': { name: 'deposit', category: 'DEPOSIT' },
      '0x69328dec': { name: 'withdraw', category: 'WITHDRAW' },
      '0xa415bcad': { name: 'borrow', category: 'BORROW' },
      '0x573ade81': { name: 'repay', category: 'REPAY' },
    },
  },

  // Aave V3
  aave_v3: {
    name: 'Aave V3',
    category: 'LENDING',
    contracts: {
      '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Pool',
    },
    methods: {
      '0x617ba037': { name: 'supply', category: 'DEPOSIT' },
      '0x69328dec': { name: 'withdraw', category: 'WITHDRAW' },
      '0xa415bcad': { name: 'borrow', category: 'BORROW' },
      '0x573ade81': { name: 'repay', category: 'REPAY' },
    },
  },

  // Compound V2
  compound_v2: {
    name: 'Compound V2',
    category: 'LENDING',
    contracts: {
      '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643': 'cDAI',
      '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5': 'cETH',
      '0x39aa39c021dfbae8fac545936693ac917d5e7563': 'cUSDC',
      '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9': 'cUSDT',
    },
    methods: {
      '0xa0712d68': { name: 'mint', category: 'DEPOSIT' },
      '0xdb006a75': { name: 'redeem', category: 'WITHDRAW' },
      '0xc5ebeaec': { name: 'borrow', category: 'BORROW' },
      '0x0e752702': { name: 'repayBorrow', category: 'REPAY' },
    },
  },

  // Curve
  curve: {
    name: 'Curve',
    category: 'DEX',
    contracts: {
      '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7': '3pool',
      '0xd51a44d3fae010294c616388b506acda1bfaae46': 'TriCrypto2',
      '0xa5407eae9ba41422680e2e00537571bcc53efbfd': 'sUSD Pool',
    },
    methods: {
      '0x3df02124': { name: 'exchange', category: 'SWAP' },
      '0x394747c5': { name: 'exchange_underlying', category: 'SWAP' },
      '0x0b4c7e4d': { name: 'add_liquidity', category: 'DEPOSIT' },
      '0x5b36389c': { name: 'remove_liquidity', category: 'WITHDRAW' },
    },
  },

  // 1inch
  oneinch: {
    name: '1inch',
    category: 'DEX',
    contracts: {
      '0x1111111254eeb25477b68fb85ed929f73a960582': 'AggregationRouter V5',
      '0x111111125421ca6dc452d289314280a0f8842a65': 'AggregationRouter V6',
    },
    methods: {
      '0x12aa3caf': { name: 'swap', category: 'SWAP' },
      '0x7c025200': { name: 'swap', category: 'SWAP' },
      '0xe449022e': { name: 'uniswapV3Swap', category: 'SWAP' },
    },
  },

  // Balancer V2
  balancer_v2: {
    name: 'Balancer V2',
    category: 'DEX',
    contracts: {
      '0xba12222222228d8ba445958a75a0704d566bf2c8': 'Vault',
    },
    methods: {
      '0x52bbbe29': { name: 'swap', category: 'SWAP' },
      '0x945bcec9': { name: 'batchSwap', category: 'SWAP' },
      '0xb95cac28': { name: 'joinPool', category: 'DEPOSIT' },
      '0x8bdb3913': { name: 'exitPool', category: 'WITHDRAW' },
    },
  },

  // SushiSwap
  sushiswap: {
    name: 'SushiSwap',
    category: 'DEX',
    contracts: {
      '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': 'Router',
    },
    methods: {
      '0x38ed1739': { name: 'swapExactTokensForTokens', category: 'SWAP' },
      '0x8803dbee': { name: 'swapTokensForExactTokens', category: 'SWAP' },
      '0x7ff36ab5': { name: 'swapExactETHForTokens', category: 'SWAP' },
      '0x18cbafe5': { name: 'swapExactTokensForETH', category: 'SWAP' },
    },
  },

  // Yearn Finance
  yearn: {
    name: 'Yearn Finance',
    category: 'YIELD',
    contracts: {
      '0xda816459f1ab5631232fe5e97a05bbbb94970c95': 'yvDAI',
      '0xa354f35829ae975e850e23e9615b11da1b3dc4de': 'yvUSDC',
    },
    methods: {
      '0xb6b55f25': { name: 'deposit', category: 'DEPOSIT' },
      '0x2e1a7d4d': { name: 'withdraw', category: 'WITHDRAW' },
      '0x3ccfd60b': { name: 'withdraw (with shares)', category: 'WITHDRAW' },
    },
  },
};

// Build reverse lookup: address -> protocol
export const CONTRACT_TO_PROTOCOL: { [address: string]: { protocolId: string; contractName: string } } = {};

for (const [protocolId, protocol] of Object.entries(PROTOCOLS)) {
  for (const [address, contractName] of Object.entries(protocol.contracts)) {
    CONTRACT_TO_PROTOCOL[address.toLowerCase()] = { protocolId, contractName };
  }
}

// Common method selectors that appear across protocols
export const COMMON_METHODS = {
  '0xd0e30db0': 'deposit',
  '0x2e1a7d4d': 'withdraw',
  '0xa0712d68': 'mint',
  '0x095ea7b3': 'approve',
  '0xa9059cbb': 'transfer',
  '0x23b872dd': 'transferFrom',
};

// ERC20 and common event signatures
export const EVENT_SIGNATURES = {
  TRANSFER: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  APPROVAL: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
  SWAP: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822', // Uniswap V2
  DEPOSIT: '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c', // Aave
  WITHDRAWAL: '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65', // Aave
};
