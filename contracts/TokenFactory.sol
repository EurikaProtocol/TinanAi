// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EurekaToken} from "./EurekaToken.sol";
import {ProjectRegistry} from "./ProjectRegistry.sol";

/// @notice Deploys EurekaToken (ERC-20) for the caller and registers it. Caller signs every deployment.
contract TokenFactory {
    ProjectRegistry public immutable registry;

    event TokenCreated(address indexed creator, address indexed token, string name, string symbol);

    constructor(ProjectRegistry registry_) {
        registry = registry_;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 supply,
        string calldata category,
        string calldata metadataURI
    ) external returns (address token) {
        require(supply > 0 && supply <= 1e30, "bad supply");
        require(decimals <= 18, "bad decimals");
        token = address(new EurekaToken(name, symbol, decimals, supply, msg.sender));
        registry.register(token, name, category, metadataURI);
        emit TokenCreated(msg.sender, token, name, symbol);
    }
}
