// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RiskKeyRegistry
 * @notice Independent onchain trust anchor for Geomacro Risk Object signing keys.
 *
 * The registry never stores or handles a private key.  It stores only an
 * immutable key identifier -> public-key hash binding plus lifecycle metadata
 * and the well-known JWKS URI used to retrieve the public Ed25519 key.
 *
 * publicKeyHash = keccak256(bytes(public_key_spki_b64))
 */
contract RiskKeyRegistry {
    struct KeyRecord {
        bytes32 publicKeyHash;
        string jwksUri;
        uint64 validFrom;
        uint64 validUntil;
        bool revoked;
        bool exists;
    }

    error NotOwner();
    error NotPendingOwner();
    error InvalidOwner();
    error InvalidKeyId();
    error InvalidPublicKeyHash();
    error InvalidJwksUri();
    error InvalidValidityWindow();
    error KeyAlreadyExists();
    error KeyNotFound();
    error KeyRevoked();

    address public owner;
    address public pendingOwner;
    bytes32 public activeKeyIdHash;

    mapping(bytes32 keyIdHash => KeyRecord record) private _keys;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event KeyPublished(
        string keyId,
        bytes32 indexed keyIdHash,
        bytes32 indexed publicKeyHash,
        string jwksUri,
        uint64 validFrom,
        uint64 validUntil
    );
    event KeyRevokedEvent(string keyId, bytes32 indexed keyIdHash);
    event ActiveKeyChanged(string keyId, bytes32 indexed keyIdHash);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidOwner();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function keyIdHash(string memory keyId) public pure returns (bytes32) {
        if (bytes(keyId).length == 0 || bytes(keyId).length > 128) revert InvalidKeyId();
        return keccak256(bytes(keyId));
    }

    function publishKey(
        string calldata keyId,
        bytes32 publicKeyHash,
        string calldata jwksUri,
        uint64 validFrom,
        uint64 validUntil
    ) external onlyOwner {
        bytes32 idHash = keyIdHash(keyId);
        if (publicKeyHash == bytes32(0)) revert InvalidPublicKeyHash();
        if (bytes(jwksUri).length == 0) revert InvalidJwksUri();
        if (validUntil != 0 && validUntil < validFrom) revert InvalidValidityWindow();
        if (_keys[idHash].exists) revert KeyAlreadyExists();

        _keys[idHash] = KeyRecord({
            publicKeyHash: publicKeyHash,
            jwksUri: jwksUri,
            validFrom: validFrom,
            validUntil: validUntil,
            revoked: false,
            exists: true
        });

        emit KeyPublished(keyId, idHash, publicKeyHash, jwksUri, validFrom, validUntil);
    }

    function revokeKey(string calldata keyId) external onlyOwner {
        bytes32 idHash = keyIdHash(keyId);
        KeyRecord storage record = _keys[idHash];
        if (!record.exists) revert KeyNotFound();
        if (!record.revoked) {
            record.revoked = true;
            emit KeyRevokedEvent(keyId, idHash);
        }
        if (activeKeyIdHash == idHash) {
            activeKeyIdHash = bytes32(0);
        }
    }

    function setActiveKey(string calldata keyId) external onlyOwner {
        bytes32 idHash = keyIdHash(keyId);
        KeyRecord storage record = _keys[idHash];
        if (!record.exists) revert KeyNotFound();
        if (record.revoked) revert KeyRevoked();

        activeKeyIdHash = idHash;
        emit ActiveKeyChanged(keyId, idHash);
    }

    function getKey(string calldata keyId) external view returns (KeyRecord memory) {
        bytes32 idHash = keyIdHash(keyId);
        KeyRecord memory record = _keys[idHash];
        if (!record.exists) revert KeyNotFound();
        return record;
    }

    function getKeyByHash(bytes32 idHash) external view returns (KeyRecord memory) {
        KeyRecord memory record = _keys[idHash];
        if (!record.exists) revert KeyNotFound();
        return record;
    }

    function isKeyUsable(string calldata keyId, uint64 observedAt) external view returns (bool) {
        KeyRecord memory record = _keys[keyIdHash(keyId)];
        if (!record.exists || record.revoked) return false;
        if (observedAt < record.validFrom) return false;
        if (record.validUntil != 0 && observedAt > record.validUntil) return false;
        return true;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }
}
