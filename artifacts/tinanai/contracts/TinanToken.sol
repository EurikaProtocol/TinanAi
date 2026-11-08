// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TINANAI Launchpad Token
/// @notice A fixed-decimal ERC-20 whose optional mint and burn capabilities are
///         selected at deployment. The connected wallet becomes the owner and
///         receives the entire initial supply.
contract TinanToken is ERC20, Ownable {
    bool public immutable mintingEnabled;
    bool public immutable burningEnabled;

    error MintingDisabled();
    error BurningDisabled();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address owner_,
        bool mintingEnabled_,
        bool burningEnabled_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        mintingEnabled = mintingEnabled_;
        burningEnabled = burningEnabled_;
        _mint(owner_, initialSupply_);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (!mintingEnabled) revert MintingDisabled();
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        if (!burningEnabled) revert BurningDisabled();
        _burn(msg.sender, amount);
    }
}
