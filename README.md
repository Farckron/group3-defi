# Group 3 DeFi: GROUP3 token, Uniswap v2 pools and GroupFarm

Group practical work "LP staking and GROUP token" ([task](https://erins.lv/bis30102026.html)), Group 3. Everything runs on Ethereum Sepolia (chainId 11155111) with test tokens only.

The system has a shared reward token GROUP3, three Uniswap v2 pools (one per personal token, each paired with GROUP3), one GroupFarm contract that accepts the LP tokens of exactly those three pools and pays GROUP3 rewards, and one HTML/JavaScript web app.

Web app: {{PAGES_URL}}

Repository: https://github.com/Farckron/group3-defi

## Architecture

```
 STCR + GROUP3        CAFE + GROUP3        LIBP + GROUP3
       |                    |                    |
       v                    v                    v
 Uniswap v2 pair 0    Uniswap v2 pair 1    Uniswap v2 pair 2
 (STCR/GROUP3 LP)     (CAFE/GROUP3 LP)     (LIBP/GROUP3 LP)
       |                    |                    |
       +--------------------+--------------------+
                            |
                            v
              GroupFarm (poolId 0, 1, 2)
              stake / withdraw LP tokens
                            |
                            v
          GROUP3 rewards from a pre-funded 120,000 fund
                            ^
                            |
            index.html + app.js (MetaMask, Sepolia check)
```

In Uniswap v2 the pair contract is also the LP token, so the pair address and the LP token address are the same address. GroupFarm stores these three addresses as `lpTokens[0..2]`.

## Roles

The task is written for three students. I (Serhii Voitov, 251ADC006) did this work alone, so all three roles were done by one person:

| Role in the task | What it covers | Done by |
|---|---|---|
| Member 1 | GROUP3 token, initial distribution, address bookkeeping | Serhii Voitov |
| Member 2 | GroupFarm contract and reward calculation | Serhii Voitov |
| Member 3 | HTML/JavaScript app and wallet integration | Serhii Voitov |
| Every member | Own personal token pool, stake/withdraw testing | Serhii Voitov (all three pools) |

Because there are no teammates, the "second staker" in the tests is a second wallet that I control (wallet B), not another student.

Wallets used:

| Wallet | Address | Use |
|---|---|---|
| A (deployer) | [0x2E5fb463721ff810cF0CEAc0aD9d0B3b2e020515](https://sepolia.etherscan.io/address/0x2E5fb463721ff810cF0CEAc0aD9d0B3b2e020515) | Deploys all contracts, adds liquidity, funds and starts the farm, first staker |
| B | [0x7acf8A4f96417c8714E8564A45E34c0DA224EF16](https://sepolia.etherscan.io/address/0x7acf8A4f96417c8714E8564A45E34c0DA224EF16) | Holds the GROUP3 reserve, second staker in tests |

## Personal tokens

All three are plain OpenZeppelin `ERC20` 5.6.1 contracts compiled with solc 0.8.30. The whole supply is minted once to wallet A in the constructor. There is no owner, no mint, no burn hook, no pause, no blacklist, no transfer fee and no rebasing, so balances only change through normal `transfer` and `transferFrom`.

| Name | Symbol | Address | Decimals | Supply (fixed) | Admin rights | Deploy tx |
|---|---|---|---|---|---|---|
| Study Credit | STCR | [0xF482674A7250dcF818cE8936946B5Bad30F0AFDD](https://sepolia.etherscan.io/address/0xF482674A7250dcF818cE8936946B5Bad30F0AFDD) | 18 | 10,000 | None | [tx](https://sepolia.etherscan.io/tx/0xcd44abec2cab24fa14e73a16dfb2f8d450ce74ec2e94099460cbc4f3d3038277) |
| Coffee Token | CAFE | [0x65BE388dC442AB1A6E64712dE1cE6Bb50c8dC323](https://sepolia.etherscan.io/address/0x65BE388dC442AB1A6E64712dE1cE6Bb50c8dC323) | 18 | 100,000 | None | [tx](https://sepolia.etherscan.io/tx/0xedefb991129bd62a02f1531b17978bc3fe65d494978bf2e546d6fa859891147c) |
| Library Point | LIBP | [{{LIBP_ADDR}}](https://sepolia.etherscan.io/address/{{LIBP_ADDR}}) | 18 | 1,000,000 | None | [tx](https://sepolia.etherscan.io/tx/{{TX_DEPLOY_LIBP}}) |

STCR and CAFE come from the previous assignment ("Create & Transfer Your Tokens"). LIBP is new for this work, so that there are three personal tokens for three pools. It uses the same code pattern; only the name, symbol and supply differ.

## GROUP3 token

| | |
|---|---|
| Contract | `contracts/GroupToken.sol` |
| Address | [{{GROUP3_ADDR}}](https://sepolia.etherscan.io/address/{{GROUP3_ADDR}}) |
| Deploy tx | [tx](https://sepolia.etherscan.io/tx/{{TX_DEPLOY_GROUP3}}) |
| Name | Group 3 Token |
| Symbol | GROUP3 |
| Decimals | 18 |
| Supply | 100,000,000, minted once to wallet A in the constructor |
| Extra minting | Not possible: there is no mint function |
| Transfer fees | None |
| Owner / admin | None |

### Distribution

| Use | GROUP3 | Where it went | Tx |
|---|---|---|---|
| STCR/GROUP3 initial liquidity | 100,000 | Pair 0 | [tx](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_0}}) |
| CAFE/GROUP3 initial liquidity | 100,000 | Pair 1 | [tx](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_1}}) |
| LIBP/GROUP3 initial liquidity | 100,000 | Pair 2 | [tx](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_2}}) |
| Staking reward fund | 120,000 | GroupFarm | [tx](https://sepolia.etherscan.io/tx/{{TX_FUND_FARM}}) |
| Reserve | 99,580,000 | Wallet B [0x7acf8A4f96417c8714E8564A45E34c0DA224EF16](https://sepolia.etherscan.io/address/0x7acf8A4f96417c8714E8564A45E34c0DA224EF16) | [tx](https://sepolia.etherscan.io/tx/{{TX_RESERVE}}) |
| Total | 100,000,000 | | |

The reserve address is wallet B. The 99,580,000 reserve is not moved during the campaign. Wallet B also acts as the second staker in the tests, so it receives some GROUP3 as farm rewards; those are separate small amounts on top of the reserve and can be seen in the test transactions below.

## Uniswap v2 pools

Uniswap v2 contracts on Sepolia (checked on chain before use):

| Contract | Address |
|---|---|
| Router02 | [0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3](https://sepolia.etherscan.io/address/0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3) |
| Factory | [0xF62c03E08ada871A0bEb309762E260a7a6a880E6](https://sepolia.etherscan.io/address/0xF62c03E08ada871A0bEb309762E260a7a6a880E6) |
| WETH | [0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14](https://sepolia.etherscan.io/address/0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14) |

Each pair was created and funded with one `Router02.addLiquidity` call from wallet A. Uniswap sorts the two tokens of a pair by address, so token0 and token1 are listed as the factory stored them.

| poolId | Pair | Pair / LP address | token0 | token1 | Initial liquidity | Start price | LP received by A | addLiquidity tx |
|---|---|---|---|---|---|---|---|---|
| 0 | STCR/GROUP3 | [{{PAIR0}}](https://sepolia.etherscan.io/address/{{PAIR0}}) | {{PAIR0_TOKEN0}} | {{PAIR0_TOKEN1}} | 5,000 STCR + 100,000 GROUP3 | 1 STCR = 20 GROUP3 (1 GROUP3 = 0.05 STCR) | {{LP0_RECEIVED}} | [tx](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_0}}) |
| 1 | CAFE/GROUP3 | [{{PAIR1}}](https://sepolia.etherscan.io/address/{{PAIR1}}) | {{PAIR1_TOKEN0}} | {{PAIR1_TOKEN1}} | 50,000 CAFE + 100,000 GROUP3 | 1 CAFE = 2 GROUP3 (1 GROUP3 = 0.5 CAFE) | {{LP1_RECEIVED}} | [tx](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_1}}) |
| 2 | LIBP/GROUP3 | [{{PAIR2}}](https://sepolia.etherscan.io/address/{{PAIR2}}) | {{PAIR2_TOKEN0}} | {{PAIR2_TOKEN1}} | 100,000 LIBP + 100,000 GROUP3 | 1 LIBP = 1 GROUP3 | {{LP2_RECEIVED}} | [tx](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_2}}) |

Reserves right after funding: {{POOL_RESERVES}}

### Why these start prices

Every pool gets the required 100,000 GROUP3. The start price is simply the ratio of the two amounts put in, so I chose the personal token amounts to match how scarce each token is:

- STCR has the smallest supply (10,000) and is meant for rare achievements. Putting in 5,000 STCR against 100,000 GROUP3 makes 1 STCR = 20 GROUP3.
- CAFE has a ten times larger supply (100,000) and is an everyday reward. 50,000 CAFE against 100,000 GROUP3 gives 1 CAFE = 2 GROUP3.
- LIBP has the largest supply (1,000,000). 100,000 LIBP against 100,000 GROUP3 gives a simple 1:1 price.

The first liquidity provider receives `sqrt(amount0 * amount1) - 1000 wei` LP tokens. The expected values are about 22,360.68 LP for pair 0, 70,710.68 LP for pair 1 and 100,000 LP for pair 2, each minus 1000 wei.

## GroupFarm

| | |
|---|---|
| Contract | `contracts/GroupFarm.sol` |
| Address | [{{FARM_ADDR}}](https://sepolia.etherscan.io/address/{{FARM_ADDR}}) |
| Deploy tx | [tx](https://sepolia.etherscan.io/tx/{{TX_DEPLOY_FARM}}) |
| Funding tx (120,000 GROUP3) | [tx](https://sepolia.etherscan.io/tx/{{TX_FUND_FARM}}) |
| `startSession` tx | [tx](https://sepolia.etherscan.io/tx/{{TX_START_SESSION}}) |
| Campaign start / end | {{CAMPAIGN_START}} / {{CAMPAIGN_END}} |
| Reward token | GROUP3 |
| LP tokens | poolId 0 = pair 0 (STCR/GROUP3), 1 = pair 1 (CAFE/GROUP3), 2 = pair 2 (LIBP/GROUP3) |
| Duration | 7,200 s (120 minutes) |
| Budget per pool | 40,000 GROUP3 (`rewardPerPool` = 40,000e18) |
| Total fund | 120,000 GROUP3 |
| Rate | 40,000 / 7,200 s = 1,000 GROUP3 per pool per 3 minutes |
| Owner | Wallet A (OpenZeppelin `Ownable`); the only farm-specific owner function is `startSession` (plus the standard `transferOwnership` / `renounceOwnership` from `Ownable`) |

Constructor: `GroupFarm(address rewardToken, address[3] lpTokens, uint256 duration, uint256 rewardPerPool)`.

### Functions

The task's required names are used unchanged. Extra view functions were added for the web app.

| Task requirement | Function | What it does |
|---|---|---|
| `startSession()` | `startSession()` | Owner only, once. Requires the farm to hold at least `3 * rewardPerPool` GROUP3. Sets `startTime = block.timestamp`, `endTime = startTime + duration`, records `totalFund`. |
| `stake(poolId, amount)` | `stake(uint256 poolId, uint256 amount)` | Settles pending rewards, then pulls `amount` of that pool's LP token from the caller. |
| `withdraw(poolId, amount)` | `withdraw(uint256 poolId, uint256 amount)` | Settles pending rewards, then returns `amount` LP to the caller. Works before start, during and after the campaign. |
| `claim(poolId)` | `claim(uint256 poolId)` | Pays the caller's GROUP3 rewards from one pool. |
| `claimAll()` | `claimAll()` | Pays the caller's rewards from all three pools in one transaction. |
| `earned(account, poolId)` | `earned(address account, uint256 poolId)` | Claimable GROUP3 for one pool, including time since the last update. |
| (web app) | `totalEarned(address)`, `stakeOf(poolId, address)`, `pools(poolId)`, `startTime()`, `endTime()`, `duration()`, `rewardPerPool()`, `totalFund()`, `totalPaid()`, `rewardToken()` | Read-only data for the page. |

Events: `SessionStarted(start, end)`, `Staked(user, poolId, amount)`, `Withdrawn(user, poolId, amount)`, `Claimed(user, poolId, amount)`.

### Reward formula

Each pool has its own accumulator, so the work per transaction does not depend on the number of stakers. On every update of a pool:

```
t = min(block.timestamp, endTime)
if started and t > lastUpdate:
    if totalStaked > 0:
        reward = rewardPerPool * (t - lastUpdate) / duration
        accRewardPerShare += reward * 1e18 / totalStaked
        allocated += reward
    lastUpdate = t
```

A user's pending reward is `stake * accRewardPerShare / 1e18 - rewardDebt`. Before every stake, withdraw or claim, the pending amount is moved into the user's `rewards` balance and `rewardDebt` is reset to the new stake.

Worked example from the task. In one pool, A stakes 100 LP and B stakes 300 LP for a full 3 minute interval (180 s):

```
reward            = 40,000e18 * 180 / 7,200    = 1,000e18   (1,000 GROUP3)
accRewardPerShare += 1,000e18 * 1e18 / 400e18 = 2.5e18
A earned          = 100e18 * 2.5e18 / 1e18     = 250e18     (250 GROUP3)
B earned          = 300e18 * 2.5e18 / 1e18     = 750e18     (750 GROUP3)
```

LP amounts from different pools are never compared. Each pool splits its own 1,000 GROUP3 per 3 minutes among its own stakers.

### The 9 mandatory rules

| # | Rule | How the code satisfies it |
|---|---|---|
| 1 | The campaign can be started once and only after full funding | `startSession` reverts if `startTime != 0` or if `rewardToken.balanceOf(farm) < 3 * rewardPerPool`. |
| 2 | Accepted LP addresses are fixed; arbitrary tokens cannot be staked | The three LP addresses are set once in the constructor and no function can change them; `stake` reverts for `poolId >= 3` and only ever calls `transferFrom` on `pools[poolId].lpToken`. |
| 3 | No rewards before start or after end | Before start `startTime` is 0 and the update does nothing; after end `t = min(now, endTime)` stops at `endTime`, so no time past the end is counted. |
| 4 | Empty pool budget is not given to the next entrant | When `totalStaked == 0` no reward is added, but `lastUpdate` still moves to `t`, so the empty time is skipped instead of being paid to whoever stakes next. |
| 5 | Stake and withdraw first book what was earned | Both call the pool update and settle the user's pending reward into `rewards` before changing the stake. |
| 6 | A reward cannot be received twice | `claim` sets the user's `rewards` to 0 before transferring, and `rewardDebt` already covers everything settled; `nonReentrant` blocks re-entry. |
| 7 | The owner cannot take participants' LP or the earned reward coverage | There is no rescue, sweep or emergency withdraw function. The owner's only power is `startSession`; LP and GROUP3 leave the farm only through `withdraw` and `claim` to the user who owns them. |
| 8 | No loop over all participants | Per-pool `accRewardPerShare` plus per-user `rewardDebt`; the only loop is over the 3 pools in `claimAll`. |
| 9 | Reward fund and staked principal are tracked separately | Rewards are GROUP3 tracked by `totalFund`, `allocated` and `totalPaid`; principal is LP tokens tracked by `pools[i].totalStaked` and `stakeOf`. They are different tokens and never mixed. |

Unstaking returns LP tokens only. To get STCR/CAFE/LIBP and GROUP3 back, the LP holder must then remove liquidity separately through Router02 `removeLiquidity`.

`SafeERC20` is used for all token transfers and `ReentrancyGuard` protects `stake`, `withdraw`, `claim` and `claimAll`.

## Web app

URL: {{PAGES_URL}}

Plain HTML and JavaScript (`index.html`, `app.js`), no build step, ethers v6 loaded from a CDN, served by GitHub Pages from the repository root.

Shared panel:

- Connect wallet (MetaMask), connected address and network; a "Switch to Sepolia" button on any other chain, with actions blocked until switched.
- GROUP3 balance of the connected wallet.
- Campaign status (not started, active, ended), start time, end time and a live countdown.
- Total claimable GROUP3 across all pools and a "Claim all" button.

One card per pool:

- Pair name and LP token address (Etherscan link).
- LP balance in the wallet, the user's stake and the pool's total stake.
- Earned GROUP3 for that pool.
- Amount input with Approve, Stake, Withdraw and Claim buttons.
- Liquidity management links: add liquidity on Uniswap v2, Uniswap positions (remove liquidity), and Router02 `removeLiquidity` on Etherscan as a fallback, since the Uniswap UI does not fully support v2 on Sepolia.

Every transaction shows its state: waiting for wallet confirmation, sent (with Etherscan link), confirmed, or failed/cancelled. A sent transaction is reported as successful only after its receipt has status 1.

## Tests

### Hardhat test suite

`npx hardhat test` on a local Hardhat network with mock ERC-20 LP tokens and time travel. Both the short config (360 s, 2,000 GROUP3 per pool) and the final config (7,200 s, 40,000 GROUP3 per pool) give the same rate of 1,000 GROUP3 per pool per 3 minutes, so the short campaign is a faithful rehearsal of the real one.

| Task section 9 row | Expected result | What the test checks |
|---|---|---|
| One staker | Gets the whole reward for their active time | A alone stakes for 180 s and `earned` is 1,000 GROUP3 (within rounding) |
| Second joins later | No reward for time before joining | B stakes halfway; B's reward covers only the time after B's stake, A keeps the full first part |
| Several pools | Each pool is accounted independently | Staking in pool 0 does not change rewards in pools 1 and 2; each pool pays its own budget |
| Partial withdrawal | Later reward matches the smaller stake | After withdrawing part of the stake, the user's share of new rewards drops in proportion |
| Repeated claim | Paid rewards cannot be claimed again | A second `claim` right after the first pays 0 and the balance does not change |
| Empty pool | Empty time is not paid to the next staker | A pool stays empty for a while; the first staker afterwards earns only from their own stake time |
| End of campaign | No new rewards, claim and withdraw still work | After `endTime`, `earned` stops growing; `claim` and full `withdraw` succeed |
| Wrong token | Cannot be staked as a registered LP | `stake` with `poolId` 3 reverts; an unregistered token cannot enter the farm |
| Fund check | Paid plus still owed never exceeds the budget | At the end, `totalPaid` plus all `earned` is at most `totalFund` (120,000 GROUP3) |
| Start rules (rule 1) | Start once, only when funded | `startSession` reverts when underfunded, by a non-owner, and on a second call |
| Rounding and decimals | No over-payment from truncation; claims never revert on rounding | Odd stake sizes and short intervals leave at most a few wei unpaid, never more than the budget. A replayed worst-case sequence of 41 tiny stake/withdraw ops (pool payout +7 wei over `rewardPerPool`) still lets every user claim; the last claimer keeps the few missing wei as pending |

Result: {{TEST_RESULTS}}

### On-chain tests (Sepolia)

| Test | Wallet | Result | Tx |
|---|---|---|---|
| Approve LP and stake in pool 0 | A | {{RESULT_STAKE_A}} | [tx](https://sepolia.etherscan.io/tx/{{TX_STAKE_A}}) |
| Second staker joins later | B | {{RESULT_STAKE_B}} | [tx](https://sepolia.etherscan.io/tx/{{TX_STAKE_B}}) |
| Stake in several pools | A | {{RESULT_MULTI_POOL}} | [tx](https://sepolia.etherscan.io/tx/{{TX_MULTI_POOL}}) |
| Partial withdraw | A | {{RESULT_PARTIAL_WITHDRAW}} | [tx](https://sepolia.etherscan.io/tx/{{TX_PARTIAL_WITHDRAW}}) |
| Claim one pool | A | {{RESULT_CLAIM}} | [tx](https://sepolia.etherscan.io/tx/{{TX_CLAIM}}) |
| Repeated claim pays nothing new | A | {{RESULT_REPEAT_CLAIM}} | [tx](https://sepolia.etherscan.io/tx/{{TX_REPEAT_CLAIM}}) |
| Claim all | B | {{RESULT_CLAIM_ALL}} | [tx](https://sepolia.etherscan.io/tx/{{TX_CLAIM_ALL}}) |
| Withdraw after the campaign | A, B | {{RESULT_WITHDRAW_END}} | [tx](https://sepolia.etherscan.io/tx/{{TX_WITHDRAW_END}}) |
| Fund check at the end | read only | {{RESULT_FUND_CHECK}} | |

{{ONCHAIN_TEST_NOTES}}

## Compiler and library versions

| Tool | Version |
|---|---|
| Solidity compiler | solc 0.8.30, optimizer on (200 runs), EVM version cancun |
| OpenZeppelin Contracts | 5.6.1 (`ERC20`, `Ownable`, `SafeERC20`, `ReentrancyGuard`) |
| Hardhat | 2.x with `@nomicfoundation/hardhat-toolbox` 5 |
| ethers | v6 (scripts, tests and web app) |
| Uniswap | v2 Router02 and Factory already deployed on Sepolia |

## Transaction IDs

| Step | Tx |
|---|---|
| Deploy LIBP | [{{TX_DEPLOY_LIBP}}](https://sepolia.etherscan.io/tx/{{TX_DEPLOY_LIBP}}) |
| Deploy GROUP3 | [{{TX_DEPLOY_GROUP3}}](https://sepolia.etherscan.io/tx/{{TX_DEPLOY_GROUP3}}) |
| Add liquidity STCR/GROUP3 | [{{TX_ADDLIQ_0}}](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_0}}) |
| Add liquidity CAFE/GROUP3 | [{{TX_ADDLIQ_1}}](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_1}}) |
| Add liquidity LIBP/GROUP3 | [{{TX_ADDLIQ_2}}](https://sepolia.etherscan.io/tx/{{TX_ADDLIQ_2}}) |
| Deploy GroupFarm | [{{TX_DEPLOY_FARM}}](https://sepolia.etherscan.io/tx/{{TX_DEPLOY_FARM}}) |
| Fund GroupFarm with 120,000 GROUP3 | [{{TX_FUND_FARM}}](https://sepolia.etherscan.io/tx/{{TX_FUND_FARM}}) |
| Reserve 99,580,000 GROUP3 to wallet B | [{{TX_RESERVE}}](https://sepolia.etherscan.io/tx/{{TX_RESERVE}}) |
| `startSession` | [{{TX_START_SESSION}}](https://sepolia.etherscan.io/tx/{{TX_START_SESSION}}) |

Test transactions are listed in the on-chain test table above.

## Work split, problems and solutions

All work was done by one student (see Roles). Contracts, deployment scripts, tests and the web app were written and run from one Hardhat project in this repository. Private keys stay in a local file outside the repository and are never committed.

| Problem | Solution |
|---|---|
| The Uniswap web interface does not offer v2 pool creation on Sepolia | Pairs were created and funded with a script calling Router02 `addLiquidity` directly, after checking the Router, Factory and WETH addresses on chain. The task allows a compatible router interface or own script. |
| Uniswap v2 burns `MINIMUM_LIQUIDITY` (1000 wei of LP) on the first deposit | The first provider gets `sqrt(amount0 * amount1) - 1000 wei` LP. This is a negligible amount and does not change the price. |
| Integer division truncates `rewardPerPool * dt / duration` and `reward * 1e18 / totalStaked` | Truncation rounds down, so normally a few wei of dust stay in the farm. One exception: `rewardDebt` is also floored at every stake change, so after many tiny stake/withdraw operations a pool can owe a few wei more than `rewardPerPool`. `claim` therefore pays at most the farm's GROUP3 balance and keeps the rest as pending, so no claim ever reverts and the farm never pays more than it holds. |
| Budget of time when a pool is empty is not paid to anyone | By design (rule 4). That GROUP3 stays in the farm; because there is no sweep function, it cannot be taken out by anyone, including the owner. |
| Only one person, but tests need two stakers | Wallet B, which I also control, acts as the second participant. |
| Task names the token GROUP1 | Renamed to GROUP3 for Group 3, as the task allows. |

## Explanations required by the task

### Where the rewards come from

The rewards are not yield and not trading fees. The farm pays out a fixed 120,000 GROUP3 that was transferred to it from the GROUP3 supply before `startSession`. The contract checks this balance before the campaign can start and then spreads it over 120 minutes: 40,000 per pool, 1,000 per pool every 3 minutes. When the fund is used up the rewards stop. Nobody earns anything that was not deposited in advance.

### Effect of additional stakers

The amount paid per pool per unit of time is fixed, so more stakers do not create more rewards. They split the same 1,000 GROUP3 per 3 minutes by their share of the pool.

Example: A has 100 LP and B has 300 LP in one pool, so A earns 250 and B 750 per 3 minutes. Then C stakes 400 LP. The pool now has 800 LP and the same 1,000 GROUP3 is split 125 (A), 375 (B) and 500 (C). A's stake did not change, but A's income halved. An empty or small pool pays a lot per LP; a crowded pool pays little. The reward rate per LP shown by any farm is therefore only a snapshot.

### Token owner rights and their risks

In many real tokens the owner or admin can mint new tokens (diluting everyone), pause transfers, blacklist addresses, change a transfer fee (a "fee switch"), upgrade the contract to new code, or withdraw funds from a farm. Any of these lets one key change balances or block users, and the most common rug pull is exactly an admin mint or an admin withdraw.

In this project:

- STCR, CAFE, LIBP and GROUP3 have no owner and no admin functions. Supply is fixed at deploy; nobody can mint, pause, blacklist or add fees.
- GroupFarm has an owner (wallet A), but the owner can only call `startSession` once. The owner cannot change the reward rate, the LP list or the duration, and cannot withdraw staked LP or the reward fund.
- The remaining trust points are concentration: wallet B holds the 99,580,000 GROUP3 reserve (99.58% of supply), and wallet A holds all LP tokens of the three pools, so it could remove their liquidity. Whoever holds a large share of a token can sell it into a pool and move the price. Here the reserve is documented and not used.

### Why a high nominal price does not mean a good project

The start prices (1 STCR = 20 GROUP3, 1 CAFE = 2 GROUP3, 1 LIBP = 1 GROUP3) are just the ratios I chose when adding liquidity. I could have made STCR worth 1,000 GROUP3 by putting in fewer STCR. The total supply is also an arbitrary number in the constructor. The pools are small and only I provided liquidity, so even a modest trade moves the price a lot, and none of these tokens can be exchanged for real money. A price, or a price multiplied by supply, says nothing about whether a project is useful, safe or honestly run; the code, the admin rights, the liquidity depth and who holds the supply matter more.

### Test tokens are not real profit

Everything here is on the Sepolia test network. STCR, CAFE, LIBP, GROUP3, the LP tokens and Sepolia ETH have no monetary value. GROUP3 earned from the farm is not a profit in real money and nothing in this project guarantees any return.

## Repository structure

```
contracts/          Solidity sources (personal tokens, GroupToken, GroupFarm)
test/               Hardhat tests for GroupFarm
scripts/            Deploy, liquidity, farm and on-chain test scripts
index.html          Web app page
app.js              Web app logic (wallet, pools, farm actions)
hardhat.config.js   Compiler settings
README.md           This report
```

## Safety notes

- Sepolia testnet only.
- The web app never asks for a private key or seed phrase. All signing happens in MetaMask.
- Deployment keys are kept in a local file outside the repository.

<!--
Placeholders to fill:
{{CAMPAIGN_END}} {{CAMPAIGN_START}} {{FARM_ADDR}} {{GROUP3_ADDR}} {{LIBP_ADDR}} {{LP0_RECEIVED}} {{LP1_RECEIVED}} {{LP2_RECEIVED}} {{ONCHAIN_TEST_NOTES}} {{PAGES_URL}} {{PAIR0_TOKEN0}} {{PAIR0_TOKEN1}} {{PAIR0}} {{PAIR1_TOKEN0}} {{PAIR1_TOKEN1}} {{PAIR1}} {{PAIR2_TOKEN0}} {{PAIR2_TOKEN1}} {{PAIR2}} {{POOL_RESERVES}} {{RESULT_CLAIM_ALL}} {{RESULT_CLAIM}} {{RESULT_FUND_CHECK}} {{RESULT_MULTI_POOL}} {{RESULT_PARTIAL_WITHDRAW}} {{RESULT_REPEAT_CLAIM}} {{RESULT_STAKE_A}} {{RESULT_STAKE_B}} {{RESULT_WITHDRAW_END}} {{TEST_RESULTS}} {{TX_ADDLIQ_0}} {{TX_ADDLIQ_1}} {{TX_ADDLIQ_2}} {{TX_CLAIM_ALL}} {{TX_CLAIM}} {{TX_DEPLOY_FARM}} {{TX_DEPLOY_GROUP3}} {{TX_DEPLOY_LIBP}} {{TX_FUND_FARM}} {{TX_MULTI_POOL}} {{TX_PARTIAL_WITHDRAW}} {{TX_REPEAT_CLAIM}} {{TX_RESERVE}} {{TX_STAKE_A}} {{TX_STAKE_B}} {{TX_START_SESSION}} {{TX_WITHDRAW_END}}
-->
