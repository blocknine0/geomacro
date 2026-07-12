// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/AgentArena.sol";

contract AgentArenaTest is Test {
    AgentArena arena;

    address owner = address(this); // test contract deploys, so it's the owner
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address mallory = makeAddr("mallory"); // non-owner attacker

    string constant MARKET_ID = "evt-2026-07-12-test";

    uint256 constant STAKING_DURATION = 46 hours;
    uint256 constant RESOLUTION_DURATION = 48 hours;

    function setUp() public {
        arena = new AgentArena(treasury);

        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(mallory, 1000 ether);
    }

    // ---------------------------------------------------------------
    // 1. Market creation
    // ---------------------------------------------------------------

    function testMarketCreation() public {
        arena.createMarket(MARKET_ID, STAKING_DURATION, RESOLUTION_DURATION);

        (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists) =
            arena.getMarket(MARKET_ID);

        assertTrue(exists, "market should exist after creation");
        assertEq(status, uint8(AgentArena.Status.OPEN), "new market should be OPEN");
        assertEq(hawkTotal, 0, "hawkTotal should start at zero");
        assertEq(doveTotal, 0, "doveTotal should start at zero");
    }

    function test_RevertWhen_DuplicateMarketCreated() public {
        arena.createMarket(MARKET_ID, STAKING_DURATION, RESOLUTION_DURATION);

        vm.expectRevert("Market already exists");
        arena.createMarket(MARKET_ID, STAKING_DURATION, RESOLUTION_DURATION);
    }

    // ---------------------------------------------------------------
    // 2. Adversarial staking attempts
    // ---------------------------------------------------------------

    function testAdversarialStaking() public {
        arena.createMarket(MARKET_ID, STAKING_DURATION, RESOLUTION_DURATION);

        // Non-owner cannot create markets.
        vm.prank(mallory);
        vm.expectRevert("Not owner");
        arena.createMarket("mallorys-fake-market", STAKING_DURATION, RESOLUTION_DURATION);

        // Zero-value stakes are rejected.
        vm.prank(alice);
        vm.expectRevert("Stake must be > 0");
        arena.stake{value: 0}(MARKET_ID, AgentArena.Side.HAWK);

        // Staking on a market that doesn't exist is rejected.
        vm.prank(alice);
        vm.expectRevert("Market does not exist");
        arena.stake{value: 1 ether}("no-such-market", AgentArena.Side.HAWK);

        // Staking Side.NONE is rejected.
        vm.prank(alice);
        vm.expectRevert("Invalid side");
        arena.stake{value: 1 ether}(MARKET_ID, AgentArena.Side.NONE);

        // A legitimate stake should still succeed after the attack attempts above.
        vm.prank(alice);
        arena.stake{value: 10 ether}(MARKET_ID, AgentArena.Side.HAWK);

        // Staking after the staking window has closed is rejected, even though
        // the market is still nominally OPEN until resolutionTime.
        vm.warp(block.timestamp + STAKING_DURATION + 1);
        vm.prank(bob);
        vm.expectRevert("Staking period has ended");
        arena.stake{value: 5 ether}(MARKET_ID, AgentArena.Side.DOVE);

        // Resolving before resolutionTime is rejected, even by the owner.
        vm.expectRevert("Too early to resolve");
        arena.declareWinnerByAI(MARKET_ID, AgentArena.Side.HAWK);
    }

    // ---------------------------------------------------------------
    // 3. Full settlement and payout math
    // ---------------------------------------------------------------

    function testSettlementAndPayout() public {
        arena.createMarket(MARKET_ID, STAKING_DURATION, RESOLUTION_DURATION);

        // Alice stakes 100 on HAWK, Bob stakes 50 on DOVE, HAWK wins.
        vm.prank(alice);
        arena.stake{value: 100 ether}(MARKET_ID, AgentArena.Side.HAWK);

        vm.prank(bob);
        arena.stake{value: 50 ether}(MARKET_ID, AgentArena.Side.DOVE);

        // Move past resolutionTime and have the owner (AI oracle) declare HAWK.
        vm.warp(block.timestamp + RESOLUTION_DURATION + 1);
        arena.declareWinnerByAI(MARKET_ID, AgentArena.Side.HAWK);

        (uint8 statusAfterAI,,, , , ,) = arena.getMarketFullDetails(MARKET_ID);
        assertEq(statusAfterAI, uint8(AgentArena.Status.AI_RESOLVED));

        // No one disputes. Move past the 24h dispute window and finalize.
        vm.warp(block.timestamp + 24 hours + 1);
        arena.finalizeMarket(MARKET_ID);

        (uint8 statusFinal, uint8 winner,,,,,) = arena.getMarketFullDetails(MARKET_ID);
        assertEq(statusFinal, uint8(AgentArena.Status.FINALIZED));
        assertEq(winner, uint8(AgentArena.Side.HAWK));

        // Alice claims. Expected math:
        // payout = 100 + (100 * 50 / 100) = 150 ether
        // platformFee = 150 * 150bps = 2.25 ether
        // net = 147.75 ether
        uint256 aliceBalanceBefore = alice.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(alice);
        arena.claim(MARKET_ID);

        uint256 aliceBalanceAfter = alice.balance;
        uint256 treasuryBalanceAfter = treasury.balance;

        assertEq(aliceBalanceAfter - aliceBalanceBefore, 147.75 ether, "alice net payout mismatch");
        assertEq(treasuryBalanceAfter - treasuryBalanceBefore, 2.25 ether, "protocol fee mismatch");

        // Bob staked on the losing side and has nothing to claim.
        vm.prank(bob);
        vm.expectRevert("Nothing to claim");
        arena.claim(MARKET_ID);

        // Alice cannot claim twice.
        vm.prank(alice);
        vm.expectRevert("Already claimed");
        arena.claim(MARKET_ID);
    }
}
