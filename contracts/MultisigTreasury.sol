// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MultisigTreasury
 * -----------------------------------------
 * A minimal 2-of-3 multisig wallet built to receive protocol fees from
 * AgentArenaV2 (winner fee, bridge fee) and release them only with
 * agreement from at least 2 of the 3 fixed signers.
 *
 * Note on currency: exactly like AgentArena.sol, this contract deals in
 * Arc's native gas token, which IS USDC (18 decimals wei-style units, e.g.
 * `50 * 10**6` elsewhere in this codebase means "50 USDC" because Arc's
 * native token uses USDC's own decimal convention). There is no ERC-20
 * transfer here — fees arrive via plain value transfer (`receive()`),
 * and withdrawals leave the same way.
 *
 * Design choices:
 * - Signers are fixed at deploy time. There is no signer-rotation
 *   function in this version — replacing a signer means deploying a new
 *   treasury and updating AgentArenaV2's treasury address (itself a
 *   2-of-3 multisig-gated action once V2 is live). Kept out on purpose:
 *   a self-modifying signer set is a bigger attack surface than this
 *   contract's one job (hold funds, release on 2-of-3 agreement) needs.
 * - No fee auto-forward failure can lock user payouts: AgentArenaV2 wraps
 *   its transfer to this contract in a try/catch, so if this contract
 *   ever reverts on receive (it shouldn't, receive() has no logic), the
 *   fee just accrues in AgentArenaV2 for later manual withdrawal instead
 *   of blocking the user's own payout.
 */
contract MultisigTreasury {
    uint256 public constant REQUIRED_APPROVALS = 2;
    uint256 public constant SIGNER_COUNT = 3;

    address[SIGNER_COUNT] public signers;
    mapping(address => bool) public isSigner;

    struct WithdrawalProposal {
        address to;
        uint256 amount;
        uint256 approvalCount;
        bool executed;
        mapping(address => bool) approvedBy;
    }

    // Kept private for the same stack-too-deep reason AgentArena.sol keeps
    // its `markets` mapping private — public getters are exposed below.
    mapping(uint256 => WithdrawalProposal) private proposals;
    uint256 public proposalCount;

    event Received(address indexed from, uint256 amount);
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address to, uint256 amount);
    event Approved(uint256 indexed proposalId, address indexed signer, uint256 approvalCount);
    event Executed(uint256 indexed proposalId, address indexed to, uint256 amount);

    modifier onlySigner() {
        require(isSigner[msg.sender], "not a signer");
        _;
    }

    constructor(address signer1, address signer2, address signer3) {
        require(
            signer1 != address(0) && signer2 != address(0) && signer3 != address(0),
            "zero address signer"
        );
        require(
            signer1 != signer2 && signer1 != signer3 && signer2 != signer3,
            "signers must be distinct"
        );

        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;

        isSigner[signer1] = true;
        isSigner[signer2] = true;
        isSigner[signer3] = true;
    }

    /// @notice Accepts protocol fees pushed from AgentArenaV2 (or anyone else).
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice Any signer can propose sending funds out of the treasury.
    function proposeWithdrawal(address to, uint256 amount) external onlySigner returns (uint256 proposalId) {
        require(to != address(0), "zero address recipient");
        require(amount > 0, "amount must be > 0");
        require(amount <= address(this).balance, "amount exceeds balance");

        proposalId = proposalCount++;
        WithdrawalProposal storage p = proposals[proposalId];
        p.to = to;
        p.amount = amount;

        emit ProposalCreated(proposalId, msg.sender, to, amount);

        // Proposing counts as the proposer's own approval, saving a call.
        _approve(proposalId, msg.sender);
    }

    /// @notice A second (or third) signer approves an existing proposal.
    function approveWithdrawal(uint256 proposalId) external onlySigner {
        require(proposalId < proposalCount, "proposal does not exist");
        require(!proposals[proposalId].executed, "already executed");
        _approve(proposalId, msg.sender);
    }

    function _approve(uint256 proposalId, address signer) private {
        WithdrawalProposal storage p = proposals[proposalId];
        require(!p.approvedBy[signer], "already approved by this signer");

        p.approvedBy[signer] = true;
        p.approvalCount += 1;

        emit Approved(proposalId, signer, p.approvalCount);
    }

    /// @notice Executes a proposal once it has reached 2-of-3 approvals.
    /// Callable by any signer (not just the proposer) once threshold is met.
    function executeWithdrawal(uint256 proposalId) external onlySigner {
        require(proposalId < proposalCount, "proposal does not exist");
        WithdrawalProposal storage p = proposals[proposalId];

        require(!p.executed, "already executed");
        require(p.approvalCount >= REQUIRED_APPROVALS, "not enough approvals");
        require(p.amount <= address(this).balance, "amount exceeds current balance");

        // Effects before interaction (reentrancy guard by ordering).
        p.executed = true;

        (bool success, ) = p.to.call{value: p.amount}("");
        require(success, "transfer failed");

        emit Executed(proposalId, p.to, p.amount);
    }

    /// @notice Read-only helper since `proposals` is private (stack-too-deep guard).
    function getProposal(uint256 proposalId)
        external
        view
        returns (address to, uint256 amount, uint256 approvalCount, bool executed)
    {
        require(proposalId < proposalCount, "proposal does not exist");
        WithdrawalProposal storage p = proposals[proposalId];
        return (p.to, p.amount, p.approvalCount, p.executed);
    }

    function hasApproved(uint256 proposalId, address signer) external view returns (bool) {
        require(proposalId < proposalCount, "proposal does not exist");
        return proposals[proposalId].approvedBy[signer];
    }

    function getSigners() external view returns (address[SIGNER_COUNT] memory) {
        return signers;
    }
}
