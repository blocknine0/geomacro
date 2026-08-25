// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AgentArenaV2} from "../contracts/AgentArenaV2.sol";

/// @notice Deploys a new AgentArenaV2 implementation only. It does not touch
/// the proxy and does not execute an upgrade.
contract DeployAgentArenaV2Implementation is Script {
    function run() external returns (AgentArenaV2 implementation) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        vm.startBroadcast(deployerKey);
        implementation = new AgentArenaV2();
        vm.stopBroadcast();

        console.log("AgentArenaV2 implementation:", address(implementation));
    }
}
