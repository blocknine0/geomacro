// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RiskKeyRegistry} from "../contracts/RiskKeyRegistry.sol";

/**
 * Deploy with a secret injected through the shell/CI environment, never source:
 *
 *   forge script script/DeployRiskKeyRegistry.s.sol:DeployRiskKeyRegistry \
 *     --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
 *
 * The resulting address should be configured as
 * RISK_OBJECT_KEY_REGISTRY_BASE_SEPOLIA in the Geomacro runtime.
 */
contract DeployRiskKeyRegistry is Script {
    function run() external returns (RiskKeyRegistry registry) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);
        registry = new RiskKeyRegistry(deployer);
        vm.stopBroadcast();

        console.log("RiskKeyRegistry:", address(registry));
        console.log("Owner:", deployer);
    }
}
