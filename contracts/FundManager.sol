// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title FundManager
/// @notice Holds USDC for a VibeFund: deposits, micro-payments, and rebalancing hooks (events for off-chain agents).
contract FundManager is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    event Deposit(address indexed user, uint256 amount);
    event MicroPay(address indexed to, uint256 amount, string memo);
    event Rebalance(bytes32 indexed fundId, string action);

    constructor(address usdc_, address initialOwner) Ownable(initialOwner) {
        usdc = IERC20(usdc_);
    }

    function deposit(uint256 amount) external {
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
