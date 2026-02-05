/**
 * Official ERC-8004 contract addresses
 * Source: https://github.com/erc-8004/erc-8004-contracts
 */

export const ERC8004_ADDRESSES = {
  mainnet: {
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  },
  sepolia: {
    identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
  },
  'base-sepolia': {
    identityRegistry: '0xD8d5adc56A0B3666731222A5283b5F672dab1893',
    reputationRegistry: '',
  },
} as const;

export type ERC8004Network = keyof typeof ERC8004_ADDRESSES;
