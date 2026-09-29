// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EcrecoverProbe
/// @notice Minimal EVM ecrecover compatibility probe for MST Testnet
/// @dev Used by MachineMandi to verify device measurement signatures on-chain
contract EcrecoverProbe {
    /// @notice Emitted upon signature recovery and verification
    /// @param expectedSigner The address claimed to have signed the digest
    /// @param recoveredSigner The address recovered by ecrecover
    event SignatureVerified(address indexed expectedSigner, address indexed recoveredSigner);

    /// @notice Recovers signer from ECDSA signature and compares against expected address
    /// @param expectedSigner The address expected to match the recovered signer
    /// @param digest 32-byte hash of the payload that was signed
    /// @param v Recovery identifier (must be 27 or 28)
    /// @param r First 32 bytes of the ECDSA signature
    /// @param s Second 32 bytes of the ECDSA signature
    /// @return isMatch True if recovered address is non-zero and equals expectedSigner
    /// @return recoveredSigner The address recovered by ecrecover
    function verifySignature(
        address expectedSigner,
        bytes32 digest,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bool isMatch, address recoveredSigner) {
        require(v == 27 || v == 28, "Invalid v parameter: must be 27 or 28");

        recoveredSigner = ecrecover(digest, v, r, s);
        isMatch = (recoveredSigner != address(0) && recoveredSigner == expectedSigner);

        emit SignatureVerified(expectedSigner, recoveredSigner);
        return (isMatch, recoveredSigner);
    }
}
