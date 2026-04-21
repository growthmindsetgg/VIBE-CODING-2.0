// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20, IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StableYieldVault
/// @notice Conservative ERC-4626 single-asset yield vault for stablecoins (USDC / EURC / EURW).
///         Users deposit the underlying, receive vault shares, and can redeem later.
///         Yield is distributed by the owner calling `fundRewards`, which transfers more of the
///         underlying into the vault — raising price-per-share for all holders.
///
/// @dev Security posture:
///      - 100% OpenZeppelin v5 primitives (ERC4626, Ownable2Step, Pausable, ReentrancyGuard,
///        SafeERC20). Each is used as documented; no custom token math.
///      - Inflation-attack mitigation: `_decimalsOffset = 6` creates virtual shares so a first
///        depositor cannot donation-griff subsequent depositors (OZ 5.x design).
///      - Checks-effects-interactions + nonReentrant on every externally-visible state transition.
///      - Owner power is intentionally minimal: pause/unpause, fund rewards, rescue NON-asset
///        tokens only. Owner CANNOT withdraw user funds, mint shares, change the asset, or
///        escape the pause gate. There is no proxy, no upgrade path, no delegatecall.
///      - Two-step ownership transfer (Ownable2Step) eliminates accidental ownership loss.
///      - Pause blocks deposit/mint but NEVER blocks withdraw/redeem: users can always exit.
contract StableYieldVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event RewardsFunded(address indexed from, uint256 amount);
    event NonAssetRescued(address indexed token, address indexed to, uint256 amount);
    event PausedBy(address indexed owner);
    event UnpausedBy(address indexed owner);

    error CannotRescueUnderlyingAsset();
    error ZeroAmount();

    /// @param asset_  Underlying ERC-20 (USDC / EURC / EURW — any standard 6-decimals stablecoin).
    /// @param name_   Vault share token name (e.g. "Vibefunds Staked USDC").
    /// @param symbol_ Vault share token symbol (e.g. "sUSDC").
    /// @param owner_  Initial owner (DAO multisig recommended).
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address owner_
    ) ERC20(name_, symbol_) ERC4626(asset_) Ownable(owner_) {}

    // -------------------------------------------------------------------------
    // Inflation-attack mitigation
    // -------------------------------------------------------------------------

    /// @dev OpenZeppelin ERC4626 inflation-attack fix. A decimalsOffset of 6 means each unit of
    ///      underlying corresponds to 10**6 virtual shares, so a first-depositor donation attack
    ///      to skew share price becomes economically unfeasible.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // -------------------------------------------------------------------------
    // User entrypoints (deposit / mint are gated by pause; withdraw / redeem are NOT)
    // -------------------------------------------------------------------------

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (assets == 0) revert ZeroAmount();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        if (shares == 0) revert ZeroAmount();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        if (assets == 0) revert ZeroAmount();
        return super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        if (shares == 0) revert ZeroAmount();
        return super.redeem(shares, receiver, owner_);
    }

    // -------------------------------------------------------------------------
    // Reward funding
    // -------------------------------------------------------------------------

    /// @notice Anyone (not just owner) can top up the vault with more of the underlying.
    ///         This increases `totalAssets()` and therefore price-per-share for every holder.
    ///         Accounting is trust-minimised: we pull exactly `amount` via SafeERC20.
    /// @dev    nonReentrant because we do an external call to the asset contract.
    function fundRewards(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsFunded(msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Owner powers (minimal)
    // -------------------------------------------------------------------------

    /// @notice Pause deposits/mints. Users can still withdraw/redeem.
    function pause() external onlyOwner {
        _pause();
        emit PausedBy(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit UnpausedBy(msg.sender);
    }

    /// @notice Rescue tokens accidentally sent to this vault. Cannot rescue the vault asset —
    ///         preventing the owner from ever touching user principal or yield.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == asset()) revert CannotRescueUnderlyingAsset();
        if (to == address(0)) revert ZeroAmount();
        IERC20(token).safeTransfer(to, amount);
        emit NonAssetRescued(token, to, amount);
    }

    // -------------------------------------------------------------------------
    // Read helpers
    // -------------------------------------------------------------------------

    /// @notice Convenience view: current price per 1 share, expressed in underlying decimals.
    function pricePerShare() external view returns (uint256) {
        uint256 ts = totalSupply();
        if (ts == 0) return 10 ** decimals();
        return convertToAssets(10 ** decimals());
    }
}
