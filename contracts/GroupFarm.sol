// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GroupFarm - one LP staking contract for three fixed Uniswap v2 pairs, rewards in GROUP3.
/// @notice Each pool gets rewardPerPool spread linearly over `duration` seconds after startSession().
///         Reward is shared by LP stake size and time (per-pool accumulator, no loops over users).
///         Time while a pool is empty is burned: that budget stays unallocated, it is never given to
///         the next staker. The owner can only start the session once; there is no rescue/sweep function,
///         so the owner can never take staked LP or the reward fund.
contract GroupFarm is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant POOL_COUNT = 3;
    uint256 private constant ACC_PRECISION = 1e18;

    struct Pool {
        IERC20 lpToken;            // fixed in the constructor, never changed
        uint256 totalStaked;       // LP principal held for this pool
        uint256 accRewardPerShare; // GROUP3 per 1 LP (scaled by 1e18) since start
        uint256 lastUpdate;        // last timestamp up to which rewards were accounted
        uint256 allocated;         // GROUP3 of this pool's budget already assigned to stakers
    }

    struct User {
        uint256 amount;     // staked LP
        uint256 rewardDebt; // amount * accRewardPerShare at last settlement
        uint256 rewards;    // settled, not yet claimed GROUP3
    }

    IERC20 public immutable rewardToken;
    uint256 public immutable duration;
    uint256 public immutable rewardPerPool;

    uint256 public startTime; // 0 before start
    uint256 public endTime;   // 0 before start
    uint256 public totalFund; // 3 * rewardPerPool, recorded at start
    uint256 public totalPaid; // GROUP3 paid out by claims

    Pool[POOL_COUNT] public pools;
    mapping(uint256 => mapping(address => User)) private users;

    event SessionStarted(uint256 start, uint256 end);
    event Staked(address indexed user, uint256 indexed poolId, uint256 amount);
    event Withdrawn(address indexed user, uint256 indexed poolId, uint256 amount);
    event Claimed(address indexed user, uint256 indexed poolId, uint256 amount);

    constructor(address rewardToken_, address[3] memory lpTokens, uint256 duration_, uint256 rewardPerPool_)
        Ownable(msg.sender)
    {
        require(rewardToken_ != address(0), "reward token is zero");
        require(duration_ > 0 && rewardPerPool_ > 0, "bad config");
        for (uint256 i = 0; i < POOL_COUNT; i++) {
            require(lpTokens[i] != address(0), "LP is zero");
            // Keeps reward fund and staked principal in different tokens, so they never mix.
            require(lpTokens[i] != rewardToken_, "LP equals reward token");
            for (uint256 j = 0; j < i; j++) require(lpTokens[i] != lpTokens[j], "duplicate LP");
            pools[i].lpToken = IERC20(lpTokens[i]);
        }
        rewardToken = IERC20(rewardToken_);
        duration = duration_;
        rewardPerPool = rewardPerPool_;
    }

    modifier validPool(uint256 poolId) {
        require(poolId < POOL_COUNT, "unknown pool");
        _;
    }

    // ---------------------------------------------------------------- owner

    /// @notice Starts the campaign. Only once, and only when the full fund is already in the contract.
    function startSession() external onlyOwner {
        require(startTime == 0, "already started");
        uint256 fund = rewardPerPool * POOL_COUNT;
        require(rewardToken.balanceOf(address(this)) >= fund, "fund not deposited");
        startTime = block.timestamp;
        endTime = block.timestamp + duration;
        totalFund = fund;
        for (uint256 i = 0; i < POOL_COUNT; i++) pools[i].lastUpdate = block.timestamp;
        emit SessionStarted(startTime, endTime);
    }

    // ---------------------------------------------------------------- users

    function stake(uint256 poolId, uint256 amount) external nonReentrant validPool(poolId) {
        require(amount > 0, "amount is zero");
        Pool storage p = pools[poolId];
        User storage u = users[poolId][msg.sender];
        _settle(p, u);
        p.lpToken.safeTransferFrom(msg.sender, address(this), amount);
        u.amount += amount;
        p.totalStaked += amount;
        u.rewardDebt = u.amount * p.accRewardPerShare / ACC_PRECISION;
        emit Staked(msg.sender, poolId, amount);
    }

    /// @notice Returns LP at any time: before start, during and after the campaign.
    function withdraw(uint256 poolId, uint256 amount) external nonReentrant validPool(poolId) {
        Pool storage p = pools[poolId];
        User storage u = users[poolId][msg.sender];
        require(amount > 0, "amount is zero");
        require(amount <= u.amount, "more than staked");
        _settle(p, u);
        u.amount -= amount;
        p.totalStaked -= amount;
        u.rewardDebt = u.amount * p.accRewardPerShare / ACC_PRECISION;
        p.lpToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, poolId, amount);
    }

    function claim(uint256 poolId) external nonReentrant validPool(poolId) {
        _claim(poolId);
    }

    function claimAll() external nonReentrant {
        for (uint256 i = 0; i < POOL_COUNT; i++) _claim(i);
    }

    // ---------------------------------------------------------------- views

    function earned(address account, uint256 poolId) public view validPool(poolId) returns (uint256) {
        Pool storage p = pools[poolId];
        User storage u = users[poolId][account];
        (uint256 acc,,) = _accrue(p);
        return u.rewards + u.amount * acc / ACC_PRECISION - u.rewardDebt;
    }

    function totalEarned(address account) external view returns (uint256 sum) {
        for (uint256 i = 0; i < POOL_COUNT; i++) sum += earned(account, i);
    }

    function stakeOf(uint256 poolId, address account) external view validPool(poolId) returns (uint256) {
        return users[poolId][account].amount;
    }

    // ---------------------------------------------------------------- internal

    /// @dev Pool state brought up to now, without writing: (accRewardPerShare, newly allocated reward, timestamp).
    function _accrue(Pool storage p) private view returns (uint256 acc, uint256 reward, uint256 t) {
        acc = p.accRewardPerShare;
        t = p.lastUpdate;
        if (startTime == 0) return (acc, 0, t); // nothing accrues before start
        uint256 nowCapped = block.timestamp < endTime ? block.timestamp : endTime; // nothing after end
        if (nowCapped <= t) return (acc, 0, t);
        if (p.totalStaked > 0) {
            reward = rewardPerPool * (nowCapped - t) / duration;
            acc += reward * ACC_PRECISION / p.totalStaked;
        }
        // empty pool: reward stays 0 and lastUpdate still moves, so that time's budget is burned
        t = nowCapped;
    }

    function _update(Pool storage p) private {
        (uint256 acc, uint256 reward, uint256 t) = _accrue(p);
        p.accRewardPerShare = acc;
        p.allocated += reward;
        p.lastUpdate = t;
    }

    /// @dev Books everything earned so far into u.rewards before the stake changes.
    function _settle(Pool storage p, User storage u) private {
        _update(p);
        uint256 accumulated = u.amount * p.accRewardPerShare / ACC_PRECISION;
        u.rewards += accumulated - u.rewardDebt;
        u.rewardDebt = accumulated;
    }

    function _claim(uint256 poolId) private {
        Pool storage p = pools[poolId];
        User storage u = users[poolId][msg.sender];
        _settle(p, u);
        uint256 amount = u.rewards;
        // rewardDebt is floored at every stake change, so a pool's total payout can exceed `allocated`
        // by a few wei. Pay at most what the farm holds and keep the rest pending, so a claim never reverts.
        uint256 bal = rewardToken.balanceOf(address(this));
        if (amount > bal) amount = bal;
        if (amount == 0) return; // nothing new: a repeated claim pays nothing
        u.rewards -= amount;
        totalPaid += amount;
        rewardToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, poolId, amount);
    }
}
