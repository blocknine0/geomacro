// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import {AgentArenaV2} from "../contracts/AgentArenaV2.sol";
import {AgentArenaV2Legacy} from "./fixtures/AgentArenaV2Legacy.sol";
import {AgentArenaProxy} from "../contracts/AgentArenaProxy.sol";
import {MultisigTreasury} from "../contracts/MultisigTreasury.sol";

contract AgentArenaV2UpgradeTest is Test {
    address owner = makeAddr("owner");
    address guardian = makeAddr("guardian");

    address signer1 = makeAddr("signer1");
    address signer2 = makeAddr("signer2");
    address signer3 = makeAddr("signer3");

    address juror1 = makeAddr("juror1");
    address juror2 = makeAddr("juror2");
    address juror3 = makeAddr("juror3");
    address juror4 = makeAddr("juror4");
    address juror5 = makeAddr("juror5");

    MultisigTreasury treasury;
    AgentArenaProxy proxy;
    AgentArenaV2Legacy legacy;
    AgentArenaV2 upgraded;

    function setUp() public {
        treasury = new MultisigTreasury(signer1, signer2, signer3);

        AgentArenaV2Legacy oldImplementation = new AgentArenaV2Legacy();

        address[5] memory jury = [
            juror1,
            juror2,
            juror3,
            juror4,
            juror5
        ];

        bytes memory initData = abi.encodeCall(
            AgentArenaV2Legacy.initialize,
            (owner, address(treasury), jury, guardian)
        );

        proxy = new AgentArenaProxy(
            address(oldImplementation),
            initData
        );

        legacy = AgentArenaV2Legacy(payable(address(proxy)));

        // Create real legacy state before the upgrade.
        vm.prank(owner);
        legacy.createMarket("legacy-market", 7 days, 14 days);

        vm.deal(address(0xBEEF), 10 ether);

        vm.prank(address(0xBEEF));
        legacy.stake{value: 2 ether}(
            "legacy-market",
            AgentArenaV2Legacy.Side.HAWK
        );
    }

    function testRealisticV2UpgradePreservesStateAndInitializesFixedOdds()
        public
    {
        // Capture important pre-upgrade state.
        address treasuryBefore = legacy.treasury();
        uint256 feeBefore = legacy.winnerFeeBps();
        address guardianBefore = legacy.guardian();

        assertEq(feeBefore, 200);

        AgentArenaV2 newImplementation = new AgentArenaV2();

        // Treasury signer #1 proposes exact implementation.
        vm.prank(signer1);
        legacy.proposeUpgrade(address(newImplementation));

        assertEq(
            legacy.pendingImplementation(),
            address(newImplementation)
        );
        assertEq(legacy.upgradeApprovalCount(), 1);

        // Cannot execute with only one treasury approval.
        vm.warp(block.timestamp + 48 hours);

        vm.prank(owner);
        vm.expectRevert(
            bytes("needs 2-of-3 treasury signer approval")
        );
        legacy.upgradeToAndCall(
            address(newImplementation),
            abi.encodeCall(
                AgentArenaV2.initializeFixedOddsV2,
                ()
            )
        );

        // Treasury signer #2 approves.
        vm.prank(signer2);
        legacy.approveUpgrade(address(newImplementation));

        assertEq(legacy.upgradeApprovalCount(), 2);

        // A non-owner still cannot execute the UUPS upgrade.
        vm.prank(signer1);
        vm.expectRevert();
        legacy.upgradeToAndCall(
            address(newImplementation),
            abi.encodeCall(
                AgentArenaV2.initializeFixedOddsV2,
                ()
            )
        );

        // Owner performs atomic implementation upgrade + V2 reinitializer.
        vm.prank(owner);
        legacy.upgradeToAndCall(
            address(newImplementation),
            abi.encodeCall(
                AgentArenaV2.initializeFixedOddsV2,
                ()
            )
        );

        upgraded = AgentArenaV2(payable(address(proxy)));

        // Existing proxy state must survive.
        assertEq(upgraded.owner(), owner);
        assertEq(upgraded.treasury(), treasuryBefore);
        assertEq(upgraded.guardian(), guardianBefore);

        // Legacy fee must NOT be overwritten.
        assertEq(upgraded.winnerFeeBps(), feeBefore);
        assertEq(upgraded.winnerFeeBps(), 200);

        // New V2 fixed-odds economics.
        assertTrue(upgraded.fixedOddsEnabled());
        assertEq(upgraded.fixedOddsWinnerFeeBps(), 150);
        assertEq(upgraded.lossTreasuryBps(), 500);

        // Upgrade proposal must be consumed.
        assertEq(upgraded.pendingImplementation(), address(0));
        assertEq(upgraded.upgradeUnlockTime(), 0);
        assertEq(upgraded.upgradeApprovalCount(), 0);

        // Pre-upgrade market must remain legacy/parimutuel.
        assertFalse(upgraded.fixedOddsMarket("legacy-market"));

        // Pre-upgrade stake must still exist at the same storage location.
        assertEq(
            upgraded.stakes(
                "legacy-market",
                address(0xBEEF),
                AgentArenaV2.Side.HAWK
            ),
            2 ether
        );

        // V2 reinitializer is one-time only.
        vm.prank(owner);
        vm.expectRevert();
        upgraded.initializeFixedOddsV2();
    }
}
