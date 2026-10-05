// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721URIStorage, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract EurekaNFT is ERC721URIStorage, Ownable {
    uint256 private _next;

    constructor(string memory name_, string memory symbol_, address owner_) ERC721(name_, symbol_) Ownable(owner_) {}

    function mint(address to, string calldata uri) external onlyOwner returns (uint256 id) {
        id = _next++;
        _safeMint(to, id);
        _setTokenURI(id, uri);
    }
}

/// @notice Deploys an ERC-721 collection owned by the caller.
contract NFTFactory {
    event CollectionCreated(address indexed creator, address indexed collection, string name, string symbol);

    function createCollection(string calldata name, string calldata symbol) external returns (address c) {
        c = address(new EurekaNFT(name, symbol, msg.sender));
        emit CollectionCreated(msg.sender, c, name, symbol);
    }
}
