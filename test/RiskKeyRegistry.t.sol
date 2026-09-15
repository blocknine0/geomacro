// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {RiskKeyRegistry} from "../contracts/RiskKeyRegistry.sol";

contract RiskKeyRegistryTest is Test {
    RiskKeyRegistry private registry;

    address private owner = address(0xA11CE);
    address private outsider = address(0xB0B);
    address private nextOwner = address(0xCAFE);

    string private constant KEY_ID = "geomacro-risk-2026-01";
    string private constant JWKS_URI = "https://geomacro.live/.well-known/jwks.json";
    bytes32 private constant PUBLIC_KEY_HASH = keccak256(bytes("MCowBQYDK2VwAyEAexample"));

    function setUp() public {
        registry = new RiskKeyRegistry(owner);
    }

    function testOwnerPublishesAndActivatesKey() public {
        vm.startPrank(owner);
        registry.publishKey(KEY_ID, PUBLIC_KEY_HASH, JWKS_URI, 100, 200);
        registry.setActiveKey(KEY_ID);
        vm.stopPrank();

        RiskKeyRegistry.KeyRecord memory record = registry.getKey(KEY_ID);
        assertEq(record.publicKeyHash, PUBLIC_KEY_HASH);
        assertEq(record.jwksUri, JWKS_URI);
        assertEq(record.validFrom, 100);
        assertEq(record.validUntil, 200);
        assertFalse(record.revoked);
        assertTrue(record.exists);
        assertEq(registry.activeKeyIdHash(), registry.keyIdHash(KEY_ID));
        assertTrue(registry.isKeyUsable(KEY_ID, 100));
        assertTrue(registry.isKeyUsable(KEY_ID, 150));
        assertTrue(registry.isKeyUsable(KEY_ID, 200));
        assertFalse(registry.isKeyUsable(KEY_ID, 99));
        assertFalse(registry.isKeyUsable(KEY_ID, 201));
    }

    function testKeyBindingCannotBeOverwritten() public {
        vm.startPrank(owner);
        registry.publishKey(KEY_ID, PUBLIC_KEY_HASH, JWKS_URI, 100, 0);
        vm.expectRevert(RiskKeyRegistry.KeyAlreadyExists.selector);
        registry.publishKey(KEY_ID, keccak256("different"), JWKS_URI, 100, 0);
        vm.stopPrank();
    }

    function testRevocationIsFailClosedAndClearsActiveKey() public {
        vm.startPrank(owner);
        registry.publishKey(KEY_ID, PUBLIC_KEY_HASH, JWKS_URI, 100, 0);
        registry.setActiveKey(KEY_ID);
        registry.revokeKey(KEY_ID);
        vm.stopPrank();

        RiskKeyRegistry.KeyRecord memory record = registry.getKey(KEY_ID);
        assertTrue(record.revoked);
        assertEq(registry.activeKeyIdHash(), bytes32(0));
        assertFalse(registry.isKeyUsable(KEY_ID, 150));

        vm.prank(owner);
        vm.expectRevert(RiskKeyRegistry.KeyRevoked.selector);
        registry.setActiveKey(KEY_ID);
    }

    function testOnlyOwnerCanMutateRegistry() public {
        vm.startPrank(outsider);
        vm.expectRevert(RiskKeyRegistry.NotOwner.selector);
        registry.publishKey(KEY_ID, PUBLIC_KEY_HASH, JWKS_URI, 100, 0);
        vm.expectRevert(RiskKeyRegistry.NotOwner.selector);
        registry.transferOwnership(nextOwner);
        vm.stopPrank();
    }

    function testTwoStepOwnershipTransfer() public {
        vm.prank(owner);
        registry.transferOwnership(nextOwner);

        vm.prank(outsider);
        vm.expectRevert(RiskKeyRegistry.NotPendingOwner.selector);
        registry.acceptOwnership();

        vm.prank(nextOwner);
        registry.acceptOwnership();
        assertEq(registry.owner(), nextOwner);
        assertEq(registry.pendingOwner(), address(0));
    }
}
