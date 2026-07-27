// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * AgentArenaProxy
 * -----------------------------------------
 * Deploy this once. Its address is the permanent, forever contract address —
 * every future upgrade (dispute-v2, new fee logic, whatever comes next)
 * changes only the implementation this proxy points to, never this address.
 *
 * This is a thin named wrapper around OpenZeppelin's audited ERC1967Proxy
 * so it shows up clearly (not just as an anonymous proxy) on Arcscan and
 * in deployment scripts. No custom logic lives here on purpose — proxy
 * contracts should do as little as possible.
 *
 * Deployment:
 *   new AgentArenaProxy(
 *     address(agentArenaV2Implementation),
 *     abi.encodeCall(AgentArenaV2.initialize, (owner, treasury, juryMembers))
 *   )
 */
contract AgentArenaProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory initData)
        ERC1967Proxy(implementation, initData)
    {}
}
