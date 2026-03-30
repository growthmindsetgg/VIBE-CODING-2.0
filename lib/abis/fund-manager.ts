import { parseAbi } from "viem";

export const fundManagerAbi = parseAbi([
  "function subscribe(uint256 usdcAmount)",
  "function deposit(uint256 amount)",
  "function setShareToken(address token_)",
  "function shareToken() view returns (address)",
  "function shareTokenConfigured() view returns (bool)",
  "function usdc() view returns (address)",
  "event Subscribe(address indexed user, uint256 usdcIn, uint256 sharesOut)",
]);
