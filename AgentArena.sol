// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AgentArena (Upgraded)
 * ---------------------
 * Features added:
 * 1. Anti-MEV / Front-running window locks.
 * 2. Optimistic AI Resolution + 24h Public Stake-Backed Dispute Window.
 * 3. 1.5% Protocol revenue fee routed to the treasury wallet.
 * 4. Anti-spam DAO voting mechanics with $50 USDC dispute fee.
 */
contract AgentArena {
    address public owner;
    address public treasury; // রেভিনিউ কালেক্ট করার জন্য ওয়ালেট অ্যাড্রেস

    uint256 public constant DISPUTE_FEE = 50 * 10**6;            // ৫০ USDC (ধরে নিচ্ছি ৬ ডেসিমিলে)
    uint256 public constant DISPUTE_WINDOW = 24 * 60 * 60;        // ২৪ ঘণ্টা আপিল উইন্ডো
    uint256 public constant MIN_VOLUME_FOR_DISPUTE = 500 * 10**6;  // ৫০০ USDC এর নিচে ডিসপিউট অসম্ভব
    uint256 public constant MIN_VOTE_AMOUNT = 5 * 10**6;          // স্প্যাম রোধে মিনিমাম ৫ USDC ভোট
    uint256 public constant PROTOCOL_FEE_BPS = 150;              // ১.৫% প্রোটোকল ফি (150 BPS)
    uint256 public constant TREASURY_DISPUTE_SHARE_BPS = 3000;    // হারানো ডিসপিউট ফি-এর ৩০% আপনার লাভ

    enum Side { NONE, HAWK, DOVE }
    enum Status { OPEN, LOCKED, AI_RESOLVED, DISPUTED, FINALIZED }

    struct Market {
        string marketId;
        Status status;
        Side winner;          // ফাইনাল বিজয়ী
        Side tentativeWinner; // AI-এর দেওয়া সাময়িক বিজয়ী
        uint256 hawkTotal;
        uint256 doveTotal;
        uint256 stakingEndTime;
        uint256 resolutionTime;
        uint256 aiResolutionTime;
        address disputer;
        uint256 hawkVotes;    // ডিসপিউটের সময় HAWK পক্ষে পড়া ভোটের সংখ্যা
        uint256 doveVotes;    // ডিসপিউটের সময় DOVE পক্ষে পড়া ভোটের সংখ্যা
        bool exists;
    }

    // marketId (string) => Market
    mapping(string => Market) public markets;

    // marketId => user => side => amount staked
    mapping(string => mapping(address => mapping(Side => uint256))) public stakes;

    // marketId => user => amount voted in DAO dispute
    mapping(string => mapping(address => uint256)) public userVotes;

    // marketId => user => whether they've already claimed
    mapping(string => mapping(address => bool)) public claimed;

    event MarketCreated(string marketId, uint256 stakingEndTime, uint256 resolutionTime);
    event Staked(string marketId, address indexed user, Side side, uint256 amount);
    event AIResolved(string marketId, Side tentativeWinner);
    event Disputed(string marketId, address indexed disputer);
    event DAOExceptionVoted(string marketId, address indexed voter, Side side, uint256 amount);
    event Finalized(string marketId, Side finalWinner);
    event Claimed(string marketId, address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _treasury) {
        owner = msg.sender;
        treasury = _treasury;
    }

    // ---- Owner / Pipeline Functions ----

    // ১. মার্কেট ক্রিয়েট করার সময় টাইম-লক প্যারামিটার ইন্টিগ্রেশন
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
            stakingEndTime: block.timestamp + stakingDuration,     // যেমন: ২৪ ঘণ্টা = 86400
            resolutionTime: block.timestamp + resolutionDuration, // যেমন: ৪৮ ঘণ্টা = 172800
            aiResolutionTime: 0,
            disputer: address(0),
            hawkVotes: 0,
            doveVotes: 0,
            exists: true
        });

        emit MarketCreated(marketId, block.timestamp + stakingDuration, block.timestamp + resolutionDuration);
    }

    // ২. আপনার গিটহাব অ্যাকশন স্ক্রিপ্ট (Groq) এখন সরাসরি নিষ্পত্তির বদলে এই ফাংশনটি কল করবে
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

    // ৩. ২৪ ঘণ্টা শেষ হলে মার্কেট ফাইনাল ও রেভিনিউ ডিস্ট্রিবিউশন করার অটোমেটেড লজিক
    function finalizeMarket(string calldata marketId) external {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");

        if (m.status == Status.AI_RESOLVED && block.timestamp > m.aiResolutionTime + DISPUTE_WINDOW) {
            // কেউ চ্যালেঞ্জ করেনি -> AI-এর সিদ্ধান্তই ফাইনাল
            m.winner = m.tentativeWinner;
            m.status = Status.FINALIZED;
            emit Finalized(marketId, m.winner);
        } 
        else if (m.status == Status.DISPUTED && block.timestamp > m.aiResolutionTime + DISPUTE_WINDOW + (24 * 60 * 60)) {
            // ডিসপিউট উইন্ডো এবং ভোটের সময় (আরও ২৪ ঘণ্টা) পার হয়েছে
            m.winner = m.hawkVotes > m.doveVotes ? Side.HAWK : Side.DOVE;
            m.status = Status.FINALIZED;

            // ডিসপিউট ফি সেটেলমেন্ট লজিক
            if (m.winner != m.tentativeWinner) {
                // চ্যালেঞ্জার রাইট ছিল! ৫০ USDC ফেরত
                payable(m.disputer).transfer(DISPUTE_FEE);
            } else {
                // চ্যালেঞ্জার রং ছিল! ৫০ USDC-র ৩০% প্রফিট সরাসরি ট্রেজারিতে চলে যাবে
                uint256 treasuryShare = (DISPUTE_FEE * TREASURY_DISPUTE_SHARE_BPS) / 10000;
                payable(treasury).transfer(treasuryShare);
                // বাকি ৭০% লজিং পুলে অ্যাড হয়ে উইনারদের বোনাস হিসেবে থেকে যাবে
            }
            emit Finalized(marketId, m.winner);
        }
    }

    // ---- User functions ----

    // ৪. স্টেক করার সময় Anti-MEV টাইম-লক গেট বসানো হয়েছে
    function stake(string calldata marketId, Side side) external payable {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.OPEN, "Market closed");
        require(block.timestamp <= m.stakingEndTime, "Staking period has ended"); // MEV Lock
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

    // ৫. ৫০ USDC দিয়ে AI এর রায়কে চ্যালেঞ্জ করার ফাংশন
    function disputeMarket(string calldata marketId) external payable {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.AI_RESOLVED, "Not in dispute phase");
        require(block.timestamp <= m.aiResolutionTime + DISPUTE_WINDOW, "Dispute window closed");
        require(msg.value == DISPUTE_FEE, "Must send exactly 50 USDC");
        require(m.hawkTotal + m.doveTotal >= MIN_VOLUME_FOR_DISPUTE, "Volume too low for disputes");

        m.disputer = msg.sender;
        m.status = Status.DISPUTED;

        emit Disputed(marketId, msg.sender);
    }

    // ৬. ডিসপিউট করা মার্কেটে কমিউনিটি ভোটিং
    function voteOnDispute(string calldata marketId, Side side) external payable {
        Market storage m = markets[marketId];
        require(m.status == Status.DISPUTED, "Market is not disputed");
        require(block.timestamp <= m.aiResolutionTime + DISPUTE_WINDOW + (24 * 60 * 60), "Voting has ended");
        require(msg.value >= MIN_VOTE_AMOUNT, "Vote amount below minimum");
        require(side == Side.HAWK || side == Side.DOVE, "Invalid side");

        if (side == Side.HAWK) {
            m.hawkVotes += msg.value;
        } else {
            m.doveVotes += msg.value;
        }
        userVotes[marketId][msg.sender] += msg.value;

        emit DAOExceptionVoted(marketId, msg.sender, side, msg.value);
    }

    // ৭. ক্লেম করার সময় ১.৫% রেভিনিউ ফি কালেক্ট করার লজিক
    function claim(string calldata marketId) external {
        Market storage m = markets[marketId];
        require(m.exists, "Market does not exist");
        require(m.status == Status.FINALIZED, "Market not finalized yet");
        require(!claimed[marketId][msg.sender], "Already claimed");

        Side winSide = m.winner;
        uint256 userWinningStake = stakes[marketId][msg.sender][winSide];
        
        // যদি ইউজার ডিসপিউটের সময় ভোটে অংশ নিয়ে জিতে থাকে, তবে তার ভোটের টাকাও উইনিং পুলে যোগ হবে
        uint256 userVoteStake = userVotes[marketId][msg.sender];
        
        // টোটাল উইনিং এলিমেন্ট সামআপ করা
        uint256 totalUserStaked = userWinningStake;
        if ((winSide == Side.HAWK && m.hawkVotes > m.doveVotes) || (winSide == Side.DOVE && m.doveVotes > m.hawkVotes)) {
            totalUserStaked += userVoteStake;
        }
        
        require(totalUserStaked > 0, "Nothing to claim");

        uint256 winningPoolTotal = winSide == Side.HAWK ? m.hawkTotal : m.doveTotal;
        uint256 losingPoolTotal = winSide == Side.HAWK ? m.doveTotal : m.hawkTotal;

        // Payout ক্যালকুলেশন
        uint256 payout = totalUserStaked;
        if (winningPoolTotal > 0 && losingPoolTotal > 0) {
            payout += (totalUserStaked * losingPoolTotal) / winningPoolTotal;
        }

        claimed[marketId][msg.sender] = true;

        // মেইননেট রেভিনিউ অপ্টিমাইজেশন: ১.৫% প্ল্যাটফর্ম ফি কাটা
        uint256 platformFee = (payout * PROTOCOL_FEE_BPS) / 10000;
        uint256 userNetPayout = payout - platformFee;

        // ১. প্ল্যাটফর্ম ফি আপনার ট্রেজারিতে ট্র্যান্সফার
        (bool feeSent, ) = treasury.call{value: platformFee}("");
        require(feeSent, "Protocol fee transfer failed");

        // ২. ইউজারকে তার পাওনা দেওয়া
        (bool sent, ) = msg.sender.call{value: userNetPayout}("");
        require(sent, "Payout transfer failed");

        emit Claimed(marketId, msg.sender, userNetPayout);
    }
}
