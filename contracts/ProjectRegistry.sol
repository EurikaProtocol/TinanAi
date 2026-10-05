// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Public registry of tokenization projects. Entries are self-declared; NOT a legal or asset verification.
contract ProjectRegistry {
    struct Project {
        address owner;
        address token;
        string name;
        string category;
        string metadataURI;
        uint64 createdAt;
    }

    Project[] private _projects;
    mapping(address => uint256[]) private _byOwner;

    event ProjectRegistered(uint256 indexed id, address indexed owner, address indexed token, string name);

    function register(address token, string calldata name, string calldata category, string calldata metadataURI)
        external
        returns (uint256 id)
    {
        require(bytes(name).length > 0 && bytes(name).length <= 100, "bad name");
        id = _projects.length;
        _projects.push(Project(msg.sender, token, name, category, metadataURI, uint64(block.timestamp)));
        _byOwner[msg.sender].push(id);
        emit ProjectRegistered(id, msg.sender, token, name);
    }

    function count() external view returns (uint256) {
        return _projects.length;
    }

    function get(uint256 id) external view returns (Project memory) {
        require(id < _projects.length, "not found");
        return _projects[id];
    }

    function idsOf(address owner) external view returns (uint256[] memory) {
        return _byOwner[owner];
    }
}
