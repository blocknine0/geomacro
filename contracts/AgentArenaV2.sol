// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

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
 * here use msg.value directly and "$X" in comments means X * 10**6.
 */
contract AgentArenaV2 is Initializable, OwnableUpgradeable, UUPSUpgradeable {
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
    uint256 public constant UPGRADE_TIMELOCK = 48 hours;

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

    // Reserved storage slots for future upgrades (standard OZ upgradeable pattern).
    uint256[45] private __gap;

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
        address[JURY_SIZE] memory _juryMembers
    ) public initializer {
        __Ownable_init(initialOwner);
        // Note: __UUPSUpgradeable_init() is intentionally not called — OZ
        // 5.6+ removed it (it was a no-op with no state to initialize).
        // If you're compiling against an older OZ version (<5.6) that still
        // has it, calling it is harmless but not required either way.

        require(_treasury != address(0), "zero address treasury");
        treasury = _treasury;
        winnerFeeBps = 200; // 2%, within the 3% hard ceiling

        for (uint256 i = 0; i < JURY_SIZE; i++) {
            require(_juryMembers[i] != address(0), "zero address juror");
            juryMembers[i] = _juryMembers[i];
            isJury[_juryMembers[i]] = true;
        }
    }

    // ---------------------------------------------------------------
    // Upgrade authorization — owner + 48h timelock on the exact address proposed
    // ---------------------------------------------------------------
    function proposeUpgrade(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "zero address");
        pendingImplementation = newImplementation;
        upgradeUnlockTime = block.timestamp + UPGRADE_TIMELOCK;
        emit UpgradeProposed(newImplementation, upgradeUnlockTime);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation == pendingImplementation, "must match proposed implementation");
        require(upgradeUnlockTime != 0 && block.timestamp >= upgradeUnlockTime, "timelock not elapsed");
        pendingImplementation = address(0);
        upgradeUnlockTime = 0;
    }

    // ---------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------
    function setWinnerFeeBps(uint256 newBps) external onlyOwner {
        require(newBps <= MAX_WINNER_FEE_BPS, "exceeds hard ceiling");
        winnerFeeBps = newBps;
        emit WinnerFeeUpdated(newBps);
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

    // ---------------------------------------------------------------
    // Market lifecycle — unchanged from V1
    // ---------------------------------------------------------------
    function createMarket(
        string calldata marketId,
        uint256 stakingDuration,
        uint256 resolutionDuration
    ) external onlyOwner {
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

        emit MarketCreated(marketId, block.timestamp + stakingDuration, block.timestamp + resolutionDuration);
    }

    function declareWinnerByAI(string calldata marketId, Side winningSide) external onlyOwner {
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

    function stake(string calldata marketId, Side side) external payable {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.OPEN, "Market closed");
        require(block.timestamp <= m.stakingEndTime, "Staking period has ended");
        require(side == Side.HAWK || side == Side.DOVE, "Invalid side");
        require(msg.value > 0, "Stake must be > 0");

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
    function raiseDispute(string calldata marketId) external payable {
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
    function submitJuryVote(string calldata marketId, bool overturn) external {
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
    function finalizeMarket(string calldata marketId) external {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");

        if (m.status == Status.AI_RESOLVED && block.timestamp > m.aiResolutionTime + DISPUTE_WINDOW) {
            m.winner = m.tentativeWinner;
            m.status = Status.FINALIZED;
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

            (bool sent, ) = m.disputer.call{value: m.disputeBond}("");
            require(sent, "Bond refund failed");

            emit DisputeInconclusive(marketId, m.winner);
            emit Finalized(marketId, m.winner);
        }
    }

    // ---------------------------------------------------------------
    // Claim
    // ---------------------------------------------------------------
    function claim(string calldata marketId) external {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.FINALIZED, "Market not finalized yet");
        require(!claimed[marketId][msg.sender], "Already claimed");

        Side winSide = m.winner;
        uint256 totalUserStaked = stakes[marketId][msg.sender][winSide];
        require(totalUserStaked > 0, "Nothing to claim");

        uint256 payout = totalUserStaked;
        {
            uint256 winningPoolTotal = winSide == Side.HAWK ? m.hawkTotal : m.doveTotal;
            uint256 losingPoolTotal = winSide == Side.HAWK ? m.doveTotal : m.hawkTotal;
            if (winningPoolTotal > 0 && losingPoolTotal > 0) {
                payout += (totalUserStaked * losingPoolTotal) / winningPoolTotal;
            }
        }

        claimed[marketId][msg.sender] = true;
        uint256 platformFee = (payout * winnerFeeBps) / 10000;

        _pushToTreasury(marketId, platformFee);

        (bool sent, ) = msg.sender.call{value: payout - platformFee}("");
        require(sent, "Payout transfer failed");

        emit Claimed(marketId, msg.sender, payout - platformFee);
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
