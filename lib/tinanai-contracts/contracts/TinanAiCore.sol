// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title TinanAi Core
/// @notice Owner-managed, append-only proof registry linked to the TINAN token.
/// @dev Linking a token does not transfer tokens, charge a fee, or grant holder rights.
contract TinanAiCore is Ownable {
    struct Proof {
        bytes32 contentHash;
        string uri;
        string label;
        address submitter;
        uint256 timestamp;
    }

    IERC20 public immutable token;
    uint256 public proofCount;
    mapping(uint256 => Proof) private proofs;
    mapping(bytes32 => uint256) public proofIdByHash;

    error InvalidToken();
    error EmptyHash();
    error DuplicateProof(uint256 existingProofId);
    error InvalidProofId(uint256 proofId);
    error MetadataTooLong();

    event ProofRegistered(
        uint256 indexed proofId,
        bytes32 indexed contentHash,
        address indexed submitter,
        string uri,
        string label,
        uint256 timestamp
    );

    constructor(address tokenAddress, address initialOwner) Ownable(initialOwner) {
        if (tokenAddress == address(0) || tokenAddress.code.length == 0) revert InvalidToken();
        token = IERC20(tokenAddress);
    }

    /// @notice Register a nonzero SHA-256 digest and optional PUBLIC metadata.
    /// @dev Only the current owner may register. IDs start at 1; duplicate hashes revert.
    /// Never put private documents, credentials, or personal data in uri or label.
    function registerProof(
        bytes32 contentHash,
        string calldata uri,
        string calldata label
    ) external onlyOwner returns (uint256 proofId) {
        if (contentHash == bytes32(0)) revert EmptyHash();
        uint256 existing = proofIdByHash[contentHash];
        if (existing != 0) revert DuplicateProof(existing);
        if (bytes(uri).length > 512 || bytes(label).length > 128) revert MetadataTooLong();

        proofId = ++proofCount;
        proofs[proofId] = Proof(contentHash, uri, label, msg.sender, block.timestamp);
        proofIdByHash[contentHash] = proofId;
        emit ProofRegistered(proofId, contentHash, msg.sender, uri, label, block.timestamp);
    }

    /// @notice Read an existing proof. Anyone may read; records cannot be edited or deleted.
    function getProof(uint256 proofId) external view returns (Proof memory) {
        if (proofId == 0 || proofId > proofCount) revert InvalidProofId(proofId);
        return proofs[proofId];
    }
}
