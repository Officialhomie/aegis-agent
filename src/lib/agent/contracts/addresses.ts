/**
 * Typed contract address registry for Base Sepolia (testnet) and Base mainnet.
 * Used for whitelisting and chain-specific DeFi interactions.
 */

export const CONTRACTS = {
  baseSepolia: {
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    WETH: "0x4200000000000000000000000000000000000006",
    ENTRY_POINT: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    uniswap: {
      factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
      swapRouter: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
      universalRouter: "0x492E6456D9528771018DeB9E87ef7750EF184104",
      positionManager: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
  },
  base: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    WETH: "0x4200000000000000000000000000000000000006",
    ENTRY_POINT: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    uniswap: {
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      swapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481",
      universalRouter: "0x6fF5693b99212Da76ad316178A184AB56D299b43",
      positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
    aave: {
      pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
      wethGateway: "0xa0d9C1E9E48Ca30c8d8C3B5D69FF5dc1f6DFfC24",
    },
  },
} as const;
