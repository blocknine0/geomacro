// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AgentArenaV2} from "../contracts/AgentArenaV2.sol";

/// @notice Deploys ONLY a new AgentArenaV2 implementation.
/// @dev Does NOT deploy a proxy, treasury, or initialize any state.
///      The permanent proxy remains:
///      0x2F874FB07084a22D2bB314D0762Af57Cb1856868
contract DeployAgentArenaV2Implementation is Script {
    function run() external returns (AgentArenaV2 implementation) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        implementation = new AgentArenaV2();

        vm.stopBroadcast();

        console2.log("Updated AgentArenaV2 implementation deployed at:");
        console2.log(address(implementation));
        console2.log("Permanent V2 proxy remains:");
        console2.log("0x2F874FB07084a22D2bB314D0762Af57Cb1856868");
    }
}
