// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AgentArenaV2} from "../contracts/AgentArenaV2.sol";

contract DeployAgentArenaV2Implementation is Script {
    function run() external returns (AgentArenaV2 implementation) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        implementation = new AgentArenaV2();
        vm.stopBroadcast();

        console2.log("NEW_AGENT_ARENA_V2_IMPLEMENTATION", address(implementation));
        console2.log(
            "PERMANENT_PROXY",
            0x2F874FB07084a22D2bB314D0762Af57Cb1856868
        );
    }
}
