// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Anchors a hash of off-chain data with a timestamp. Proves existence at a time, NOT ownership or legality.
contract DataProofRegistry {
    struct Proof {
        address submitter;
        uint64 timestamp;
        string uri;
    }

    mapping(bytes32 => Proof) public proofs;

    event ProofSubmitted(bytes32 indexed hash, address indexed submitter, string uri);

    function submit(bytes32 hash, string calldata uri) external {
        require(hash != bytes32(0), "empty hash");
        require(proofs[hash].timestamp == 0, "exists");
        proofs[hash] = Proof(msg.sender, uint64(block.timestamp), uri);
        emit ProofSubmitted(hash, msg.sender, uri);
    }
}
