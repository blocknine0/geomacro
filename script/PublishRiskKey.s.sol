// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RiskKeyRegistry} from "../contracts/RiskKeyRegistry.sol";

/**
 * Publish the public signing-key hash after RiskKeyRegistry deployment.
 *
 * Required environment variables:
 *   PRIVATE_KEY
 *   RISK_KEY_REGISTRY_ADDRESS
 *   RISK_OBJECT_SIGNING_KEY_ID
 *   RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64
 *
 * Optional:
 *   RISK_OBJECT_JWKS_URI (defaults to the canonical Geomacro JWKS path)
 *   RISK_OBJECT_SIGNING_KEY_VALID_FROM_EPOCH (defaults to block.timestamp)
 *   RISK_OBJECT_SIGNING_KEY_VALID_UNTIL_EPOCH (defaults to 0 = no registry expiry)
 *
 * Never commit or print PRIVATE_KEY. The contract receives only a hash of the
 * public SPKI value, the key identifier, lifecycle timestamps and JWKS URI.
 */
contract PublishRiskKey is Script {
    string private constant DEFAULT_JWKS_URI =
        "https://geomacro.live/.well-known/jwks.json";

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("RISK_KEY_REGISTRY_ADDRESS");
        string memory keyId = vm.envString("RISK_OBJECT_SIGNING_KEY_ID");
        string memory publicKeySpki = vm.envString("RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64");
        string memory jwksUri = vm.envOr("RISK_OBJECT_JWKS_URI", DEFAULT_JWKS_URI);
        uint256 validFromRaw = vm.envOr(
            "RISK_OBJECT_SIGNING_KEY_VALID_FROM_EPOCH",
            block.timestamp
        );
        uint256 validUntilRaw = vm.envOr(
            "RISK_OBJECT_SIGNING_KEY_VALID_UNTIL_EPOCH",
            uint256(0)
        );

        require(validFromRaw <= type(uint64).max, "validFrom exceeds uint64");
        require(validUntilRaw <= type(uint64).max, "validUntil exceeds uint64");

        bytes32 publicKeyHash = keccak256(bytes(publicKeySpki));
        RiskKeyRegistry registry = RiskKeyRegistry(registryAddress);

        vm.startBroadcast(privateKey);
        registry.publishKey(
            keyId,
            publicKeyHash,
            jwksUri,
            uint64(validFromRaw),
            uint64(validUntilRaw)
        );
        registry.setActiveKey(keyId);
        vm.stopBroadcast();

        console.log("RiskKeyRegistry:", registryAddress);
        console.log("Key ID:", keyId);
        console.logBytes32(publicKeyHash);
        console.log("JWKS:", jwksUri);
    }
}
