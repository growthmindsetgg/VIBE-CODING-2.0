// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Linked fungible + NFT mirror: 1e18 ERC-20 wei == one whole share NFT.
interface IVibeFundShareTokenForNft {
    function balanceOf(address account) external view returns (uint256);
}

/// @title VibeFundShareNFT
/// @dev Mint/burn is driven by `sync` calls from the paired ERC-20 on every balance change.
contract VibeFundShareNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;

    IVibeFundShareTokenForNft public token;
    string private _baseTokenURI;
    uint256 private _nextId = 1;

    mapping(address => uint256[]) private _ownedIds;

    error TokenAlreadySet();
    error OnlyToken();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        _baseTokenURI = baseURI_;
    }

    function setToken(address token_) external onlyOwner {
        if (address(token) != address(0)) revert TokenAlreadySet();
        token = IVibeFundShareTokenForNft(token_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseURI(), tokenId.toString());
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @notice Called by the paired ERC-20 after transfers to align NFT count with floor(balance / 1e18).
    function sync(address account) external {
        if (msg.sender != address(token)) revert OnlyToken();
        uint256 whole = token.balanceOf(account) / 1e18;
        uint256 current = balanceOf(account);
        while (current > whole) {
            _burnLast(account);
            current--;
        }
        while (current < whole) {
            _mintNext(account);
            current++;
        }
    }

    function _mintNext(address to) internal {
        uint256 id = _nextId++;
        _ownedIds[to].push(id);
        _safeMint(to, id);
    }

    function _burnLast(address from) internal {
        uint256[] storage ids = _ownedIds[from];
        require(ids.length > 0, "VibeFundNFT: nothing to burn");
        uint256 id = ids[ids.length - 1];
        ids.pop();
        _burn(id);
    }
}

/// @title VibeFundShareToken
/// @notice ERC-20 leg of the hybrid; paired `VibeFundShareNFT` mirrors whole units as NFTs.
contract VibeFundShareToken is ERC20, Ownable {
    VibeFundShareNFT public immutable nft;

    constructor(string memory name_, string memory symbol_, address nft_) ERC20(name_, symbol_) Ownable(msg.sender) {
        nft = VibeFundShareNFT(nft_);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0)) {
            nft.sync(from);
        }
        if (to != address(0)) {
            nft.sync(to);
        }
    }

    /// @notice Manager mints fractional shares (wei); NFT side updates via `_update`.
    function mint(address to, uint256 amountWei) external onlyOwner {
        _mint(to, amountWei);
    }
}
