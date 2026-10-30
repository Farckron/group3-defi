# Group 3 DeFi: GROUP3 token, Uniswap v2 pools and GroupFarm

Group practical work "LP staking and GROUP token" ([task](https://erins.lv/bis30102026.html)), Group 3. Everything runs on Ethereum Sepolia (chainId 11155111) with test tokens only.

The system has a shared reward token GROUP3, three Uniswap v2 pools (each personal token paired with GROUP3), one GroupFarm contract that accepts the LP tokens of exactly those three pools and pays GROUP3 rewards, and one HTML/JavaScript web app.

- Web app: https://farckron.github.io/group3-defi/
- Repository: https://github.com/Farckron/group3-defi

Status on 2026-10-30: GROUP3, pools 0 and 1, and GroupFarm are deployed, funded and running. Pool 2 (SLV072/GROUP3) exists as an empty pair and is waiting for Džoanna's SLV072 (see [Pending](#pending-updated-after-the-campaign)).

## Architecture

```
 STCR + GROUP3        CAFE + GROUP3        SLV072 + GROUP3
       |                    |                    |
       v                    v                    v
 Uniswap v2 pair 0    Uniswap v2 pair 1    Uniswap v2 pair 2
 (STCR/GROUP3 LP)     (CAFE/GROUP3 LP)     (SLV072/GROUP3 LP, empty, pending)
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

In Uniswap v2 the pair contract is also the LP token, so the pair address and the LP token address are the same. GroupFarm stores the three pair addresses as its fixed LP tokens.

## Group and roles

Group 3 has two members, not three. The third pool slot is filled by Serhii's second personal token (CAFE).

| Member | Student ID | Wallet | Personal token in the farm |
|---|---|---|---|
| Serhii Voitov | 251ADC006 | A [0x2E5fb463721ff810cF0CEAc0aD9d0B3b2e020515](https://sepolia.etherscan.io/address/0x2E5fb463721ff810cF0CEAc0aD9d0B3b2e020515) | STCR (pool 0), CAFE (pool 1) |
| Džoanna Šarlote Akselrode | 251RDC072 | [0x99aeA2Da85075D4283A347011883bc299c259d6A](https://sepolia.etherscan.io/address/0x99aeA2Da85075D4283A347011883bc299c259d6A) | SLV072 (pool 2) |

| Role in the task | What it covers | Done by |
|---|---|---|
| Member 1 | GROUP3 token, initial distribution, address bookkeeping | Serhii Voitov |
| Member 2 | GroupFarm contract and reward calculation | Serhii Voitov |
| Member 3 | HTML/JavaScript app and wallet integration | Serhii Voitov |
| Every member: own pool | Personal token pool with 100,000 GROUP3 | Serhii: pools 0 and 1. Džoanna: pool 2, from her SLV072; once her SLV072 arrives, wallet A adds the liquidity and sends all pool 2 LP to her wallet (pending) |
| Every member: testing | Stake, claim, withdraw | Serhii: wallets A and B through the on-chain test script. Džoanna: stake, claim and withdraw with her own wallet through the web app (pending) |

So technically Serhii wrote the code for roles 1 to 3 (contracts, deployment scripts, tests, web app). Džoanna provides the SLV072 token and her pool and tests the farm as a user through the web app.

Wallets used by the scripts:

| Wallet | Address | Owner | Use |
|---|---|---|---|
| A (deployer) | [0x2E5fb463721ff810cF0CEAc0aD9d0B3b2e020515](https://sepolia.etherscan.io/address/0x2E5fb463721ff810cF0CEAc0aD9d0B3b2e020515) | Serhii | Deploys all contracts, adds liquidity, funds and starts the farm, first staker |
| B | [0x7acf8A4f96417c8714E8564A45E34c0DA224EF16](https://sepolia.etherscan.io/address/0x7acf8A4f96417c8714E8564A45E34c0DA224EF16) | Serhii (second wallet) | Holds the GROUP3 reserve; scripted second staker in the on-chain tests |

## Personal tokens

All three are plain OpenZeppelin `ERC20` contracts. The whole supply is minted once to the deployer in the constructor. There is no owner (`owner()` reverts on all three), no mint, no burn hook, no pause, no blacklist, no transfer fee and no rebasing, so balances only change through normal `transfer` and `transferFrom`.

| Name | Symbol | Issued by | Address | Decimals | Supply (fixed) | Admin rights | Deploy tx |
|---|---|---|---|---|---|---|---|
| Study Credit | STCR | Serhii | [0xF482674A7250dcF818cE8936946B5Bad30F0AFDD](https://sepolia.etherscan.io/address/0xF482674A7250dcF818cE8936946B5Bad30F0AFDD) | 18 | 10,000 | None | [tx](https://sepolia.etherscan.io/tx/0xcd44abec2cab24fa14e73a16dfb2f8d450ce74ec2e94099460cbc4f3d3038277) |
| Coffee Token | CAFE | Serhii | [0x65BE388dC442AB1A6E64712dE1cE6Bb50c8dC323](https://sepolia.etherscan.io/address/0x65BE388dC442AB1A6E64712dE1cE6Bb50c8dC323) | 18 | 100,000 | None | [tx](https://sepolia.etherscan.io/tx/0xedefb991129bd62a02f1531b17978bc3fe65d494978bf2e546d6fa859891147c) |
| Silver072 | SLV072 | Džoanna | [0x08945bC23e0022AE2876998EA5fd29F952A3F3E8](https://sepolia.etherscan.io/address/0x08945bC23e0022AE2876998EA5fd29F952A3F3E8) | 18 | 100,000 | None | [tx](https://sepolia.etherscan.io/tx/0xa359e3dd891a883554433c8d085dc30fdc8f6acc933e97426ac232c1a4fb109c) |

- STCR and CAFE come from Serhii's previous assignment ("Create & Transfer Your Tokens"); sources are `contracts/StudyCredit.sol` and `contracts/CoffeeToken.sol` (OpenZeppelin 5.6.1, solc 0.8.30).
- SLV072 is Džoanna's personal token. Its source is verified on [Blockscout](https://eth-sepolia.blockscout.com/address/0x08945bC23e0022AE2876998EA5fd29F952A3F3E8?tab=contract) (solc 0.8.34): a constructor that mints 100,000 SLV072 to her wallet and nothing else. She also has GLD072 ([0x07eEc8499bC9f824fF6570a13867c3B1A5f84bA4](https://sepolia.etherscan.io/address/0x07eEc8499bC9f824fF6570a13867c3B1A5f84bA4), 10,000 supply, same pattern), which is not used in this work.
- Decimals, supply and the missing `owner()` were read on chain with ethers.

## GROUP3 token

| | |
|---|---|
| Contract | `contracts/GroupToken.sol` |
| Address | [0xba07D78eF160Ce017FBDC4Bf3b2835ac3bcc91C6](https://sepolia.etherscan.io/address/0xba07D78eF160Ce017FBDC4Bf3b2835ac3bcc91C6) |
| Deploy tx | [tx](https://sepolia.etherscan.io/tx/0xa46ae05acc1e9001177fa2e2941b865aa5abb8cf88973209caf67c298e6b8791) |
| Name | Group 3 Token |
| Symbol | GROUP3 |
| Decimals | 18 |
| Supply | 100,000,000, minted once to wallet A in the constructor |
| Extra minting | Not possible: there is no mint function |
| Transfer fees | None |
| Owner / admin | None (`owner()` reverts) |

### Distribution

| Use | GROUP3 | Where it went | Tx |
|---|---|---|---|
| Pool 0 STCR/GROUP3 initial liquidity (Serhii) | 100,000 | Pair 0 | [tx](https://sepolia.etherscan.io/tx/0x22901cac53653ac91823cd3e7fb155f0503f267193acc3a7e8cfb507f1df4b2f) |
| Pool 1 CAFE/GROUP3 initial liquidity (Serhii) | 100,000 | Pair 1 | [tx](https://sepolia.etherscan.io/tx/0x4f41b46b12a193203ebb810d0b8067bb8b2596772f0950d21348c0e9a0e02097) |
| Pool 2 SLV072/GROUP3 initial liquidity (Džoanna) | 100,000 | Held in wallet A, earmarked for pair 2 (pending) | not sent yet |
| Staking reward fund | 120,000 | GroupFarm | [tx](https://sepolia.etherscan.io/tx/0x7f4768a34524b2180afab98773f8c528fbd63e9fa1e7d2ccee2a626302ae16fa) |
| Reserve | 99,580,000 | Wallet B [0x7acf8A4f96417c8714E8564A45E34c0DA224EF16](https://sepolia.etherscan.io/address/0x7acf8A4f96417c8714E8564A45E34c0DA224EF16) | [tx](https://sepolia.etherscan.io/tx/0x6ebcb50c013eb491b50e1039be4a8cf96ed402e7dc690e199d6f263827e0bdd5) |
| Total | 100,000,000 | | |

The reserve is not used during the campaign. Wallet B also acts as the second staker in the tests, so it receives some GROUP3 farm rewards on top of the 99,580,000; those are visible in the test transactions below.

Chain cross-check (read at 12:34 Riga, before B's `claimAll`): wallet B held exactly 99,580,000 GROUP3; the farm held 116,233.33 = 120,000 minus 3,766.67 already paid; wallet A held 103,766.67 = the 100,000 earmarked for pool 2 plus the 3,766.67 it had claimed.

## Uniswap v2 pools

Uniswap v2 contracts on Sepolia (checked on chain before use):

| Contract | Address |
|---|---|
| Router02 | [0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3](https://sepolia.etherscan.io/address/0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3) |
| Factory | [0xF62c03E08ada871A0bEb309762E260a7a6a880E6](https://sepolia.etherscan.io/address/0xF62c03E08ada871A0bEb309762E260a7a6a880E6) |
| WETH | [0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14](https://sepolia.etherscan.io/address/0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14) |

Pairs 0 and 1 were created and funded with one `Router02.addLiquidity` call each from wallet A. Uniswap sorts the two tokens of a pair by address, so token0 and token1 are listed as the pair stores them.

| poolId | Pair | Pair / LP address | token0 | token1 | Initial liquidity | Start price | LP received | Tx |
|---|---|---|---|---|---|---|---|---|
| 0 | STCR/GROUP3 | [0x7B9945a8D8ea4507A478F7eC84fFA7a71fF4b8df](https://sepolia.etherscan.io/address/0x7B9945a8D8ea4507A478F7eC84fFA7a71fF4b8df) | GROUP3 | STCR | 5,000 STCR + 100,000 GROUP3 | 1 STCR = 20 GROUP3 (1 GROUP3 = 0.05 STCR) | 22,360.679774997896963091 to A | [addLiquidity](https://sepolia.etherscan.io/tx/0x22901cac53653ac91823cd3e7fb155f0503f267193acc3a7e8cfb507f1df4b2f) |
| 1 | CAFE/GROUP3 | [0x47198D03720cF8a28e87483AfcB7fb7b6258FeF8](https://sepolia.etherscan.io/address/0x47198D03720cF8a28e87483AfcB7fb7b6258FeF8) | CAFE | GROUP3 | 80,000 CAFE + 100,000 GROUP3 | 1 CAFE = 1.25 GROUP3 (1 GROUP3 = 0.8 CAFE) | 89,442.719099991587855366 to A | [addLiquidity](https://sepolia.etherscan.io/tx/0x4f41b46b12a193203ebb810d0b8067bb8b2596772f0950d21348c0e9a0e02097) |
| 2 | SLV072/GROUP3 | [0xb49465E7cbbd874C55C1b7139FC8D6CCb7b85e60](https://sepolia.etherscan.io/address/0xb49465E7cbbd874C55C1b7139FC8D6CCb7b85e60) | SLV072 | GROUP3 | Planned 50,000 SLV072 + 100,000 GROUP3 (pending) | Planned 1 SLV072 = 2 GROUP3 (1 GROUP3 = 0.5 SLV072) | Expected about 70,710.68, all to Džoanna | [createPair](https://sepolia.etherscan.io/tx/0xa33406fa273ef84748b196bca24c13ca3a4d0dd8674a8f824c454856dec7f115) |

Reserves right after funding (raw values, 18 decimals):

- Pair 0: reserve0 = 100,000 GROUP3, reserve1 = 5,000 STCR.
- Pair 1: reserve0 = 80,000 CAFE, reserve1 = 100,000 GROUP3.
- Pair 2: reserve0 = 0, reserve1 = 0, LP total supply 0 (empty pair).

Approve transactions: STCR [tx](https://sepolia.etherscan.io/tx/0x9e21d617124d0fa6ed4b84d70c1d242a04cbe9798f5ec86465b1502c1a5c6844), GROUP3 for pool 0 [tx](https://sepolia.etherscan.io/tx/0xb80b84d8803920786d536f3a3b24bf8b4747c45fa1371dab52269227ac416106), CAFE [tx](https://sepolia.etherscan.io/tx/0x21c0f7e1285858a875a2cfc33b06262505d538f532ae34a06b05063ed7f4b96e), GROUP3 for pool 1 [tx](https://sepolia.etherscan.io/tx/0xe0988a9d8edbc10ef368c2b88c716cc72d89b73e64c8af1cd38498d441027c68).

### Pool 2 is empty for now

Džoanna's SLV072 had not reached wallet A when the farm had to be deployed. The farm needs all three LP addresses in its constructor, so pair 2 was created empty with `Factory.createPair(SLV072, GROUP3)`. Its address is final and already stored in the farm, so adding liquidity later needs no redeploy. When she sends 50,000 SLV072 to wallet A, `scripts/deploy.js` is rerun: it adds 50,000 SLV072 + 100,000 GROUP3 through Router02 and transfers all the pool 2 LP to her wallet. She then stakes it through the web app.

Effect on rewards: while pool 2 has nothing staked, its budget is not allocated to anyone (rule 4, "empty pool"). Pool 2 loses 1,000 GROUP3 per 3 minutes (333.33 per minute) of its 40,000 from the campaign start until the first LP is staked in it. That GROUP3 stays in the farm forever, because the farm has no sweep function. This is the intended behaviour, but it means pool 2 will pay out less than 40,000 in total.

### Why these start prices

Every pool gets the required 100,000 GROUP3. The start price is the ratio of the two amounts put in, so the personal token amounts were chosen to match how scarce each token is:

- STCR has the smallest supply (10,000) and is meant for rare achievements. 5,000 STCR against 100,000 GROUP3 makes 1 STCR = 20 GROUP3.
- CAFE has a ten times larger supply (100,000) and is an everyday reward, so it should be cheap. 80,000 CAFE (80% of the supply) against 100,000 GROUP3 gives 1 CAFE = 1.25 GROUP3.
- SLV072 also has 100,000 supply. Džoanna puts in half of it: 50,000 SLV072 against 100,000 GROUP3 gives 1 SLV072 = 2 GROUP3 (the same ratio as pool C in the task example).

The first liquidity provider receives `sqrt(amount0 * amount1) - 1000 wei` LP tokens: 22,360.68 for pair 0 and 89,442.72 for pair 1 (matches the table), and about 70,710.68 expected for pair 2.

## GroupFarm

| | |
|---|---|
| Contract | `contracts/GroupFarm.sol` |
| Address | [0xA76DEf3427e4BBC696E9F7cCa5906b65a6595B00](https://sepolia.etherscan.io/address/0xA76DEf3427e4BBC696E9F7cCa5906b65a6595B00) |
| Deploy tx | [tx](https://sepolia.etherscan.io/tx/0xfc613fb9be7e442c98022c62277a32f9d6b66033529557da633c47268b0426c6) |
| Funding tx (120,000 GROUP3) | [tx](https://sepolia.etherscan.io/tx/0x7f4768a34524b2180afab98773f8c528fbd63e9fa1e7d2ccee2a626302ae16fa) |
| `startSession` tx | [tx](https://sepolia.etherscan.io/tx/0x2d84008901bccf0664151c8d185672b2d01df65db38887ac166724a11d81eb20) |
| Campaign start | 2026-10-30 12:12:48 Riga (10:12:48 UTC), `startTime` = 1793355168 |
| Campaign end | 2026-10-30 14:12:48 Riga (12:12:48 UTC), `endTime` = 1793362368 |
| Reward token | GROUP3 |
| LP tokens | poolId 0 = pair 0 (STCR/GROUP3), 1 = pair 1 (CAFE/GROUP3), 2 = pair 2 (SLV072/GROUP3) |
| Duration | 7,200 s (120 minutes) |
| Budget per pool | 40,000 GROUP3 (`rewardPerPool` = 40,000e18) |
| Total fund | 120,000 GROUP3 |
| Rate | 40,000 / 7,200 s = 1,000 GROUP3 per pool per 3 minutes |
| Owner | Wallet A (OpenZeppelin `Ownable`, checked on chain). The only farm-specific owner function is `startSession`, plus the standard `transferOwnership` / `renounceOwnership` |

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

This exact case is a Hardhat test (final config) and passes. LP amounts from different pools are never compared. Each pool splits its own 1,000 GROUP3 per 3 minutes among its own stakers.

### The 9 mandatory rules

| # | Rule | How the code satisfies it |
|---|---|---|
| 1 | The campaign can be started once and only after full funding | `startSession` reverts if `startTime != 0` or if `rewardToken.balanceOf(farm) < 3 * rewardPerPool`. |
| 2 | Accepted LP addresses are fixed; arbitrary tokens cannot be staked | The three LP addresses are set once in the constructor and no function can change them; `stake` reverts for `poolId >= 3` and only ever calls `transferFrom` on `pools[poolId].lpToken`. |
| 3 | No rewards before start or after end | Before start `startTime` is 0 and the update does nothing; after end `t = min(now, endTime)` stops at `endTime`, so no time past the end is counted. |
| 4 | Empty pool budget is not given to the next entrant | When `totalStaked == 0` no reward is added, but `lastUpdate` still moves to `t`, so the empty time is skipped instead of being paid to whoever stakes next. Live on chain: pool 2 is empty and its budget is burning; pool 0 was empty for the first 108 s and those 600 GROUP3 went to nobody (see on-chain tests). |
| 5 | Stake and withdraw first book what was earned | Both call the pool update and settle the user's pending reward into `rewards` before changing the stake. |
| 6 | A reward cannot be received twice | `claim` subtracts the paid amount from the user's `rewards` before transferring, and `rewardDebt` already covers everything settled; `nonReentrant` blocks re-entry. |
| 7 | The owner cannot take participants' LP or the earned reward coverage | There is no rescue, sweep or emergency withdraw function. The owner's only power is `startSession`; LP and GROUP3 leave the farm only through `withdraw` and `claim` to the user who owns them. |
| 8 | No loop over all participants | Per-pool `accRewardPerShare` plus per-user `rewardDebt`; the only loop is over the 3 pools in `claimAll`. |
| 9 | Reward fund and staked principal are tracked separately | Rewards are GROUP3 tracked by `totalFund`, `allocated` and `totalPaid`; principal is LP tokens tracked by `pools[i].totalStaked` and `stakeOf`. They are different tokens and never mixed. |

Unstaking returns LP tokens only. To get STCR/CAFE/SLV072 and GROUP3 back, the LP holder must then remove liquidity separately through Router02 `removeLiquidity`.

`SafeERC20` is used for all token transfers and `ReentrancyGuard` protects `stake`, `withdraw`, `claim` and `claimAll`.

## Web app

URL: https://farckron.github.io/group3-defi/

Plain HTML and JavaScript (`index.html`, `app.js`, addresses in `config.js`), no build step, ethers 6.13.4 loaded from jsDelivr, served by GitHub Pages from the repository root.

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

Every transaction shows its state: waiting for wallet confirmation, sent (with Etherscan link), confirmed, or failed/cancelled. A sent transaction is reported as successful only after its receipt has status 1. Screenshots are in `screenshots/`.

## Tests

### Hardhat test suite

`npx hardhat test` on a local Hardhat network with mock ERC-20 LP tokens (`contracts/test/MockERC20.sol`) and time travel. Both the short config (360 s, 2,000 GROUP3 per pool, as the task suggests a short rehearsal) and the final config (7,200 s, 40,000 GROUP3 per pool) give the same rate of 1,000 GROUP3 per pool per 3 minutes.

| Task section 9 row | Expected result | What the test checks |
|---|---|---|
| One staker | Gets the whole reward for their active time | A alone stakes for 180 s and `earned` is 1,000 GROUP3 |
| Second joins later | No reward for time before joining | B stakes halfway; B's reward covers only the time after B's stake, A keeps the full first part |
| Several pools | Each pool is accounted independently | Staking in pool 0 does not change rewards in pools 1 and 2; each pool pays its own budget |
| Partial withdrawal | Later reward matches the smaller stake | After withdrawing part of the stake, the user's share of new rewards drops in proportion |
| Repeated claim | Paid rewards cannot be claimed again | A claims 1,000 at 180 s; a second `claim` 18 s later pays only the new 100; after the end, further `claim` and `claimAll` pay 0 and emit no `Claimed` event; `totalPaid` stays at 2,000 |
| Empty pool | Empty time is not paid to the next staker | A pool stays empty for a while; the first staker afterwards earns only from their own stake time |
| End of campaign | No new rewards, claim and withdraw still work | After `endTime`, `earned` stops growing; `claim` and full `withdraw` succeed |
| Wrong token | Cannot be staked as a registered LP | `stake` with `poolId` 3 reverts; an unregistered token cannot enter the farm |
| Fund check | Paid plus still owed never exceeds the budget | Short config (fund 6,000 GROUP3): after each of 10 mixed stake/withdraw/claim steps and after the final claims, paid plus all `earned` per pool is at most `rewardPerPool` (2,000), `allocated` is at most 2,000, and the farm's GROUP3 balance equals `totalFund - totalPaid` |
| Start rules (rule 1) | Start once, only when funded | `startSession` reverts when underfunded, by a non-owner, and on a second call |
| Rounding and decimals | No over-payment from truncation; claims never revert on rounding | Odd stake sizes leave only wei-level dust (34 wei in pool 0 in the run below). A replayed worst-case sequence of tiny stake/withdraw ops (pool payout 7 wei over `rewardPerPool`) still lets every user claim; the last claimer keeps the few missing wei as pending |

Result (full output in `test-results.txt`): **18 passing (2s)**. The suite also covers the task's worked example (250 / 750), no accrual before start, withdraw before start and after end, and the fixed GROUP3 supply.

### On-chain tests (Sepolia, live campaign)

`node scripts/onchain-tests.js during` ran against the real farm with wallets A and B between 12:13 and 12:35 Riga. Every check reads contract state at the receipt block and compares it with the reward formula. Raw data: `onchain-tests.json` (all hashes, blocks, numbers and every check result) and `onchain-during.log` (console output up to the step 7 crash described under Problems; the resumed steps 7 and 8 are recorded in `onchain-tests.json`).

Result of the "during" phase: **40 of 40 checks PASS**.

| Step | What happened | Wallet | Checks | Tx |
|---|---|---|---|---|
| 0 | A gives B 20% of its LP in pools 0 and 1 (4,472.14 LP0, 17,888.54 LP1) | A | 2 PASS | [LP0](https://sepolia.etherscan.io/tx/0x808a673dc199017d87cc5bf0e59d2da0a0d39bc9ef753a3dc09edb55345e89ae), [LP1](https://sepolia.etherscan.io/tx/0xa0c918e9e50abc511d55dd0223c9f8d2673fd27a7f9dcc43d023f2165777ae2e) |
| 1 | One staker: A approves and stakes 8,944.27 LP in pool 0, alone. Earned 333.33 GROUP3 in 60 s (formula: 40,000 x 60 / 7,200 = 333.33); B earns 0 | A | 5 PASS | [approve](https://sepolia.etherscan.io/tx/0x352b218a438013dfec0d9733a0255c11ac01b92640d98fa3d78a1a49a7b8f4b6), [stake](https://sepolia.etherscan.io/tx/0x54fd622f17908051a7c588986ff9f405a5598131ffa2e4ed80c5a25243cb7a48) |
| 2 | Second joins later: B stakes 4,472.14 LP in pool 0. B's `earned` is 0 at its join block; over the next 72 s B gets 133.33 (1/3 share) and A 266.67 (2/3 share) | B | 5 PASS | [approve](https://sepolia.etherscan.io/tx/0xe44536d5777e7ef8b1f9e6f7da9f8baccf8f41c4b1dae764976ddafd25b84c14), [stake](https://sepolia.etherscan.io/tx/0xcde69d56c5085a9e8926905bfa1be257682b6171a67c2c2011f8ef7e4b6370ff) |
| 3 | Several pools: A stakes 35,777.09 LP in pool 1. Earned 333.33 in 60 s, independent of pool 0 | A | 2 PASS | [approve](https://sepolia.etherscan.io/tx/0x527e741ae5831163136f32de9b82d69d38fc17f3454cf8eafde377ccdf3020bd), [stake](https://sepolia.etherscan.io/tx/0x94d53a413bc8c90d5078f253524605d8fcc92c2d0395d32a1a47218206015eff) |
| 4 | Partial withdraw: A withdraws 4,472.14 of its 8,944.27 LP from pool 0. Exact LP returned, pending reward settled, then A earns at the 1/2 share (2,066.67 over 744 s); pool 1 accrual unaffected (4,200.00 over 756 s) | A | 5 PASS | [withdraw](https://sepolia.etherscan.io/tx/0x2a5d3158378ac54680329801da786a4c683088fa5ad58312b10917c24840810d) |
| 5 | Repeated claim: A claims pool 0 twice. Claim 1 pays 3,666.67 (= `Claimed` event = balance change), `earned` is 0 right after; claim 2, 36 s later, pays only 100.00 (the new accrual at 1/2 share) | A | 6 PASS | [claim 1](https://sepolia.etherscan.io/tx/0xf302e8243a4028f03aeb06d830aa5ffac0b5e51e55e26f224c7aa465bf5e18f3), [claim 2](https://sepolia.etherscan.io/tx/0x84dc03f5dca453cc143bbc21209e3336912605b92d1221460f52f4ed91102306) |
| 6 | Wrong pool and wrong token: `stake(5, 1)` reverts; with only STCR approved (no LP allowance), `stake(0, 1e18)` reverts; the farm holds 0 STCR | A | 5 PASS | [approve STCR to farm](https://sepolia.etherscan.io/tx/0xf168109651ec422dd67a2461d60e903e9febc8018d7348b84e48c18fb7763017) |
| 7 | Fund check (read only, block 12026106): `totalPaid` 3,766.67 + earned A 5,300.00 + earned B 2,733.33 <= 120,000; farm GROUP3 balance 116,233.33 = `totalFund - totalPaid` exactly; LP balance of the farm = `totalStaked` in each pool (pool 2: 0 = 0) | read only | 7 PASS | |
| 8 | Claim all: B calls `claimAll` and receives 2,800.00 (all three pools in one tx; B had a stake only in pool 0); `totalEarned(B)` is 0 right after | B | 3 PASS | [claimAll](https://sepolia.etherscan.io/tx/0xa905145f9d807fd6458fa7f627e01fa80861e43990213f9f3753c8408baf7f7f) |

Notes:

- The first run stopped while waiting after the step 4 withdraw and was resumed at 12:33 Riga without resending anything, which is why the step 4 accrual window is 744 s instead of about 60 s.
- Values are rounded to 2 decimals here. On chain they differ from the exact formula only by a few thousand wei because of integer truncation (for example 333.333333333333324909 against 333.333333333333333333).
- Empty pool on chain: the campaign started at 10:12:48 UTC and A's first stake in pool 0 was 108 s later. At the claim 2 block, pool 0's `allocated` was 6,400 GROUP3 = 1,152 s x 40,000 / 7,200, counted from A's stake, not from the start. The 600 GROUP3 of the empty 108 s were not given to A. Pool 1 likewise was empty for its first 360 s (2,000 GROUP3 never allocated). Pool 2 shows the same thing for the whole time it stays empty.

### Web app UI test (live page, connected wallet)

`node scripts/uitest.js` opens https://farckron.github.io/group3-defi/ in headless Chromium with a scripted EIP-1193 wallet (stand-in for MetaMask, keys stay local) for wallet B, and drives the real page. Result: **18 of 18 checks PASS** (`uitest-results.json`, screenshots `screenshots/ui-*.png`).

Checked: no JS errors; connect shows B's address and Sepolia; GROUP3 balance and campaign data match the chain; every pool card shows pair name, LP in wallet, stake, total stake, share and earned matching the chain; amount 0, amount above the LP balance and withdraw above the stake are refused without opening the wallet; a wallet rejection is shown as "rejected" and never as success; on the wrong chain the switch button appears and actions are blocked until switching. Real transactions from the page: Approve 0.001 LP and Stake it in pool 1, Claim pool 0 (GROUP3 balance grew by 2,666.67), Withdraw the 0.001 LP from pool 1. Each one went through "waiting for wallet confirmation", "sent" and "confirmed in block N" in that order.

## Pending (updated after the campaign)

> The after-end results below are final. The pool 2 part is updated when Džoanna's SLV072 arrives.

**After-end phase** (`node scripts/onchain-tests.js after`, scheduled about 14:14 Riga). Step 9 checks: `earned` frozen after `endTime` for A and B in all pools; `claimAll` after the end pays exactly `earned` (no accrual after the end); full withdraw of every remaining stake returns all LP; final `totalPaid <= sum(allocated) <= totalFund`, and how much budget was never allocated (empty pool time).

- Result: **14 of 14 checks PASS** (run 14:14 to 14:17 Riga), so the on-chain total is **54 of 54 PASS**.
- `earned` was identical at blocks 12026603 and 12026609 for A and B in every pool (for example A pool 0: 16,500.00 at both), so nothing accrues after `endTime`.
- A's `claimAll` after the end paid 54,500.00 GROUP3, exactly the `earned` value before it (`Claimed` events = balance change); B's paid its remaining `earned` the same way. `totalEarned` was 0 for both right after. Txs: [A claimAll](https://sepolia.etherscan.io/tx/0x4ceb89c93e464ee8e8da16a3b4a9eb7973b8f051fcc8fcd031111b7768a2e0a9), [B claimAll](https://sepolia.etherscan.io/tx/0x83d2889d9db81409739aea18c3b90d7c934b75d4d811d8c4adcd5e2229ef7137).
- Full withdraws after the end returned all LP: A 4,472.14 LP0 ([tx](https://sepolia.etherscan.io/tx/0x9eea484917dd78e1a45b81282b0e600a67cc59961b73be6753e2599977fc6609)) and 35,777.09 LP1 ([tx](https://sepolia.etherscan.io/tx/0x9c1a5a9c20e3d9d3ddc6aa6cb5701027e8f90d428039d76206833c230a6a45ea)), B 4,472.14 LP0 ([tx](https://sepolia.etherscan.io/tx/0x88034810022cf191a44a586a56849283972a82325d3ad644fbc716a166efe876)). `totalStaked` is 0 in all pools.
- Final accounting: `totalPaid` 77,400.00 <= sum of `allocated` 77,400.00 <= `totalFund` 120,000 (the paid total is 123,495 wei below allocated, the rounding dust). Allocated per pool: pool 0 39,400 (600 lost to its empty first 108 s), pool 1 38,000 (2,000 lost to its empty first 360 s), pool 2 0 (empty for the whole campaign). The 42,600 GROUP3 never allocated stay locked in the farm, because it has no owner withdraw function.

**Pool 2 (SLV072/GROUP3)**

- Džoanna's 50,000 SLV072 to wallet A: _pending_
- `addLiquidity` 50,000 SLV072 + 100,000 GROUP3: _pending_
- LP received and transferred to Džoanna's wallet: _pending_
- Džoanna's stake, claim and withdraw through the web app: _pending_
- Pool 2 budget lost to empty time: **all 40,000 GROUP3**. Her SLV072 did not arrive before the campaign ended at 14:12:48 Riga, so the pool had no stakers and none of its budget was allocated. This is the "empty pool" rule working as required. Her stake, claim and withdraw still work after the end; they just earn 0.

## Compiler and library versions

| Tool | Version |
|---|---|
| Solidity compiler | solc 0.8.30 (`pragma ^0.8.27`), optimizer on (200 runs), EVM version cancun |
| SLV072 (Džoanna's own build) | solc 0.8.34, verified on Blockscout |
| OpenZeppelin Contracts | 5.6.1 (`ERC20`, `Ownable`, `SafeERC20`, `ReentrancyGuard`) |
| Hardhat | 2.29.1 |
| @nomicfoundation/hardhat-toolbox | 5.0.0 (hardhat-ethers 3.1.3, hardhat-chai-matchers 2.1.2, chai 4.5.0) |
| ethers | 6.17.0 in scripts and tests; 6.13.4 from jsDelivr in the web app |
| Node.js | 22.23.1 |
| Uniswap | v2 Router02 and Factory already deployed on Sepolia |

The source of STCR, CAFE, GROUP3 and GroupFarm is in this repository. These four contracts are not verified on Blockscout at the time of writing, so the explorer shows only bytecode for them. The deployed runtime bytecode was compared with the local build: GROUP3 matches exactly, GroupFarm matches except its three immutables (GROUP3 address, 7,200, 40,000e18), and STCR and CAFE differ only in the trailing metadata hash.

## How to run

```
npm install
npx hardhat compile
npx hardhat test                        # 18 Hardhat tests

node scripts/deploy.js                  # GROUP3, reserve, pools, farm, funding (resumable via deployments.json)
node scripts/start.js                   # startSession, once
node scripts/onchain-tests.js during    # live tests while the campaign runs (about 20 min)
node scripts/onchain-tests.js after     # step 9, after endTime
node scripts/status.js                  # read-only dump of farm, pools, stakes and balances
```

The deploy and test scripts read the wallet keys from a local file outside the repository; it is never committed or printed. All scripts are resumable: a sent transaction hash is saved before waiting, so a rerun never sends the same transaction twice. Every address and transaction hash of the deployment is in `deployments.json`.

## Transaction IDs

| Step | Tx |
|---|---|
| Deploy GROUP3 | [0xa46ae05acc1e9001177fa2e2941b865aa5abb8cf88973209caf67c298e6b8791](https://sepolia.etherscan.io/tx/0xa46ae05acc1e9001177fa2e2941b865aa5abb8cf88973209caf67c298e6b8791) |
| Reserve 99,580,000 GROUP3 to wallet B, first try (out of gas, failed) | [0xf5549381e7c0909f44f2c8258bb5cbdd3af2149da5316c5e74d0e98af3a9457b](https://sepolia.etherscan.io/tx/0xf5549381e7c0909f44f2c8258bb5cbdd3af2149da5316c5e74d0e98af3a9457b) |
| Reserve 99,580,000 GROUP3 to wallet B | [0x6ebcb50c013eb491b50e1039be4a8cf96ed402e7dc690e199d6f263827e0bdd5](https://sepolia.etherscan.io/tx/0x6ebcb50c013eb491b50e1039be4a8cf96ed402e7dc690e199d6f263827e0bdd5) |
| Add liquidity STCR/GROUP3 | [0x22901cac53653ac91823cd3e7fb155f0503f267193acc3a7e8cfb507f1df4b2f](https://sepolia.etherscan.io/tx/0x22901cac53653ac91823cd3e7fb155f0503f267193acc3a7e8cfb507f1df4b2f) |
| Add liquidity CAFE/GROUP3 | [0x4f41b46b12a193203ebb810d0b8067bb8b2596772f0950d21348c0e9a0e02097](https://sepolia.etherscan.io/tx/0x4f41b46b12a193203ebb810d0b8067bb8b2596772f0950d21348c0e9a0e02097) |
| Create empty pair SLV072/GROUP3 | [0xa33406fa273ef84748b196bca24c13ca3a4d0dd8674a8f824c454856dec7f115](https://sepolia.etherscan.io/tx/0xa33406fa273ef84748b196bca24c13ca3a4d0dd8674a8f824c454856dec7f115) |
| Add liquidity SLV072/GROUP3 | pending |
| Deploy GroupFarm | [0xfc613fb9be7e442c98022c62277a32f9d6b66033529557da633c47268b0426c6](https://sepolia.etherscan.io/tx/0xfc613fb9be7e442c98022c62277a32f9d6b66033529557da633c47268b0426c6) |
| Fund GroupFarm with 120,000 GROUP3 | [0x7f4768a34524b2180afab98773f8c528fbd63e9fa1e7d2ccee2a626302ae16fa](https://sepolia.etherscan.io/tx/0x7f4768a34524b2180afab98773f8c528fbd63e9fa1e7d2ccee2a626302ae16fa) |
| `startSession` | [0x2d84008901bccf0664151c8d185672b2d01df65db38887ac166724a11d81eb20](https://sepolia.etherscan.io/tx/0x2d84008901bccf0664151c8d185672b2d01df65db38887ac166724a11d81eb20) |

Test transactions are listed in the on-chain test table above.

## Problems and solutions

| Problem | Solution |
|---|---|
| The group has two members, but the task needs three pools | Serhii's second personal token CAFE fills the third pool slot. |
| Džoanna's SLV072 had not arrived when the farm had to be deployed, but the farm fixes its three LP addresses at deploy time | Pair 2 was created empty with `Factory.createPair`, so its address is final and could go into the farm constructor. Liquidity is added later without redeploying anything. Cost: pool 2's budget is not allocated while it is empty (rule 4). |
| The first reserve transfer to wallet B ran out of gas ([failed tx](https://sepolia.etherscan.io/tx/0xf5549381e7c0909f44f2c8258bb5cbdd3af2149da5316c5e74d0e98af3a9457b)) | The public RPC (`ethereum-sepolia-rpc.publicnode.com`) is load-balanced. The gas estimate ran on a node that had not yet seen the freshly deployed GROUP3 contract, so it was too low. Fixed with a 12 s pause after every confirmed transaction in `scripts/common.js`; the retry succeeded. |
| An `addLiquidity` gas estimate failed for the same reason (stale node state) | No transaction was sent, so nothing was lost. With the 12 s pause the rerun went through. |
| On-chain test step 7 first crashed reading the pool 2 LP token, because `deployments.json` has no `pairs[2]` entry for the empty pair (only `pairAddr.2`) | The test script now falls back to the empty pair address. The rerun resumed at step 7 without resending any transaction and all 40 checks passed. |
| The Uniswap web interface does not offer v2 pool creation on Sepolia | Pairs were created and funded with a script calling Router02 `addLiquidity` (and Factory `createPair` for pool 2) directly, after checking the Router, Factory and WETH addresses on chain. The task allows a compatible router interface or own script. |
| Uniswap v2 burns `MINIMUM_LIQUIDITY` (1000 wei of LP) on the first deposit | The first provider gets `sqrt(amount0 * amount1) - 1000 wei` LP. This is negligible and does not change the price. |
| Integer division truncates `rewardPerPool * dt / duration` and `reward * 1e18 / totalStaked` | Truncation rounds down, so normally a few wei of dust stay in the farm. `rewardDebt` is also floored at every stake change, so after many tiny stake/withdraw operations a pool can owe a few wei more than `rewardPerPool`. `claim` therefore pays at most the farm's GROUP3 balance and keeps the rest as pending, so no claim reverts and the farm never pays more than it holds. |
| Only Serhii's wallets can be driven by script, but tests need two stakers | Wallet B (Serhii's second wallet) is the scripted second participant. Džoanna tests as a real second user through the web app once pool 2 has liquidity. |
| The task names the token GROUP1 | Renamed to GROUP3 for Group 3, as the task allows. |

## Explanations required by the task

### Where the rewards come from

The rewards are not yield and not trading fees. The farm pays out a fixed 120,000 GROUP3 that was transferred to it from the GROUP3 supply before `startSession`. The contract checks this balance before the campaign can start and then spreads it over 120 minutes: 40,000 per pool, 1,000 per pool every 3 minutes. When the time is over the rewards stop. Nobody earns anything that was not deposited in advance, and budget for time when a pool is empty is simply never paid out.

### Effect of additional stakers

The amount paid per pool per unit of time is fixed, so more stakers do not create more rewards. They split the same 1,000 GROUP3 per 3 minutes by their share of the pool.

Example: A has 100 LP and B has 300 LP in one pool, so A earns 250 and B 750 per 3 minutes. Then C stakes 400 LP. The pool now has 800 LP and the same 1,000 GROUP3 is split 125 (A), 375 (B) and 500 (C). A's stake did not change, but A's income halved. The on-chain test shows the same effect: when B joined pool 0 with half of A's LP, A's share dropped from 1 to 2/3. An empty or small pool pays a lot per LP; a crowded pool pays little. The reward rate per LP shown by any farm is therefore only a snapshot.

### Token owner rights and their risks

In many real tokens the owner or admin can mint new tokens (diluting everyone), pause transfers, blacklist addresses, change a transfer fee (a "fee switch"), upgrade the contract to new code, or withdraw funds from a farm. Any of these lets one key change balances or block users, and the most common rug pull is exactly an admin mint or an admin withdraw.

In this project:

- STCR, CAFE, SLV072 and GROUP3 have no owner and no admin functions (`owner()` reverts on all of them; SLV072's verified source has only the constructor). Supply is fixed at deploy; nobody can mint, pause, blacklist or add fees.
- GroupFarm has an owner (wallet A), but the owner can only call `startSession` once. The owner cannot change the reward rate, the LP list or the duration, and cannot withdraw staked LP or the reward fund.
- The remaining trust points are concentration. Wallet B holds the 99,580,000 GROUP3 reserve (99.58% of supply). Wallet A holds most of the LP of pools 0 and 1 (it could remove that liquidity) and the 100,000 GROUP3 waiting for pool 2. After pool 2 is funded, Džoanna holds all of its LP. Whoever holds a large share of a token can sell it into a pool and move the price. Here the reserve is documented and not used.

### Why a high nominal price does not mean a good project

The start prices (1 STCR = 20 GROUP3, 1 CAFE = 1.25 GROUP3, planned 1 SLV072 = 2 GROUP3) are just the ratios chosen when adding liquidity. STCR could have been made worth 1,000 GROUP3 by putting in fewer STCR. The total supply is also an arbitrary number in the constructor. The pools are small and only the group provided liquidity, so even a modest trade moves the price a lot, and none of these tokens can be exchanged for real money. A price, or a price multiplied by supply, says nothing about whether a project is useful, safe or honestly run; the code, the admin rights, the liquidity depth and who holds the supply matter more.

### Test tokens are not real profit

Everything here is on the Sepolia test network. STCR, CAFE, SLV072, GROUP3, the LP tokens and Sepolia ETH have no monetary value. GROUP3 earned from the farm is not a profit in real money and nothing in this project guarantees any return.

## Repository structure

```
contracts/                Solidity sources: StudyCredit (STCR), CoffeeToken (CAFE), GroupToken, GroupFarm
contracts/test/           MockERC20 used as LP token in the Hardhat tests
test/GroupFarm.test.js    Hardhat tests
scripts/common.js         Shared provider, ABIs, resumable transaction step
scripts/deploy.js         GROUP3, reserve, pools, farm, funding
scripts/start.js          startSession
scripts/onchain-tests.js  Live Sepolia tests (during / after)
scripts/status.js         Read-only status dump
scripts/uitest.js         Browser test of the web app with a scripted wallet
uitest-results.json       Result of the full UI test run (uitest-results-readonly.json: read-only dry run)
index.html, app.js        Web app
config.js                 Deployed addresses used by the web app
deployments.json          All deployed addresses and transaction hashes
test-results.txt          Hardhat test output
onchain-tests.json        On-chain test data (hashes, blocks, checks)
onchain-during.log        On-chain test console log
screenshots/              Web app screenshots
hardhat.config.js         Compiler settings
README.md                 This report
```

## Safety notes

- Sepolia testnet only.
- The web app never asks for a private key or seed phrase. All signing happens in MetaMask.
- Deployment keys are kept in a local file outside the repository.
