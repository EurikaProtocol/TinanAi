// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TinanAi Token
/// @notice Exactly 100 million TINAN, with 18 decimals, minted once to initialHolder.
/// @dev No public mint, burn, tax, pause, proxy, or privileged transfer functions.
contract TinanAiToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10 ** 18;

    constructor(address initialHolder) ERC20("TinanAi", "TINAN") {
        // ERC20._mint rejects the zero address.
        _mint(initialHolder, INITIAL_SUPPLY);
    }
}
