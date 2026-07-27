// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script, console } from "forge-std/Script.sol";
import { MultisigTreasury } from "../contracts/MultisigTreasury.sol";
import { AgentArenaV2 } from "../contracts/AgentArenaV2.sol";
import { AgentArenaProxy } from "../contracts/AgentArenaProxy.sol";

/**
 * Deploy.s.sol
 * -----------------------------------------
 * Deploys, in one broadcast: MultisigTreasury -> AgentArenaV2 (implementation)
 * -> AgentArenaProxy (initialized, pointing at the implementation).
 *
 * The PROXY address is the one and only address that goes into
 * CONTRACT_ADDRESS everywhere going forward (.env, GitHub secrets, README).
 * The implementation address is only needed again for a future
 * proposeUpgrade() call — never used directly by scripts or the frontend.
 *
 * Required env vars before running:
 *   DEPLOYER_PRIVATE_KEY   - pays gas, becomes the contract owner unless
 *                             CONTRACT_OWNER is also set
 *   CONTRACT_OWNER          - optional, defaults to the deployer address
 *   MULTISIG_SIGNER_1/2/3   - the 3 treasury multisig signer addresses
 *   JURY_WALLET_1..5        - the 5 dispute-jury wallet addresses
 *
 * Run (Arc Testnet):
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url https://rpc.testnet.arc.network \
 *     --broadcast -vvvv
 */
contract Deploy is Script {
    function run() external {
        address signer1 = vm.envAddress("MULTISIG_SIGNER_1");
        address signer2 = vm.envAddress("MULTISIG_SIGNER_2");
        address signer3 = vm.envAddress("MULTISIG_SIGNER_3");

        address[5] memory juryMembers = [
            vm.envAddress("JURY_WALLET_1"),
            vm.envAddress("JURY_WALLET_2"),
            vm.envAddress("JURY_WALLET_3"),
            vm.envAddress("JURY_WALLET_4"),
            vm.envAddress("JURY_WALLET_5")
        ];

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address owner = vm.envOr("CONTRACT_OWNER", deployer);

        console.log("Deployer:", deployer);
        console.log("Contract owner will be:", owner);

        vm.startBroadcast(deployerKey);

        // 1. Treasury — deploy first, its address is needed to initialize V2.
        MultisigTreasury treasury = new MultisigTreasury(signer1, signer2, signer3);
        console.log("MultisigTreasury deployed at:", address(treasury));

        // 2. Implementation — no constructor args (constructor just calls
        // _disableInitializers per the upgradeable pattern), all real setup
        // happens through initialize() below, called via the proxy.
        AgentArenaV2 implementation = new AgentArenaV2();
        console.log("AgentArenaV2 implementation deployed at:", address(implementation));

        // 3. Proxy — this IS the permanent contract address.
        bytes memory initData = abi.encodeCall(
            AgentArenaV2.initialize,
            (owner, address(treasury), juryMembers)
        );
        AgentArenaProxy proxy = new AgentArenaProxy(address(implementation), initData);
        console.log("AgentArenaProxy (permanent address) deployed at:", address(proxy));

        vm.stopBroadcast();

        console.log("\n=== Deployment summary ===");
        console.log("MultisigTreasury:      ", address(treasury));
        console.log("AgentArenaV2 impl:     ", address(implementation));
        console.log("AgentArenaProxy (USE THIS as CONTRACT_ADDRESS):", address(proxy));
        console.log("\nNext steps:");
        console.log("1. Set CONTRACT_ADDRESS secret/env to the proxy address above, everywhere.");
        console.log("2. Fund the 5 jury wallets with Arc Testnet gas.");
        console.log("3. Run the Supabase migration (001_ai_jury_dispute_system.sql) if not already applied.");
        console.log("4. Leave the OLD contract's CONTRACT_ADDRESS reachable read-only (OLD_CONTRACT_ADDRESS env) until its remaining markets finish their lifecycle.");
    }
}
