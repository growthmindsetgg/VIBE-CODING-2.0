// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IVibeFundShareMint {
    function mint(address to, uint256 amountWei) external;
}

/// @title FundManager
/// @notice Holds USDC, accepts deposits, and (when configured) mints share tokens at a fixed rate.
/// @dev Share token `owner` must be this contract after `setShareToken` so `subscribe` can mint.
contract FundManager is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IVibeFundShareMint public shareToken;
    bool public shareTokenConfigured;

    event Deposit(address indexed user, uint256 amount);
    event MicroPay(address indexed to, uint256 amount, string memo);
    event Rebalance(bytes32 indexed fundId, string action);
    event Subscribe(address indexed user, uint256 usdcIn, uint256 sharesOut);
    event ShareTokenSet(address indexed token);

    error ShareTokenAlreadySet();
    error ShareTokenNotSet();
    error ZeroAmount();

    constructor(address usdc_, address initialOwner) Ownable(initialOwner) {
        usdc = IERC20(usdc_);
    }

    /// @notice One-time link to the VibeFundShareToken. Call then `transferOwnership` on the token to this contract.
    function setShareToken(address token_) external onlyOwner {
        if (shareTokenConfigured) revert ShareTokenAlreadySet();
        shareTokenConfigured = true;
        shareToken = IVibeFundShareMint(token_);
        emit ShareTokenSet(token_);
    }

    /// @notice Pull USDC from the user and mint 1e18 share wei per 1 USDC (6 decimals).
    function subscribe(uint256 usdcAmount) external {
        if (usdcAmount == 0) revert ZeroAmount();
        if (!shareTokenConfigured) revert ShareTokenNotSet();
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        uint256 sharesOut = usdcAmount * 1e12;
        shareToken.mint(msg.sender, sharesOut);
        emit Subscribe(msg.sender, usdcAmount, sharesOut);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount, address to) external onlyOwner {
        usdc.safeTransfer(to, amount);
    }

    function microPay(address to, uint256 amount, string calldata memo) external onlyOwner {
        usdc.safeTransfer(to, amount);
        emit MicroPay(to, amount, memo);
    }

    function rebalance(bytes32 fundId, string calldata action) external onlyOwner {
        emit Rebalance(fundId, action);
    }
}
