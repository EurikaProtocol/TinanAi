// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Fixed-supply ERC-20 used by TokenFactory. Entire supply is minted to the owner once.
contract EurekaToken is ERC20, ERC20Burnable, Ownable {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 supply_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _decimals = decimals_;
        _mint(owner_, supply_ * (10 ** uint256(decimals_)));
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
