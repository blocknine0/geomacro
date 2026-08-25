// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AgentArenaV2} from "../contracts/AgentArenaV2.sol";

/// @notice Deploys a fresh AgentArenaV2 implementation only.
/// Does NOT modify the permanent proxy and does NOT execute an upgrade.
contract DeployAgentArenaV2Implementation is Script {
    address internal constant STALE_IMPLEMENTATION =
        0x3FbB284915DBE96785D10803e644650cDf76086D;

    function run() external returns (AgentArenaV2 implementation) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("DEPLOYER", deployer);

        vm.startBroadcast(deployerKey);
        implementation = new AgentArenaV2();
        vm.stopBroadcast();

        address deployed = address(implementation);

        require(
            deployed != STALE_IMPLEMENTATION,
            "deployment resolved to stale implementation address"
        );

        require(
            deployed.code.length > 0,
            "new implementation has no runtime bytecode"
        );

        console.log(
            "NEW_AGENT_ARENA_V2_IMPLEMENTATION",
            deployed
        );

        console.log(
            "RUNTIME_CODE_SIZE",
            deployed.code.length
        );
    }
}
