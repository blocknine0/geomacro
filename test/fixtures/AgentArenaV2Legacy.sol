// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @dev Minimal interface onto the already-deployed MultisigTreasury — only
/// need its signer list, not its withdrawal machinery. Reusing these 3
/// signers (instead of a separate signer set here) means there's exactly
/// one place that defines "who has multisig authority" for this whole
/// system, not two lists that could drift apart.
interface IMultisigTreasury {
    function getSigners() external view returns (address[3] memory);
}

/**
 * AgentArenaV2
 * -----------------------------------------
 * Upgradeable (UUPS) successor to the original AgentArena.sol. Deployed
 * behind AgentArenaProxy.sol so that future feature additions never
 * require another contract-address migration.
 *
 * Carried over unchanged from V1: createMarket, declareWinnerByAI, stake,
 * the normal (non-disputed) finalizeMarket path, and claim's proportional
 * payout math.
 *
 * Replaced from V1: the old flat-fee, human stake-weighted DAO vote
 * (disputeMarket / voteOnDispute) is fully removed. In its place:
 * raiseDispute (staked-loser-only, proportional bond) and submitJuryVote
 * (5 fixed AI-agent wallets, 4-of-5 supermajority to overturn).
 *
 * Currency note: same as V1 — Arc's native gas token IS USDC, so amounts
 * here use msg.value directly and "$X" in comments means X * 10**18 wei.
 */
contract AgentArenaV2Legacy is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable {
    // ---------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------
    uint256 public constant DISPUTE_WINDOW = 24 hours;      // AI_RESOLVED -> must dispute within this
    uint256 public constant JURY_VOTE_WINDOW = 48 hours;    // DISPUTED -> jury must converge within this
    uint256 public constant JURY_THRESHOLD = 4;              // of 5, to overturn OR to uphold
    uint256 public constant JURY_SIZE = 5;

    uint256 public constant DISPUTE_BOND_BPS = 800;          // 8% of the disputer's losing-side stake
    // 🛡️ Arc's native gas token uses 18 decimals (confirmed against the live
    // frontend's arc.ts / balance.ts / agent-arena.ts, and against real
    // on-chain stake tx values), NOT 6 like a standard ERC-20 USDC token.
    // V1's dispute constants used `* 10**6`, which made them dust-level
    // (effectively free) against real 18-decimal msg.value amounts — not
    // repeating that bug here.
    uint256 public constant DISPUTE_BOND_FLOOR = 1 * 10**18;  // $1
    uint256 public constant DISPUTE_BOND_CAP = 40 * 10**18;   // $40
    uint256 public constant DISPUTE_REWARD_BPS = 2000;       // upheld disputer gets bond + 20% of reserve pool cut, capped by pool balance
    uint256 public constant DISPUTE_TREASURY_SHARE_BPS = 5000; // rejected bond: 50% to treasury
    // (the other 50% of a rejected bond goes to disputeReservePool, funding future upheld-dispute rewards —
    //  every wei is accounted for, unlike the V1 bug where 70% of a rejected dispute fee was never sent anywhere)

    uint256 public constant MAX_WINNER_FEE_BPS = 300;        // hard ceiling, 3% — cannot be exceeded even by the owner
    uint256 public constant FIXED_PROFIT_BPS = 10000;        // 100% gross profit on winning stake (1:1 fixed odds)
    uint256 public constant MAX_LOSS_TREASURY_BPS = 1000;    // losing-pool treasury cut hard-capped at 10%
    uint256 public constant UPGRADE_TIMELOCK = 48 hours;
    uint256 public constant AUTO_UNPAUSE_DELAY = 6 hours;    // self-heal window — see selfHealUnpause() below

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------
    enum Side { NONE, HAWK, DOVE }
    enum Status { OPEN, LOCKED, AI_RESOLVED, DISPUTED, FINALIZED }

    struct Market {
        string marketId;
        Status status;
        Side winner;
        Side tentativeWinner;
        uint256 hawkTotal;
        uint256 doveTotal;
        uint256 stakingEndTime;
        uint256 resolutionTime;
        uint256 aiResolutionTime;
        address disputer;
        uint256 disputeBond;
        uint256 disputeRaisedAt;
        bool exists;
    }

    struct Dispute {
        uint256 overturnVotes;
        uint256 upholdVotes;
        mapping(address => bool) hasVoted;
        bool resolved;
    }

    // Private for the same stack-too-deep reason V1 kept `markets` private.
    mapping(string => Market) private markets;
    mapping(string => Dispute) private disputes;

    mapping(string => mapping(address => mapping(Side => uint256))) public stakes;
    mapping(string => mapping(address => bool)) public claimed;

    address public treasury;
    uint256 public pendingTreasuryBalance; // accrues if a push-to-treasury transfer ever fails

    uint256 public winnerFeeBps; // owner-adjustable, hard-capped by MAX_WINNER_FEE_BPS

    address[JURY_SIZE] public juryMembers;
    mapping(address => bool) public isJury;

    uint256 public disputeReservePool; // funded by the treasury-share-complement of rejected disputes

    address public pendingImplementation;
    uint256 public upgradeUnlockTime;

    // 🛡️ NEW: separate hot "guardian" key that can PAUSE (for automated
    // anomaly-monitor.js response) but never UNPAUSE alone — unpausing now
    // requires 2-of-3 treasury signers (see approveUnpause() below), so a
    // compromised or malfunctioning monitoring script (or even a
    // compromised owner key) can only ever make the contract safer, never
    // resume it on a single key's say-so.
    address public guardian;
    uint256 public pausedAt; // 0 when not paused — set on pause(), cleared on any unpause

    // 🛡️ Multisig-gated unpause — see approveUnpause() below. Tracks
    // approvals for the CURRENT pause cycle only; cleared on any unpause.
    mapping(address => bool) public unpauseApprovedBy;
    uint256 public unpauseApprovalCount;

    // 🛡️ Multisig-gated upgrade — see proposeUpgrade()/approveUpgrade()
    // below. Tracks approvals for the CURRENT pendingImplementation only;
    // cleared whenever a new implementation is proposed or an upgrade executes.
    mapping(address => bool) public upgradeApprovedBy;
    uint256 public upgradeApprovalCount;

    // ---------------------------------------------------------------
    // V2 fixed-odds / funded-liquidity storage.
    // IMPORTANT: these variables consume slots from the existing storage gap;
    // no pre-existing slot above this point has moved. This is proxy-safe.
    // ---------------------------------------------------------------
    bool public fixedOddsEnabled;
    uint256 public lossTreasuryBps;          // default 5% of losing pool
    uint256 public liquidityReserve;         // protocol/LP-funded underwriting pool
    uint256 public totalReservedLiquidity;   // worst-case reserve locked across OPEN fixed-odds markets
    uint256 public totalLiquidityShares;
    mapping(address => uint256) public liquidityShares;
    mapping(string => bool) public fixedOddsMarket;
    mapping(string => uint256) public marketReserveRequirement;
    mapping(string => bool) public marketEconomicsSettled;
    mapping(string => uint256) public marketReserveUsed;
    mapping(string => uint256) public marketLossTreasuryAmount;

    // Reserved storage slots for future upgrades (standard OZ upgradeable pattern).
    // V2 fixed-odds extension consumes 11 slots from the previous 39-slot gap.
    uint256[28] private __gap;

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------
    event MarketCreated(string marketId, uint256 stakingEndTime, uint256 resolutionTime);
    event Staked(string marketId, address indexed user, Side side, uint256 amount);
    event AIResolved(string marketId, Side tentativeWinner);
    event Disputed(string marketId, address indexed disputer, uint256 bond);
    event JuryVoted(string marketId, address indexed juror, bool overturn);
    event DisputeResolved(string marketId, bool overturned, Side finalWinner);
    event DisputeInconclusive(string marketId, Side finalWinner);
    event Finalized(string marketId, Side finalWinner);
    event Claimed(string marketId, address indexed user, uint256 amount);
    event FeeCollected(string marketId, uint256 amount, address treasury);
    event FeeAccrualFailed(string marketId, uint256 amount);
    event TreasuryRetrySucceeded(uint256 amount);
    event WinnerFeeUpdated(uint256 newBps);
    event JuryMemberUpdated(uint256 indexed index, address oldMember, address newMember);
    event UpgradeProposed(address indexed newImplementation, uint256 unlockTime);
    event GuardianUpdated(address oldGuardian, address newGuardian);
    event AutoUnpaused(uint256 timestamp);
    event UnpauseApproved(address indexed signer, uint256 approvalCount);
    event UpgradeApproved(address indexed signer, address indexed newImplementation, uint256 approvalCount);
    event FixedOddsInitialized(uint256 winnerFeeBps, uint256 lossTreasuryBps);
    event FixedOddsEnabledUpdated(bool enabled);
    event LossTreasuryShareUpdated(uint256 newBps);
    event LiquidityProvided(address indexed provider, uint256 amount, uint256 sharesMinted);
    event LiquidityDonated(address indexed provider, uint256 amount);
    event LiquidityWithdrawn(address indexed provider, uint256 amount, uint256 sharesBurned);
    event MarketReserveUpdated(string marketId, uint256 oldRequirement, uint256 newRequirement);
    event MarketEconomicsSettled(string marketId, uint256 reserveUsed, uint256 reserveSurplus, uint256 lossTreasuryAmount);

    // ---------------------------------------------------------------
    // Initialization (replaces constructor for upgradeable contracts)
    // ---------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address _treasury,
        address[JURY_SIZE] memory _juryMembers,
        address _guardian
    ) public initializer {
        __Ownable_init(initialOwner);
        // Note: __UUPSUpgradeable_init() is intentionally not called — OZ
        // 5.6+ removed it (it was a no-op with no state to initialize).
        // If you're compiling against an older OZ version (<5.6) that still
        // has it, calling it is harmless but not required either way.
        __Pausable_init();

        require(_treasury != address(0), "zero address treasury");
        treasury = _treasury;
        winnerFeeBps = 200; // 2%, within the 3% hard ceiling

        require(_guardian != address(0), "zero address guardian");
        guardian = _guardian;

        for (uint256 i = 0; i < JURY_SIZE; i++) {
            require(_juryMembers[i] != address(0), "zero address juror");
            juryMembers[i] = _juryMembers[i];
            isJury[_juryMembers[i]] = true;
        }
    }

    /// @notice One-time initializer for the fixed-odds funded-liquidity model.
    /// Existing V2 markets remain legacy/parimutuel; markets created after
    /// this call are explicitly marked fixedOddsMarket=true.
    function initializeFixedOddsV2() external reinitializer(2) onlyOwner {
        winnerFeeBps = 150;      // preserve original Geomacro 1.5% fee, now charged ONLY on profit
        lossTreasuryBps = 500;   // 5% of losing stake goes to treasury; configurable up to 10%
        fixedOddsEnabled = true;
        emit WinnerFeeUpdated(winnerFeeBps);
        emit LossTreasuryShareUpdated(lossTreasuryBps);
        emit FixedOddsEnabledUpdated(true);
        emit FixedOddsInitialized(winnerFeeBps, lossTreasuryBps);
    }

    // ---------------------------------------------------------------
    // Upgrade authorization — owner + 48h timelock on the exact address proposed
    // ---------------------------------------------------------------
    /// @notice Starts a 48h-timelocked upgrade proposal. Callable by ANY
    /// treasury signer (not the owner) — proposing counts as that signer's
    /// own approval, same pattern as MultisigTreasury.proposeWithdrawal().
    /// A single compromised key can propose but can never execute alone —
    /// see _authorizeUpgrade below.
    function proposeUpgrade(address newImplementation) external {
        require(_isTreasurySigner(msg.sender), "not a treasury signer");
        require(newImplementation != address(0), "zero address");
        _clearUpgradeApprovals();
        pendingImplementation = newImplementation;
        upgradeUnlockTime = block.timestamp + UPGRADE_TIMELOCK;
        upgradeApprovedBy[msg.sender] = true;
        upgradeApprovalCount = 1;
        emit UpgradeProposed(newImplementation, upgradeUnlockTime);
        emit UpgradeApproved(msg.sender, newImplementation, 1);
    }

    /// @notice A second (or third) treasury signer approves the currently
    /// pending upgrade proposal.
    function approveUpgrade(address newImplementation) external {
        require(_isTreasurySigner(msg.sender), "not a treasury signer");
        require(newImplementation == pendingImplementation, "does not match pending proposal");
        require(!upgradeApprovedBy[msg.sender], "already approved by this signer");
        upgradeApprovedBy[msg.sender] = true;
        upgradeApprovalCount += 1;
        emit UpgradeApproved(msg.sender, newImplementation, upgradeApprovalCount);
    }

    function _clearUpgradeApprovals() internal {
        address[3] memory signers = IMultisigTreasury(treasury).getSigners();
        for (uint256 i = 0; i < 3; i++) upgradeApprovedBy[signers[i]] = false;
        upgradeApprovalCount = 0;
    }

    /// @notice Called automatically by UUPS's upgradeToAndCall(). No
    /// onlyOwner here anymore — a single compromised key (owner OR any one
    /// treasury signer) can never push a malicious implementation alone.
    /// Requires: (1) the timelock has actually elapsed, (2) 2-of-3 treasury
    /// signers explicitly approved THIS SPECIFIC implementation address —
    /// not just "an upgrade in general". This closes the gap where pause()
    /// alone couldn't stop a compromised-owner-key upgrade from rewriting
    /// the contract's logic out from under the pause — upgrade authority is
    /// now gated the same way fund withdrawals already are.
    function _authorizeUpgrade(address newImplementation) internal override {
        require(newImplementation == pendingImplementation, "must match proposed implementation");
        require(upgradeUnlockTime != 0 && block.timestamp >= upgradeUnlockTime, "timelock not elapsed");
        require(upgradeApprovalCount >= 2, "needs 2-of-3 treasury signer approval");
        pendingImplementation = address(0);
        upgradeUnlockTime = 0;
        _clearUpgradeApprovals();
    }

    // ---------------------------------------------------------------
    // Circuit breaker — pause() is callable by the guardian (hot key, driven
    // by scripts/anomaly-monitor.js's WARN/CRITICAL thresholds) OR the owner.
    // unpause() requires 2-of-3 treasury signers (see approveUnpause below) —
    // deliberately asymmetric with pause, so an automated response can only
    // make the contract safer, never resume it on a single key's say-so.
    // automated response can only make the contract safer, never resume it
    // ON ITS OWN AUTHORITY. Every fund-moving or state-changing external
    // function below is gated with whenNotPaused, INCLUDING claim() — during
    // a suspected exploit, letting withdrawals continue could be the attack
    // itself, so the conservative default is to halt everything until
    // manual review.
    //
    // SELF-HEAL: if nobody manually unpauses within AUTO_UNPAUSE_DELAY
    // (6h), selfHealUnpause() becomes callable by ANYONE — permissionless,
    // not guardian-gated, so this doesn't reopen the "automated key can
    // resume itself" risk. This bounds the damage from a false-positive
    // pause (organic traffic spike, no team member awake) without ever
    // letting the pausing key unpause on its own judgment; a genuine
    // incident still gives the team a real review window, and even after
    // auto-unpause, per-market/per-wallet caps (dispute bond $1-$40, etc.)
    // limit how much a still-ongoing attack could extract before the next
    // anomaly-monitor.js run (every 15 min) re-pauses it.
    // ---------------------------------------------------------------
    function setGuardian(address newGuardian) external onlyOwner {
        require(newGuardian != address(0), "zero address");
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function _isTreasurySigner(address account) internal view returns (bool) {
        address[3] memory signers = IMultisigTreasury(treasury).getSigners();
        return account == signers[0] || account == signers[1] || account == signers[2];
    }

    function pause() external {
        require(msg.sender == guardian || msg.sender == owner(), "not authorized to pause");
        pausedAt = block.timestamp;
        _pause();
    }

    /// @notice Replaces the old owner-only unpause(). A SINGLE compromised
    /// key (even the owner's) can no longer resume the contract — it now
    /// takes 2-of-3 of the same signers who already guard treasury
    /// withdrawals. Each signer calls this once; the second qualifying
    /// call actually unpauses. Approvals are scoped to the current pause
    /// cycle and reset automatically on any unpause.
    function approveUnpause() external {
        require(paused(), "not paused");
        require(_isTreasurySigner(msg.sender), "not a treasury signer");
        require(!unpauseApprovedBy[msg.sender], "already approved by this signer");
        unpauseApprovedBy[msg.sender] = true;
        unpauseApprovalCount += 1;
        emit UnpauseApproved(msg.sender, unpauseApprovalCount);

        if (unpauseApprovalCount >= 2) {
            _clearUnpauseApprovals();
            pausedAt = 0;
            _unpause();
        }
    }

    function _clearUnpauseApprovals() internal {
        address[3] memory signers = IMultisigTreasury(treasury).getSigners();
        for (uint256 i = 0; i < 3; i++) unpauseApprovedBy[signers[i]] = false;
        unpauseApprovalCount = 0;
    }

    /// @notice Permissionless — anyone can call this once AUTO_UNPAUSE_DELAY
    /// has elapsed since pause() was called. See the circuit-breaker note
    /// above for why this is intentionally NOT restricted to guardian/owner.
    function selfHealUnpause() external {
        require(paused(), "not paused");
        require(pausedAt != 0 && block.timestamp >= pausedAt + AUTO_UNPAUSE_DELAY, "auto-unpause delay not elapsed");
        _clearUnpauseApprovals();
        pausedAt = 0;
        _unpause();
        emit AutoUnpaused(block.timestamp);
    }

    // ---------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------
    function setWinnerFeeBps(uint256 newBps) external onlyOwner {
        require(newBps <= MAX_WINNER_FEE_BPS, "exceeds hard ceiling");
        winnerFeeBps = newBps;
        emit WinnerFeeUpdated(newBps);
    }

    function setLossTreasuryBps(uint256 newBps) external onlyOwner {
        require(newBps <= MAX_LOSS_TREASURY_BPS, "loss treasury share too high");
        require(totalReservedLiquidity == 0, "active reserve commitments");
        lossTreasuryBps = newBps;
        emit LossTreasuryShareUpdated(newBps);
    }

    function setFixedOddsEnabled(bool enabled) external onlyOwner {
        if (!enabled) require(totalReservedLiquidity == 0, "active reserve commitments");
        fixedOddsEnabled = enabled;
        emit FixedOddsEnabledUpdated(enabled);
    }

    /// @notice Jury wallets are automated, project-run bots (not third-party
    /// custody like the treasury signers), so rotation is a plain owner
    /// action — no timelock needed for an operational key swap.
    function updateJuryMember(uint256 index, address newMember) external onlyOwner {
        require(index < JURY_SIZE, "invalid index");
        require(newMember != address(0), "zero address");
        require(!isJury[newMember], "already a juror");

        address old = juryMembers[index];
        isJury[old] = false;
        juryMembers[index] = newMember;
        isJury[newMember] = true;

        emit JuryMemberUpdated(index, old, newMember);
    }

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------
    function getMarket(string calldata marketId) external view returns (
        uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists
    ) {
        Market storage m = markets[marketId];
        return (uint8(m.status), m.hawkTotal, m.doveTotal, m.exists);
    }

    function getMarketFullDetails(string calldata marketId) external view returns (
        uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime,
        uint256 resolutionTime, uint256 aiResolutionTime, address disputer,
        uint256 disputeBond, uint256 disputeRaisedAt
    ) {
        Market storage m = markets[marketId];
        return (
            uint8(m.status), uint8(m.winner), uint8(m.tentativeWinner),
            m.stakingEndTime, m.resolutionTime, m.aiResolutionTime,
            m.disputer, m.disputeBond, m.disputeRaisedAt
        );
    }

    function getDispute(string calldata marketId) external view returns (
        uint256 overturnVotes, uint256 upholdVotes, bool resolved
    ) {
        Dispute storage d = disputes[marketId];
        return (d.overturnVotes, d.upholdVotes, d.resolved);
    }

    function hasJuryVoted(string calldata marketId, address juror) external view returns (bool) {
        return disputes[marketId].hasVoted[juror];
    }

    function getJuryMembers() external view returns (address[JURY_SIZE] memory) {
        return juryMembers;
    }

    function availableLiquidityReserve() public view returns (uint256) {
        return liquidityReserve > totalReservedLiquidity ? liquidityReserve - totalReservedLiquidity : 0;
    }

    function quoteFixedPayout(uint256 stakeAmount) public view returns (
        uint256 principal, uint256 grossProfit, uint256 winnerFee, uint256 netPayout
    ) {
        principal = stakeAmount;
        grossProfit = (stakeAmount * FIXED_PROFIT_BPS) / 10000;
        winnerFee = (grossProfit * winnerFeeBps) / 10000;
        netPayout = principal + grossProfit - winnerFee;
    }

    function requiredReserveForTotals(uint256 hawkTotal, uint256 doveTotal) public view returns (uint256) {
        uint256 usableDoveIfHawkWins = doveTotal - ((doveTotal * lossTreasuryBps) / 10000);
        uint256 usableHawkIfDoveWins = hawkTotal - ((hawkTotal * lossTreasuryBps) / 10000);

        uint256 hawkProfitLiability = (hawkTotal * FIXED_PROFIT_BPS) / 10000;
        uint256 doveProfitLiability = (doveTotal * FIXED_PROFIT_BPS) / 10000;

        uint256 ifHawkWins = hawkProfitLiability > usableDoveIfHawkWins
            ? hawkProfitLiability - usableDoveIfHawkWins
            : 0;
        uint256 ifDoveWins = doveProfitLiability > usableHawkIfDoveWins
            ? doveProfitLiability - usableHawkIfDoveWins
            : 0;
        return ifHawkWins > ifDoveWins ? ifHawkWins : ifDoveWins;
    }

    /// @notice Permissionless LP funding. Shares represent a pro-rata claim on
    /// the protocol underwriting reserve, including future reserve gains/losses.
    function provideLiquidity() external payable whenNotPaused returns (uint256 sharesMinted) {
        require(msg.value > 0, "liquidity must be > 0");
        require(totalLiquidityShares == 0 || liquidityReserve > 0, "reserve needs recapitalization first");
        if (totalLiquidityShares == 0) {
            sharesMinted = msg.value;
        } else {
            sharesMinted = (msg.value * totalLiquidityShares) / liquidityReserve;
        }
        require(sharesMinted > 0, "liquidity too small");
        liquidityShares[msg.sender] += sharesMinted;
        totalLiquidityShares += sharesMinted;
        liquidityReserve += msg.value;
        emit LiquidityProvided(msg.sender, msg.value, sharesMinted);
    }

    /// @notice Adds reserve capital without minting LP shares. Useful for
    /// treasury grants/recapitalization after reserve losses.
    function donateLiquidity() external payable whenNotPaused {
        require(msg.value > 0, "liquidity must be > 0");
        liquidityReserve += msg.value;
        emit LiquidityDonated(msg.sender, msg.value);
    }

    /// @notice LP withdrawal can only use reserve that is not already locked
    /// to guarantee active fixed-odds markets.
    function withdrawLiquidity(uint256 sharesToBurn) external whenNotPaused {
        require(sharesToBurn > 0 && sharesToBurn <= liquidityShares[msg.sender], "invalid shares");
        require(totalLiquidityShares > 0, "no liquidity shares");
        uint256 amount = (sharesToBurn * liquidityReserve) / totalLiquidityShares;
        require(amount <= availableLiquidityReserve(), "liquidity reserved for active markets");

        liquidityShares[msg.sender] -= sharesToBurn;
        totalLiquidityShares -= sharesToBurn;
        liquidityReserve -= amount;

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "liquidity withdrawal failed");
        emit LiquidityWithdrawn(msg.sender, amount, sharesToBurn);
    }

    // ---------------------------------------------------------------
    // Market lifecycle
    // ---------------------------------------------------------------
    function createMarket(
        string calldata marketId,
        uint256 stakingDuration,
        uint256 resolutionDuration
    ) external onlyOwner whenNotPaused {
        require(!markets[marketId].exists, "Market already exists");

        markets[marketId] = Market({
            marketId: marketId,
            status: Status.OPEN,
            winner: Side.NONE,
            tentativeWinner: Side.NONE,
            hawkTotal: 0,
            doveTotal: 0,
            stakingEndTime: block.timestamp + stakingDuration,
            resolutionTime: block.timestamp + resolutionDuration,
            aiResolutionTime: 0,
            disputer: address(0),
            disputeBond: 0,
            disputeRaisedAt: 0,
            exists: true
        });

        if (fixedOddsEnabled) {
            fixedOddsMarket[marketId] = true;
        }

        emit MarketCreated(marketId, block.timestamp + stakingDuration, block.timestamp + resolutionDuration);
    }

    function declareWinnerByAI(string calldata marketId, Side winningSide) external onlyOwner whenNotPaused {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.OPEN, "Invalid status");
        require(block.timestamp >= m.resolutionTime, "Too early to resolve");
        require(winningSide == Side.HAWK || winningSide == Side.DOVE, "Invalid side");

        m.status = Status.AI_RESOLVED;
        m.tentativeWinner = winningSide;
        m.aiResolutionTime = block.timestamp;

        emit AIResolved(marketId, winningSide);
    }

    function stake(string calldata marketId, Side side) external payable whenNotPaused {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.OPEN, "Market closed");
        require(block.timestamp <= m.stakingEndTime, "Staking period has ended");
        require(side == Side.HAWK || side == Side.DOVE, "Invalid side");
        require(msg.value > 0, "Stake must be > 0");

        if (fixedOddsMarket[marketId]) {
            uint256 newHawkTotal = m.hawkTotal + (side == Side.HAWK ? msg.value : 0);
            uint256 newDoveTotal = m.doveTotal + (side == Side.DOVE ? msg.value : 0);
            uint256 oldRequirement = marketReserveRequirement[marketId];
            uint256 newRequirement = requiredReserveForTotals(newHawkTotal, newDoveTotal);

            if (newRequirement > oldRequirement) {
                uint256 additional = newRequirement - oldRequirement;
                require(additional <= availableLiquidityReserve(), "insufficient funded liquidity reserve");
                totalReservedLiquidity += additional;
            } else if (oldRequirement > newRequirement) {
                totalReservedLiquidity -= (oldRequirement - newRequirement);
            }
            marketReserveRequirement[marketId] = newRequirement;
            emit MarketReserveUpdated(marketId, oldRequirement, newRequirement);
        }

        stakes[marketId][msg.sender][side] += msg.value;

        if (side == Side.HAWK) {
            m.hawkTotal += msg.value;
        } else {
            m.doveTotal += msg.value;
        }

        emit Staked(marketId, msg.sender, side, msg.value);
    }

    // ---------------------------------------------------------------
    // Dispute — AI jury, no human vote
    // ---------------------------------------------------------------

    /// @notice Only a staker on the side the AI verdict went against can
    /// raise a dispute, and only within DISPUTE_WINDOW of the AI verdict.
    /// Bond is proportional to the caller's own losing-side stake.
    function raiseDispute(string calldata marketId) external payable whenNotPaused {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.AI_RESOLVED, "Not in dispute phase");
        require(block.timestamp <= m.aiResolutionTime + DISPUTE_WINDOW, "Dispute window closed");

        Side losingSide = m.tentativeWinner == Side.HAWK ? Side.DOVE : Side.HAWK;
        uint256 callerLosingStake = stakes[marketId][msg.sender][losingSide];
        require(callerLosingStake > 0, "Must have staked on the losing side");

        uint256 requiredBond = _clampBond((callerLosingStake * DISPUTE_BOND_BPS) / 10000);
        require(msg.value == requiredBond, "Incorrect bond amount");

        m.disputer = msg.sender;
        m.disputeBond = msg.value;
        m.disputeRaisedAt = block.timestamp;
        m.status = Status.DISPUTED;

        emit Disputed(marketId, msg.sender, msg.value);
    }

    function _clampBond(uint256 raw) private pure returns (uint256) {
        if (raw < DISPUTE_BOND_FLOOR) return DISPUTE_BOND_FLOOR;
        if (raw > DISPUTE_BOND_CAP) return DISPUTE_BOND_CAP;
        return raw;
    }

    /// @notice Called by one of the 5 fixed jury wallets. `overturn == true`
    /// means the juror agrees with the disputer (the AI verdict was wrong).
    /// Resolves immediately once either side reaches JURY_THRESHOLD (4-of-5).
    function submitJuryVote(string calldata marketId, bool overturn) external whenNotPaused {
        require(isJury[msg.sender], "not a jury member");

        Market storage m = markets[marketId];
        require(m.status == Status.DISPUTED, "Market is not disputed");
        require(block.timestamp <= m.disputeRaisedAt + JURY_VOTE_WINDOW, "Jury voting window closed");

        Dispute storage d = disputes[marketId];
        require(!d.resolved, "Dispute already resolved");
        require(!d.hasVoted[msg.sender], "Already voted");

        d.hasVoted[msg.sender] = true;
        if (overturn) {
            d.overturnVotes += 1;
        } else {
            d.upholdVotes += 1;
        }

        emit JuryVoted(marketId, msg.sender, overturn);

        if (d.overturnVotes >= JURY_THRESHOLD) {
            _settleDispute(marketId, true);
        } else if (d.upholdVotes >= JURY_THRESHOLD) {
            _settleDispute(marketId, false);
        }
    }

    function _settleDispute(string calldata marketId, bool overturned) private {
        Market storage m = markets[marketId];
        Dispute storage d = disputes[marketId];

        d.resolved = true;
        m.winner = overturned
            ? (m.tentativeWinner == Side.HAWK ? Side.DOVE : Side.HAWK)
            : m.tentativeWinner;
        m.status = Status.FINALIZED;
        _settleFixedOddsEconomics(marketId);

        if (overturned) {
            uint256 reward = (m.disputeBond * DISPUTE_REWARD_BPS) / 10000;
            if (reward > disputeReservePool) reward = disputeReservePool;
            disputeReservePool -= reward;

            uint256 payout = m.disputeBond + reward;
            (bool sent, ) = m.disputer.call{value: payout}("");
            require(sent, "Disputer payout failed");
        } else {
            uint256 treasuryShare = (m.disputeBond * DISPUTE_TREASURY_SHARE_BPS) / 10000;
            uint256 reserveShare = m.disputeBond - treasuryShare; // remainder, fully accounted for
            disputeReservePool += reserveShare;
            _pushToTreasury(marketId, treasuryShare);
        }

        emit DisputeResolved(marketId, overturned, m.winner);
        emit Finalized(marketId, m.winner);
    }

    // ---------------------------------------------------------------
    // Finalize — normal path, plus the inconclusive-jury fallback
    // ---------------------------------------------------------------
    function finalizeMarket(string calldata marketId) external whenNotPaused {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");

        if (m.status == Status.AI_RESOLVED && block.timestamp > m.aiResolutionTime + DISPUTE_WINDOW) {
            m.winner = m.tentativeWinner;
            m.status = Status.FINALIZED;
            _settleFixedOddsEconomics(marketId);
            emit Finalized(marketId, m.winner);
            return;
        }

        // Jury never reached a 4-of-5 supermajority within the window: uphold
        // the AI verdict (status-quo bias, prevents indefinite fund lock) and
        // refund the disputer's bond in full — inconclusive is not their fault.
        if (m.status == Status.DISPUTED && block.timestamp > m.disputeRaisedAt + JURY_VOTE_WINDOW) {
            Dispute storage d = disputes[marketId];
            require(!d.resolved, "Dispute already resolved");
            d.resolved = true;

            m.winner = m.tentativeWinner;
            m.status = Status.FINALIZED;
            _settleFixedOddsEconomics(marketId);

            (bool sent, ) = m.disputer.call{value: m.disputeBond}("");
            require(sent, "Bond refund failed");

            emit DisputeInconclusive(marketId, m.winner);
            emit Finalized(marketId, m.winner);
        }
    }

    // ---------------------------------------------------------------
    // Fixed-odds market economics + claim
    // ---------------------------------------------------------------
    function _settleFixedOddsEconomics(string memory marketId) private {
        if (!fixedOddsMarket[marketId] || marketEconomicsSettled[marketId]) return;

        Market storage m = markets[marketId];
        uint256 reserved = marketReserveRequirement[marketId];
        if (reserved > 0) {
            totalReservedLiquidity -= reserved;
            marketReserveRequirement[marketId] = 0;
        }

        uint256 winningPool = m.winner == Side.HAWK ? m.hawkTotal : m.doveTotal;
        uint256 losingPool = m.winner == Side.HAWK ? m.doveTotal : m.hawkTotal;
        uint256 lossTreasuryAmount = (losingPool * lossTreasuryBps) / 10000;
        uint256 usableLosingPool = losingPool - lossTreasuryAmount;
        uint256 grossProfitLiability = (winningPool * FIXED_PROFIT_BPS) / 10000;

        uint256 reserveUsed = 0;
        uint256 reserveSurplus = 0;
        if (grossProfitLiability > usableLosingPool) {
            reserveUsed = grossProfitLiability - usableLosingPool;
            require(reserveUsed <= liquidityReserve, "liquidity reserve insolvent");
            liquidityReserve -= reserveUsed;
        } else {
            reserveSurplus = usableLosingPool - grossProfitLiability;
            liquidityReserve += reserveSurplus;
        }

        marketReserveUsed[marketId] = reserveUsed;
        marketLossTreasuryAmount[marketId] = lossTreasuryAmount;
        marketEconomicsSettled[marketId] = true;
        _pushToTreasury(marketId, lossTreasuryAmount);
        emit MarketEconomicsSettled(marketId, reserveUsed, reserveSurplus, lossTreasuryAmount);
    }

    function claim(string calldata marketId) external whenNotPaused {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.FINALIZED, "Market not finalized yet");
        require(!claimed[marketId][msg.sender], "Already claimed");

        Side winSide = m.winner;
        uint256 totalUserStaked = stakes[marketId][msg.sender][winSide];
        require(totalUserStaked > 0, "Nothing to claim");

        uint256 netPayout;
        uint256 platformFee;

        if (fixedOddsMarket[marketId]) {
            if (!marketEconomicsSettled[marketId]) _settleFixedOddsEconomics(marketId);
            (, uint256 grossProfit, uint256 fee, uint256 quotedNet) = quoteFixedPayout(totalUserStaked);
            grossProfit; // explicit for readability; fee is charged only on profit
            platformFee = fee;
            netPayout = quotedNet;
        } else {
            // Legacy V2 markets retain the original parimutuel payout formula.
            uint256 payout = totalUserStaked;
            uint256 winningPoolTotal = winSide == Side.HAWK ? m.hawkTotal : m.doveTotal;
            uint256 losingPoolTotal = winSide == Side.HAWK ? m.doveTotal : m.hawkTotal;
            if (winningPoolTotal > 0 && losingPoolTotal > 0) {
                payout += (totalUserStaked * losingPoolTotal) / winningPoolTotal;
            }
            platformFee = (payout * winnerFeeBps) / 10000;
            netPayout = payout - platformFee;
        }

        claimed[marketId][msg.sender] = true;
        _pushToTreasury(marketId, platformFee);

        (bool sent, ) = msg.sender.call{value: netPayout}("");
        require(sent, "Payout transfer failed");
        emit Claimed(marketId, msg.sender, netPayout);
    }

    // ---------------------------------------------------------------
    // Treasury forwarding — never blocks a user payout
    // ---------------------------------------------------------------
    function _pushToTreasury(string memory marketId, uint256 amount) private {
        if (amount == 0) return;
        (bool sent, ) = treasury.call{value: amount}("");
        if (sent) {
            emit FeeCollected(marketId, amount, treasury);
        } else {
            pendingTreasuryBalance += amount;
            emit FeeAccrualFailed(marketId, amount);
        }
    }

    /// @notice Permissionless retry — anyone can nudge accrued fees toward
    /// the treasury once whatever transient issue blocked the push transfer
    /// is resolved. No privileged access needed since it only ever moves
    /// funds to the fixed treasury address.
    function retryTreasuryTransfer() external {
        uint256 amount = pendingTreasuryBalance;
        require(amount > 0, "nothing pending");
        pendingTreasuryBalance = 0;

        (bool sent, ) = treasury.call{value: amount}("");
        require(sent, "retry failed");

        emit TreasuryRetrySucceeded(amount);
    }
}
