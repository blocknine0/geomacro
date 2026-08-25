// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {AgentArenaV2} from "../contracts/AgentArenaV2.sol";
import {AgentArenaProxy} from "../contracts/AgentArenaProxy.sol";
import {MultisigTreasury} from "../contracts/MultisigTreasury.sol";

contract AgentArenaV2FixedOddsTest is Test {
    AgentArenaV2 arena;
    MultisigTreasury treasury;

    address signer1 = makeAddr("signer1");
    address signer2 = makeAddr("signer2");
    address signer3 = makeAddr("signer3");
    address guardian = makeAddr("guardian");
    address lp = makeAddr("lp");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    address[5] jury;

    function setUp() public {
        jury = [makeAddr("jury1"), makeAddr("jury2"), makeAddr("jury3"), makeAddr("jury4"), makeAddr("jury5")];
        treasury = new MultisigTreasury(signer1, signer2, signer3);
        AgentArenaV2 implementation = new AgentArenaV2();
        AgentArenaProxy proxy = new AgentArenaProxy(
            address(implementation),
            abi.encodeCall(AgentArenaV2.initialize, (address(this), address(treasury), jury, guardian))
        );
        arena = AgentArenaV2(address(proxy));

        vm.deal(lp, 1_000 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
    }

    function testFixedOddsInitializerKeepsLegacyFeeSeparate() public {
        assertEq(arena.winnerFeeBps(), 200);
        arena.initializeFixedOddsV2();
        assertEq(arena.winnerFeeBps(), 200, "legacy V2 fee must remain unchanged");
        assertEq(arena.fixedOddsWinnerFeeBps(), 150);
        assertEq(arena.lossTreasuryBps(), 500);
        assertTrue(arena.fixedOddsEnabled());
    }

    function testFixedOddsOneToOnePayoutUsesProfitOnlyFee() public {
        arena.initializeFixedOddsV2();
        vm.prank(lp);
        arena.provideLiquidity{value: 100 ether}();

        arena.createMarket("fixed-1", 1 hours, 2 hours);
        vm.prank(alice);
        arena.stake{value: 100 ether}("fixed-1", AgentArenaV2.Side.HAWK);
        vm.prank(bob);
        arena.stake{value: 50 ether}("fixed-1", AgentArenaV2.Side.DOVE);

        assertEq(arena.marketReserveRequirement("fixed-1"), 52.5 ether);

        vm.warp(block.timestamp + 2 hours + 1);
        arena.declareWinnerByAI("fixed-1", AgentArenaV2.Side.HAWK);
        vm.warp(block.timestamp + arena.DISPUTE_WINDOW() + 1);
        arena.finalizeMarket("fixed-1");

        assertEq(arena.liquidityReserve(), 47.5 ether);
        assertEq(arena.marketReserveUsed("fixed-1"), 52.5 ether);
        assertEq(arena.marketLossTreasuryAmount("fixed-1"), 2.5 ether);

        uint256 beforeAlice = alice.balance;
        uint256 beforeTreasury = address(treasury).balance;
        vm.prank(alice);
        arena.claim("fixed-1");

        assertEq(alice.balance - beforeAlice, 198.5 ether, "1:1 payout minus 1.5% profit fee");
        assertEq(address(treasury).balance - beforeTreasury, 1.5 ether, "claim fee should be profit-only");
    }

    function testStakeRevertsWhenReserveIsNotFunded() public {
        arena.initializeFixedOddsV2();
        arena.createMarket("fixed-no-reserve", 1 hours, 2 hours);
        vm.prank(alice);
        vm.expectRevert("insufficient funded liquidity reserve");
        arena.stake{value: 1 ether}("fixed-no-reserve", AgentArenaV2.Side.HAWK);
    }

    function testLegacyMarketCreatedBeforeInitializerRemainsParimutuel() public {
        arena.createMarket("legacy", 1 hours, 2 hours);
        arena.initializeFixedOddsV2();
        assertFalse(arena.fixedOddsMarket("legacy"));

        vm.prank(alice);
        arena.stake{value: 100 ether}("legacy", AgentArenaV2.Side.HAWK);
        vm.prank(bob);
        arena.stake{value: 50 ether}("legacy", AgentArenaV2.Side.DOVE);

        vm.warp(block.timestamp + 2 hours + 1);
        arena.declareWinnerByAI("legacy", AgentArenaV2.Side.HAWK);
        vm.warp(block.timestamp + arena.DISPUTE_WINDOW() + 1);
        arena.finalizeMarket("legacy");

        uint256 beforeAlice = alice.balance;
        vm.prank(alice);
        arena.claim("legacy");
        assertEq(alice.balance - beforeAlice, 147 ether, "legacy 150 payout less original 2% fee");
    }
}
