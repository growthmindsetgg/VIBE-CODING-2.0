import { parseAbi } from "viem";

/**
 * StableYieldVault — ERC-4626 compliant single-asset stablecoin staking vault.
 * Underlying (USDC / EURC / EURW) is 6 decimals; vault shares inherit `asset().decimals() + offset`
 * but OZ exposes `decimals()` already adjusted, so front-ends should call `decimals()` directly.
 */
export const stableYieldVaultAbi = parseAbi([
  // ERC-20 on the share token
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",

  // ERC-4626 core
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function convertToShares(uint256) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function maxDeposit(address) view returns (uint256)",
  "function maxMint(address) view returns (uint256)",
  "function maxWithdraw(address) view returns (uint256)",
  "function maxRedeem(address) view returns (uint256)",
  "function previewDeposit(uint256) view returns (uint256)",
  "function previewMint(uint256) view returns (uint256)",
  "function previewWithdraw(uint256) view returns (uint256)",
  "function previewRedeem(uint256) view returns (uint256)",
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function mint(uint256 shares, address receiver) returns (uint256 assets)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",

  // Custom read helpers
  "function pricePerShare() view returns (uint256)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",

  // Admin + reward funding
  "function fundRewards(uint256 amount)",
  "function pause()",
  "function unpause()",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
]);

/** Simulation-only variant — no `returns` clause so RPCs that omit returndata don't trip viem. */
export const stableYieldVaultSimAbi = parseAbi([
  "function deposit(uint256 assets, address receiver)",
  "function mint(uint256 shares, address receiver)",
  "function withdraw(uint256 assets, address receiver, address owner)",
  "function redeem(uint256 shares, address receiver, address owner)",
  "function fundRewards(uint256 amount)",
]);
