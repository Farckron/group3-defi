// GroupFarm tests. Section 9 of the task (erins.lv/bis30102026.html) is covered 1:1 by the
// "Section 9" block; extra checks follow. Short test campaign: 360 s, 2,000 GROUP3 per pool
// (= 100 GROUP3 per 18 s). Every reward-relevant tx gets an exact block timestamp, so the
// expected amounts are exact (no tolerance), except where rounding is the point of the test.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const E = (n) => ethers.parseEther(String(n));
const SHORT = { duration: 360n, perPool: E(2000) };
const FINAL = { duration: 7200n, perPool: E(40000) };

async function deploy(cfg) {
  const [owner, alice, bob, carol, outsider] = await ethers.getSigners();
  const group = await (await ethers.getContractFactory("GroupToken")).deploy();
  const Mock = await ethers.getContractFactory("MockERC20");
  const lps = [
    await Mock.deploy("STCR-GROUP3 LP (mock)", "LP0"),
    await Mock.deploy("CAFE-GROUP3 LP (mock)", "LP1"),
    await Mock.deploy("SLV072-GROUP3 LP (mock)", "LP2"),
  ];
  const farm = await (await ethers.getContractFactory("GroupFarm")).deploy(
    group, lps.map((l) => l.target), cfg.duration, cfg.perPool);
  for (const u of [alice, bob, carol]) {
    for (const lp of lps) {
      await lp.mint(u, E(1000));
      await lp.connect(u).approve(farm, ethers.MaxUint256);
    }
  }
  await group.transfer(farm, cfg.perPool * 3n); // fund, not started yet
  return { farm, group, lps, owner, alice, bob, carol, outsider, cfg };
}
const shortFixture = () => deploy(SHORT);
const finalFixture = () => deploy(FINAL);

// Run a tx in a block with exactly this timestamp.
async function at(ts, fn) {
  await time.setNextBlockTimestamp(ts);
  return fn();
}
async function start(farm) {
  await farm.startSession();
  return BigInt(await time.latest());
}
// Claim at an exact timestamp and return how much GROUP3 arrived.
async function claimAt(ctx, user, poolId, ts) {
  const before = await ctx.group.balanceOf(user);
  await at(ts, () => ctx.farm.connect(user).claim(poolId));
  return (await ctx.group.balanceOf(user)) - before;
}

describe("GroupFarm", function () {
  describe("Section 9 tests", function () {
    it("One staker: receives the whole reward for the active participation time", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, alice } = ctx;
      const S = await start(farm);
      await at(S + 36n, () => farm.connect(alice).stake(0, E(100)));
      await at(S + 216n, () => farm.connect(alice).withdraw(0, E(100))); // 180 s active
      await time.increaseTo(S + 400n);
      expect(await farm.earned(alice, 0)).to.equal(E(1000)); // 2000 * 180/360
      expect(await claimAt(ctx, alice, 0, S + 401n)).to.equal(E(1000));
    });

    it("Second staker joins later: gets nothing for the time before joining", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, alice, bob } = ctx;
      await farm.connect(alice).stake(0, E(100));
      const S = await start(farm);
      await at(S + 180n, () => farm.connect(bob).stake(0, E(100)));
      expect(await farm.earned(bob, 0)).to.equal(0n);
      expect(await farm.earned(alice, 0)).to.equal(E(1000));
      await time.increaseTo(S + 360n);
      // first half alice alone (1000), second half split 50/50 (500 + 500)
      expect(await claimAt(ctx, alice, 0, S + 361n)).to.equal(E(1500));
      expect(await claimAt(ctx, bob, 0, S + 362n)).to.equal(E(500));
    });

    it("Multiple pools: each pool is accounted independently", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, group, alice, bob } = ctx;
      await farm.connect(alice).stake(0, E(100));
      await farm.connect(alice).stake(1, E(100));
      await farm.connect(bob).stake(1, E(300));
      const S = await start(farm);
      await time.increaseTo(S + 360n);
      expect(await farm.earned(alice, 0)).to.equal(E(2000)); // alone in pool 0
      expect(await farm.earned(alice, 1)).to.equal(E(500));  // 100 of 400 in pool 1
      expect(await farm.earned(bob, 1)).to.equal(E(1500));   // 300 of 400 in pool 1
      expect(await farm.earned(bob, 0)).to.equal(0n);
      expect((await farm.pools(2)).allocated).to.equal(0n);  // nobody in pool 2
      expect(await farm.totalEarned(alice)).to.equal(E(2500));
      const before = await group.balanceOf(alice);
      await farm.connect(alice).claimAll();
      expect((await group.balanceOf(alice)) - before).to.equal(E(2500));
      expect(await farm.totalEarned(alice)).to.equal(0n);
      expect(await farm.earned(bob, 1)).to.equal(E(1500)); // untouched by alice's claim
    });

    it("Partial withdraw: later reward matches the smaller stake", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, lps, alice, bob } = ctx;
      await farm.connect(alice).stake(0, E(300));
      await farm.connect(bob).stake(0, E(100));
      const S = await start(farm);
      const lpBefore = await lps[0].balanceOf(alice);
      await at(S + 180n, () => farm.connect(alice).withdraw(0, E(200)));
      expect((await lps[0].balanceOf(alice)) - lpBefore).to.equal(E(200));
      expect(await farm.stakeOf(0, alice)).to.equal(E(100));
      expect(await farm.earned(alice, 0)).to.equal(E(750)); // booked before the withdraw
      await time.increaseTo(S + 360n);
      // first half 300:100 -> 750/250, second half 100:100 -> 500/500
      expect(await farm.earned(alice, 0)).to.equal(E(1250));
      expect(await farm.earned(bob, 0)).to.equal(E(750));
    });

    it("Repeated claim: already-paid reward cannot be claimed again", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, group, alice } = ctx;
      await farm.connect(alice).stake(0, E(100));
      const S = await start(farm);
      expect(await claimAt(ctx, alice, 0, S + 180n)).to.equal(E(1000));
      expect(await claimAt(ctx, alice, 0, S + 198n)).to.equal(E(100)); // only the new 18 s
      expect(await claimAt(ctx, alice, 0, S + 400n)).to.equal(E(900)); // rest up to the end
      // after the end nothing new accrues: further claims pay exactly 0 and emit nothing
      await time.setNextBlockTimestamp(S + 401n);
      await expect(farm.connect(alice).claim(0)).to.not.emit(farm, "Claimed");
      const before = await group.balanceOf(alice);
      await farm.connect(alice).claimAll();
      expect(await group.balanceOf(alice)).to.equal(before);
      expect(await farm.totalPaid()).to.equal(E(2000));
    });

    it("Empty pool: reward for empty time is not given to the next staker", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, group, alice, bob } = ctx;
      const S = await start(farm);
      await at(S + 180n, () => farm.connect(alice).stake(0, E(100)));   // 0..180 empty
      await at(S + 252n, () => farm.connect(alice).withdraw(0, E(100))); // 72 s -> 400
      await at(S + 324n, () => farm.connect(bob).stake(0, E(100)));     // 252..324 empty
      await time.increaseTo(S + 400n);
      expect(await claimAt(ctx, alice, 0, S + 401n)).to.equal(E(400));
      expect(await claimAt(ctx, bob, 0, S + 402n)).to.equal(E(200)); // 36 s, not the empty 72 s
      expect((await farm.pools(0)).allocated).to.equal(E(600));
      // the unallocated 1400 of pool 0 (and all of pools 1, 2) stays in the contract
      expect(await group.balanceOf(farm)).to.equal(E(6000) - E(600));
    });

    it("Campaign end: no new rewards accrue, but claim and withdraw still work", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, lps, alice, bob } = ctx;
      await farm.connect(alice).stake(0, E(100));
      const S = await start(farm);
      expect(await farm.endTime()).to.equal(S + 360n);
      await time.increaseTo(S + 360n);
      expect(await farm.earned(alice, 0)).to.equal(E(2000));
      await time.increaseTo(S + 2000n);
      expect(await farm.earned(alice, 0)).to.equal(E(2000)); // still 2000
      await farm.connect(bob).stake(0, E(100)); // late stake is accepted but earns nothing
      await time.increase(500);
      expect(await farm.earned(bob, 0)).to.equal(0n);
      expect(await claimAt(ctx, alice, 0, S + 3000n)).to.equal(E(2000));
      const lpBefore = await lps[0].balanceOf(alice);
      await farm.connect(alice).withdraw(0, E(100));
      expect((await lps[0].balanceOf(alice)) - lpBefore).to.equal(E(100));
      await farm.connect(bob).withdraw(0, E(100));
      expect((await farm.pools(0)).totalStaked).to.equal(0n);
    });

    it("Wrong token: cannot be submitted as a registered LP", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, lps, group, outsider } = ctx;
      const fake = await (await ethers.getContractFactory("MockERC20")).deploy("Fake LP", "FAKE");
      await fake.mint(outsider, E(100));
      await fake.connect(outsider).approve(farm, ethers.MaxUint256);
      // there is no pool id for another token
      await expect(farm.connect(outsider).stake(3, E(1))).to.be.revertedWith("unknown pool");
      // stake(0) only ever pulls the registered LP0, never the fake token
      await expect(farm.connect(outsider).stake(0, E(1)))
        .to.be.revertedWithCustomError(lps[0], "ERC20InsufficientAllowance");
      expect(await fake.balanceOf(farm)).to.equal(0n);
      // tokens sent directly are not a stake
      await fake.connect(outsider).transfer(farm, E(5));
      expect(await farm.stakeOf(0, outsider)).to.equal(0n);
      expect((await farm.pools(0)).totalStaked).to.equal(0n);
      // LP addresses are fixed at deployment and validated
      const F = await ethers.getContractFactory("GroupFarm");
      const a = lps.map((l) => l.target);
      await expect(F.deploy(group, [a[0], a[0], a[2]], 360, E(2000))).to.be.revertedWith("duplicate LP");
      await expect(F.deploy(group, [a[0], group.target, a[2]], 360, E(2000))).to.be.revertedWith("LP equals reward token");
      await expect(F.deploy(group, [a[0], ethers.ZeroAddress, a[2]], 360, E(2000))).to.be.revertedWith("LP is zero");
    });

    it("Fund check: paid plus pending never exceeds the funded budget", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, group, lps, alice, bob, carol } = ctx;
      const users = [alice, bob, carol];
      const paid = [0n, 0n, 0n];
      const check = async () => {
        for (let p = 0; p < 3; p++) {
          let pending = 0n;
          for (const u of users) pending += await farm.earned(u, p);
          const pool = await farm.pools(p);
          expect(paid[p] + pending).to.be.lte(SHORT.perPool);
          expect(pool.allocated).to.be.lte(SHORT.perPool);
          // reward fund and LP principal are separate: farm holds exactly the staked LP
          expect(await lps[p].balanceOf(farm)).to.equal(pool.totalStaked);
        }
        expect(await farm.totalPaid()).to.equal(paid[0] + paid[1] + paid[2]);
        expect(await group.balanceOf(farm)).to.equal((await farm.totalFund()) - (await farm.totalPaid()));
      };
      const claim = async (u, p, ts) => { paid[p] += await claimAt(ctx, u, p, ts); };
      await farm.connect(alice).stake(0, E(100));
      await farm.connect(bob).stake(1, E(50));
      const S = await start(farm);
      expect(await farm.totalFund()).to.equal(E(6000));
      const steps = [
        () => at(S + 20n, () => farm.connect(carol).stake(0, E(333))),
        () => at(S + 45n, () => farm.connect(alice).stake(1, E(17))),
        () => claim(alice, 0, S + 70n),
        () => at(S + 99n, () => farm.connect(carol).stake(2, E(1))),
        () => at(S + 130n, () => farm.connect(bob).withdraw(1, E(25))),
        () => claim(carol, 0, S + 171n),
        () => at(S + 200n, () => farm.connect(alice).withdraw(0, E(100))),
        () => claim(bob, 1, S + 260n),
        () => at(S + 333n, () => farm.connect(bob).stake(0, E(999))),
        () => claim(alice, 1, S + 359n),
      ];
      for (const step of steps) {
        await step();
        await check();
      }
      await time.increaseTo(S + 500n);
      for (const u of users) for (let p = 0; p < 3; p++) await claim(u, p, BigInt(await time.latest()) + 1n);
      await check();
      for (let p = 0; p < 3; p++) expect(paid[p]).to.be.lte((await farm.pools(p)).allocated);
    });
  });

  describe("Worked example from the task (final config 120 min, 40,000 per pool)", function () {
    it("A 100 LP and B 300 LP for one full 3-minute interval: A gets 250, B gets 750", async function () {
      const ctx = await loadFixture(finalFixture);
      const { farm, alice: A, bob: B } = ctx;
      expect(await farm.duration()).to.equal(7200n);
      expect(await farm.rewardPerPool()).to.equal(E(40000));
      await farm.connect(A).stake(0, E(100));
      await farm.connect(B).stake(0, E(300));
      const S = await start(farm);
      expect(await claimAt(ctx, A, 0, S + 180n)).to.equal(E(250)); // A claims exactly at +3 min
      expect(await farm.earned(B, 0)).to.equal(E(750));               // B's share at the same block
      expect((await farm.pools(0)).allocated).to.equal(E(1000)); // 1000 GROUP3 per pool per 3 min
    });
  });

  describe("Session start", function () {
    it("startSession reverts if underfunded, and works once the full fund is in", async function () {
      const [owner] = await ethers.getSigners();
      const group = await (await ethers.getContractFactory("GroupToken")).deploy();
      const Mock = await ethers.getContractFactory("MockERC20");
      const lps = [await Mock.deploy("a", "A"), await Mock.deploy("b", "B"), await Mock.deploy("c", "C")];
      const farm = await (await ethers.getContractFactory("GroupFarm")).deploy(group, lps, 360, E(2000));
      await group.transfer(farm, E(6000) - 1n);
      await expect(farm.startSession()).to.be.revertedWith("fund not deposited");
      await group.transfer(farm, 1n);
      const tx = await farm.startSession();
      const S = BigInt(await time.latest());
      await expect(tx).to.emit(farm, "SessionStarted").withArgs(S, S + 360n);
      expect(await farm.startTime()).to.equal(S);
      expect(await farm.totalFund()).to.equal(E(6000));
      expect(await farm.owner()).to.equal(owner.address);
    });

    it("startSession can be called only once", async function () {
      const { farm } = await loadFixture(shortFixture);
      await farm.startSession();
      await expect(farm.startSession()).to.be.revertedWith("already started");
    });

    it("non-owner cannot start the session", async function () {
      const { farm, alice } = await loadFixture(shortFixture);
      await expect(farm.connect(alice).startSession())
        .to.be.revertedWithCustomError(farm, "OwnableUnauthorizedAccount").withArgs(alice.address);
    });

    it("no rewards accrue before the start", async function () {
      const { farm, alice } = await loadFixture(shortFixture);
      expect(await farm.startTime()).to.equal(0n);
      expect(await farm.endTime()).to.equal(0n);
      await farm.connect(alice).stake(0, E(100));
      await time.increase(1000);
      expect(await farm.earned(alice, 0)).to.equal(0n);
      const S = await start(farm);
      expect(await farm.earned(alice, 0)).to.equal(0n); // waiting before start gave nothing
      await time.increaseTo(S + 18n);
      expect(await farm.earned(alice, 0)).to.equal(E(100)); // only time after start counts
    });
  });

  describe("Principal recovery", function () {
    it("withdraw works before the start and after the end", async function () {
      const { farm, lps, alice } = await loadFixture(shortFixture);
      await farm.connect(alice).stake(1, E(400));
      await farm.connect(alice).withdraw(1, E(150)); // before start
      expect(await lps[1].balanceOf(alice)).to.equal(E(750));
      const S = await start(farm);
      await time.increaseTo(S + 1000n);
      await farm.connect(alice).withdraw(1, E(250)); // after end
      expect(await lps[1].balanceOf(alice)).to.equal(E(1000));
      expect(await farm.stakeOf(1, alice)).to.equal(0n);
      await expect(farm.connect(alice).withdraw(1, 1n)).to.be.revertedWith("more than staked");
      await expect(farm.connect(alice).stake(1, 0n)).to.be.revertedWith("amount is zero");
    });
  });

  describe("Rounding and decimals", function () {
    it("total claims of a pool never exceed rewardPerPool and the dust is tiny", async function () {
      const ctx = await loadFixture(shortFixture);
      const { farm, group, alice, bob, carol } = ctx;
      expect(await group.decimals()).to.equal(18n);
      expect(await farm.rewardPerPool()).to.equal(2000n * 10n ** 18n);
      // uneven stakes and odd time steps so every integer division really truncates
      await farm.connect(alice).stake(0, E(1));
      const S = await start(farm);
      await at(S + 7n, () => farm.connect(bob).stake(0, 3n * 10n ** 18n + 1n));
      await at(S + 20n, () => farm.connect(carol).stake(0, E(7)));
      await at(S + 121n, () => farm.connect(bob).withdraw(0, 12345n));
      await at(S + 134n, () => farm.connect(alice).claim(0));
      await at(S + 235n, () => farm.connect(carol).stake(0, 1n));
      await at(S + 301n, () => farm.connect(bob).claim(0));
      await time.increaseTo(S + 400n);
      for (const u of [alice, bob, carol]) await farm.connect(u).claim(0);
      const paid = await farm.totalPaid();
      const pool = await farm.pools(0);
      expect(pool.allocated).to.be.lte(SHORT.perPool);
      expect(paid).to.be.lte(pool.allocated);
      const dust = SHORT.perPool - paid; // pool was never empty, so everything except dust was paid
      console.log(`        rounding dust left in pool 0: ${dust} wei`);
      expect(dust).to.be.lt(1000000n); // < 1e-12 GROUP3
      for (const u of [alice, bob, carol]) expect(await farm.earned(u, 0)).to.equal(0n);
    });

    it("rewardDebt rounding can over-allocate a few wei, but no claim reverts", async function () {
      const { farm, group, alice, bob, carol } = await loadFixture(shortFixture);
      // Worst case found by an exact BigInt model of the pool math: pool 0 owes rewardPerPool + 7 wei.
      // [t after start, who, +stake / -withdraw in wei]; t = 0 means before startSession.
      const ops = [[0,"a",13],[0,"b",9],[9,"a",16],[18,"a",23],[27,"a",27],[36,"b",24],[45,"a",34],[54,"b",1],
        [63,"a",-5],[72,"b",-4],[81,"b",-6],[90,"b",-22],[99,"a",-25],[108,"b",-1],[117,"a",-14],[126,"b",1],
        [135,"b",-1],[144,"b",1],[153,"a",19],[162,"b",-1],[171,"a",-4],[180,"b",1],[189,"b",1],[198,"a",-3],
        [207,"a",2],[216,"b",5],[225,"b",-7],[234,"b",30],[243,"b",22],[252,"b",22],[261,"b",34],[270,"a",-18],
        [279,"b",5],[288,"a",34],[297,"b",33],[306,"a",-18],[315,"a",8],[324,"b",29],[333,"a",11],[342,"a",-2],[351,"b",27]];
      const who = { a: alice, b: bob };
      const op = ([, w, d]) => d > 0 ? farm.connect(who[w]).stake(0, BigInt(d)) : farm.connect(who[w]).withdraw(0, BigInt(-d));
      for (const o of ops.filter((o) => o[0] === 0)) await op(o);
      await farm.connect(carol).stake(1, E(1)); // pools 1 and 2 never empty either, so the whole fund is allocated
      await farm.connect(carol).stake(2, E(1));
      const S = await start(farm);
      for (const o of ops.filter((o) => o[0] > 0)) await at(S + BigInt(o[0]), () => op(o));
      await time.increaseTo(S + 370n);
      expect((await farm.earned(alice, 0)) + (await farm.earned(bob, 0))).to.equal(SHORT.perPool + 7n);
      await farm.connect(carol).claimAll();
      await farm.connect(alice).claim(0);
      await farm.connect(bob).claim(0); // reverted with ERC20InsufficientBalance before the cap in _claim
      expect(await group.balanceOf(farm)).to.equal(0n);
      expect(await farm.totalPaid()).to.equal(await farm.totalFund());
      expect(await farm.earned(bob, 0)).to.be.lte(10n); // the few unpayable wei stay pending
    });

    it("GROUP3 token has the fixed supply, all minted to the deployer", async function () {
      const [owner] = await ethers.getSigners();
      const g = await (await ethers.getContractFactory("GroupToken")).deploy();
      expect(await g.name()).to.equal("Group 3 Token");
      expect(await g.symbol()).to.equal("GROUP3");
      expect(await g.totalSupply()).to.equal(E(100000000));
      expect(await g.balanceOf(owner)).to.equal(E(100000000));
    });
  });
});
