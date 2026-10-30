// Live scenario on the RUNNING GroupFarm with wallets A and B. Usage:
//   node scripts/onchain-tests.js during   # steps 0-8, while the campaign runs (needs ~10 min)
//   node scripts/onchain-tests.js after    # step 9, after endTime
// Every tx hash, block, earned() reading and PASS/FAIL/SKIP goes to onchain-tests.json.
// Resumable: done tests are skipped, sent txs are never resent, and all checks read state at
// receipt block numbers ({ blockTag }), so a rerun reproduces the same numbers.
// ponytail: historical reads rely on the RPC keeping recent state; a resume hours later may hit
// "missing trie node" for old anchors. Then delete that test's entry under "steps" (keep "txs") and rerun.
const { Contract, parseUnits, parseEther } = require("ethers");
const path = require("path");
const c = require("./common");

const PHASE = process.argv[2];
if (!["during", "after"].includes(PHASE)) { console.error("usage: node scripts/onchain-tests.js during|after"); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const at = b => ({ blockTag: b });
const close = (got, exp) => { const d = got > exp ? got - exp : exp - got; return d <= exp / 1_000_000n + 1_000_000_000n; };

(async () => {
  const provider = await c.connect();
  const { A: wA, B: wB } = c.wallets(provider);
  const A = wA.address, B = wB.address;
  const { state: dep } = c.loadState(path.join(c.ROOT, "deployments.json"));
  if (!dep.farm || !dep.pairs) throw new Error("deployments.json has no farm/pairs: deploy first");
  const { state: log, save } = c.loadState(path.join(c.ROOT, "onchain-tests.json"));
  Object.assign(log, { farm: dep.farm, walletA: A, walletB: B });
  log.txs ||= {}; log.blocks ||= {}; log.steps ||= {}; save();
  const step = c.makeStep(provider, log.txs, save);

  const farm = new Contract(dep.farm, c.art("GroupFarm").abi, wA);
  const farmB = farm.connect(wB);
  const g3 = c.erc20(dep.groupToken, provider);
  const lp = [0, 1, 2].map(i => new Contract(dep.pairs[i]?.pair || dep.pairAddr[i], c.PAIR_ABI, provider)); // pool 2 may still be the empty pair
  const [RPP, DUR, START, END] = await Promise.all([farm.rewardPerPool(), farm.duration(), farm.startTime(), farm.endTime()]);

  const tsCache = {};
  const ts = async b => {
    if (tsCache[b] === undefined) {
      let blk; // load-balanced RPC: a lagging node returns null for a fresh block, so retry
      while (!(blk = await provider.getBlock(b))) await sleep(3000);
      tsCache[b] = BigInt(blk.timestamp);
    }
    return tsCache[b];
  };
  const tx = async (name, fn) => {
    const r = await step(name, fn);
    await sleep(2000); // let load-balanced RPC nodes catch up before blockTag reads
    log.blocks[name] = { block: r.blockNumber, timestamp: Number(await ts(r.blockNumber)) }; save();
    return r;
  };
  // Wait (setTimeout, no RPC spam) until a block at least `sec` after block b exists; returns latest-1 to dodge lagging nodes.
  async function waitAfter(b, sec) {
    const target = (await ts(b)) + BigInt(sec);
    for (;;) {
      const n = (await provider.getBlockNumber()) - 1;
      const t = await ts(n);
      if (t >= target) return n;
      const s = Number(target - t) + 6;
      console.log(`  waiting ${s}s for accrual ...`);
      await sleep(s * 1000);
    }
  }
  const claimedIn = r => r.logs.filter(l => l.address.toLowerCase() === dep.farm.toLowerCase())
    .map(l => farm.interface.parseLog(l)).filter(e => e && e.name === "Claimed").reduce((s, e) => s + e.args[2], 0n);
  const g3Delta = async (user, b) => (await g3.balanceOf(user, at(b))) - (await g3.balanceOf(user, at(b - 1)));
  const lpDelta = async (i, user, b) => (await lp[i].balanceOf(user, at(b))) - (await lp[i].balanceOf(user, at(b - 1)));
  const totalEarnedAt = async (user, b) => (await Promise.all([0, 1, 2].map(i => farm.earned(user, i, at(b))))).reduce((s, x) => s + x, 0n);
  const shareDropped = async (pid, user, b) => {
    const [[, t0], [, t1], s0, s1] = await Promise.all([farm.pools(pid, at(b - 1)), farm.pools(pid, at(b)), farm.stakeOf(pid, user, at(b - 1)), farm.stakeOf(pid, user, at(b))]);
    return { pass: s1 * t0 < s0 * t1, before: `${s0}/${t0}`, after: `${s1}/${t1}` };
  };

  // Expected earned growth of `user` in `pid` between blocks b1 < b2, from stake/total after b1.
  // Only honest if no pool update happened in between: lastUpdate equal at b1 and b2-1 (else SKIP).
  async function expected(pid, user, b1, b2) {
    const [[, total, , lu1], [, , , lu2], stake, t1, t2] = await Promise.all([
      farm.pools(pid, at(b1)), farm.pools(pid, at(b2 - 1)), farm.stakeOf(pid, user, at(b1)), ts(b1), ts(b2)]);
    const cap = t => (t > END ? END : t);
    const exp = total === 0n ? 0n : RPP * (cap(t2) - cap(t1)) / DUR * stake / total;
    return { exp, clean: b2 - 1 === b1 || lu1 === lu2, stake, total, t1, t2 };
  }

  async function test(name, fn) {
    const rec = (log.steps[name] ||= {});
    if (rec.done) return console.log(`skip test ${name}`);
    console.log(`\n== ${name}`);
    rec.checks = [];
    try { await fn(rec); } catch (e) {
      rec.checks.push({ name: "error", result: "ERR", message: e.shortMessage || e.message }); save();
      throw e; // later tests depend on this one; rerun resumes here
    }
    rec.done = true; rec.finishedAt = new Date().toISOString(); save();
  }
  function check(rec, name, pass, detail = {}) {
    const result = pass === null ? "SKIP" : pass ? "PASS" : "FAIL";
    rec.checks.push({ name, result, ...detail }); save();
    console.log(`  ${result}  ${name}`);
    if (result !== "PASS") console.log("        ", c.json(detail).replace(/\s+/g, " "));
  }
  async function growthCheck(rec, name, pid, user, b1, b2) {
    const e = await expected(pid, user, b1, b2);
    const [e1, e2] = await Promise.all([farm.earned(user, pid, at(b1)), farm.earned(user, pid, at(b2))]);
    const got = e2 - e1;
    check(rec, name, e.clean ? close(got, e.exp) : null,
      { poolId: pid, b1, b2, t1: e.t1, t2: e.t2, stake: e.stake, totalStaked: e.total, earned1: e1, earned2: e2, got, expected: e.exp, ...(e.clean ? {} : { note: "pool updated in between" }) });
    return got;
  }
  const reverts = async f => { try { await f(); return false; } catch { return true; } };

  const now = BigInt((await provider.getBlock("latest")).timestamp);
  console.log(`farm ${dep.farm}: start ${START}, end ${END}, now ${now}, rewardPerPool ${c.fmt(RPP)}, duration ${DUR}s`);
  const bEth = await provider.getBalance(B);
  if (bEth < parseEther("0.002")) console.warn(`WARNING: wallet B has only ${c.fmt(bEth)} ETH for gas`);

  if (PHASE === "during") {
    if (START === 0n) throw new Error("session not started: node scripts/start.js");
    if (now >= END) throw new Error("campaign already ended: run with 'after'");
    if (END - now < 1200n) console.warn(`WARNING: only ${END - now}s left; the during phase needs ~10 min`);

    await test("0-A-gives-B-LP", async rec => {
      for (const i of [0, 1]) {
        rec[`amount${i}`] ??= (await lp[i].balanceOf(A)) / 5n; save(); // 20% of A's LP (pool 2 LP belongs to Dzoanna, A holds none)
        const amt = BigInt(rec[`amount${i}`]);
        const r = await tx(`lpToB${i}`, () => lp[i].connect(wA).transfer(B, amt));
        const got = await lpDelta(i, B, r.blockNumber);
        check(rec, `B received 20% of A's LP in pool ${i}`, got === amt && amt > 0n, { amount: amt, got });
      }
    });

    await test("1-A-stakes-pool0", async rec => {
      rec.amount ??= (await lp[0].balanceOf(A)) / 2n; save();
      const amt = BigInt(rec.amount);
      await tx("approveA0", () => lp[0].connect(wA).approve(dep.farm, amt)); // exact, so allowance is 0 after stake (step 6)
      const s = (await tx("stakeA0", () => farm.stake(0, amt))).blockNumber;
      const ds = (await farm.stakeOf(0, A, at(s))) - (await farm.stakeOf(0, A, at(s - 1)));
      check(rec, "stakeOf(0, A) grew by the staked amount", ds === amt, { amount: amt, delta: ds });
      check(rec, "B has no stake in pool 0 yet", (await farm.stakeOf(0, B, at(s))) === 0n);
      const L = await waitAfter(s, 60);
      const got = await growthCheck(rec, "A earned(0) grew by rewardPerPool*dt/duration*share", 0, A, s, L);
      check(rec, "A earned(0) > 0 after ~60 s", got > 0n, { got });
      const eB = await farm.earned(B, 0, at(L));
      check(rec, "B (not staked) earned(0) == 0", eB === 0n, { earnedB: eB, block: L });
    });

    await test("2-B-joins-pool0-later", async rec => {
      rec.amount ??= await lp[0].balanceOf(B); save();
      const amt = BigInt(rec.amount);
      await tx("approveB0", () => lp[0].connect(wB).approve(dep.farm, amt));
      const j = (await tx("stakeB0", () => farmB.stake(0, amt))).blockNumber;
      const eJ = await farm.earned(B, 0, at(j));
      check(rec, "B earned(0) == 0 at its join block (nothing from before joining)", eJ === 0n, { block: j, earned: eJ });
      const sd = await shareDropped(0, A, j);
      check(rec, "A share of pool 0 dropped when B joined", sd.pass, sd);
      const L = await waitAfter(j, 60);
      const gB = await growthCheck(rec, "B earned(0) since join == formula with pool totals", 0, B, j, L);
      check(rec, "B earned(0) > 0 after ~60 s", gB > 0n, { got: gB });
      await growthCheck(rec, "A earned(0) after B joined == formula with new share", 0, A, j, L);
    });

    await test("3-A-stakes-pool1", async rec => {
      const blocks = {};
      for (const i of [1]) {
        rec[`amount${i}`] ??= (await lp[i].balanceOf(A)) / 2n; save();
        const amt = BigInt(rec[`amount${i}`]);
        await tx(`approveA${i}`, () => lp[i].connect(wA).approve(dep.farm, amt));
        blocks[i] = (await tx(`stakeA${i}`, () => farm.stake(i, amt))).blockNumber;
        const ds = (await farm.stakeOf(i, A, at(blocks[i]))) - (await farm.stakeOf(i, A, at(blocks[i] - 1)));
        check(rec, `stakeOf(${i}, A) grew by the staked amount`, ds === amt, { amount: amt, delta: ds });
      }
      const L = await waitAfter(blocks[1], 60);
      for (const i of [1]) await growthCheck(rec, `A earned(${i}) == formula for pool ${i}`, i, A, blocks[i], L);
    });

    await test("4-A-partial-withdraw-pool0", async rec => {
      rec.amount ??= (await farm.stakeOf(0, A)) / 2n; save();
      const amt = BigInt(rec.amount);
      const w = (await tx("withdrawA0", () => farm.withdraw(0, amt))).blockNumber;
      const got = await lpDelta(0, A, w);
      check(rec, "withdraw returned exactly the LP amount to A", got === amt, { amount: amt, got });
      // settled, not lost: earned right after == earned one block before + accrual of that block at the old share
      await growthCheck(rec, "pending reward settled on withdraw (no loss, no double count)", 0, A, w - 1, w);
      const sd = await shareDropped(0, A, w);
      check(rec, "A share of pool 0 dropped after partial withdraw", sd.pass, sd);
      const L = await waitAfter(w, 60);
      await growthCheck(rec, "A earned(0) after withdraw follows the lower rate", 0, A, w, L);
      await growthCheck(rec, "pool 1 accrual unaffected by the pool 0 withdraw (independent pools)", 1, A, w - 1, L);
    });

    await test("5-A-claims-pool0-twice", async rec => {
      const r1 = await tx("claimA0_1", () => farm.claim(0));
      const b1 = r1.blockNumber, c1 = claimedIn(r1), d1 = await g3Delta(A, b1);
      check(rec, "claim #1: Claimed event == GROUP3 balance delta, > 0", c1 === d1 && c1 > 0n, { block: b1, claimed: c1, balanceDelta: d1 });
      const pre = await farm.earned(A, 0, at(b1 - 1)), e1 = await expected(0, A, b1 - 1, b1);
      check(rec, "claim #1 paid earned() of the previous block + that block's accrual", close(c1, pre + e1.exp), { claimed: c1, earnedBefore: pre, accrual: e1.exp });
      check(rec, "earned(0) == 0 right after claim", (await farm.earned(A, 0, at(b1))) === 0n);
      const r2 = await tx("claimA0_2", () => farm.claim(0));
      const b2 = r2.blockNumber, c2 = claimedIn(r2), d2 = await g3Delta(A, b2);
      check(rec, "claim #2: Claimed event == GROUP3 balance delta", c2 === d2, { block: b2, claimed: c2, balanceDelta: d2 });
      const e2 = await expected(0, A, b1, b2);
      check(rec, "claim #2 paid only the accrual since claim #1", e2.clean ? close(c2, e2.exp) : null, { claimed: c2, expected: e2.exp, t1: e2.t1, t2: e2.t2 });
      check(rec, "claim #2 < claim #1 (old amount never paid again)", c2 < c1, { claim1: c1, claim2: c2 });
    });

    await test("6-wrong-pool-and-wrong-token", async rec => {
      check(rec, "staticCall stake(5, 1) reverts (unknown pool)", await reverts(() => farm.stake.staticCall(5, 1n)));
      check(rec, "estimateGas stake(5, 1) reverts", await reverts(() => farm.stake.estimateGas(5, 1n)));
      const allow = await lp[0].allowance(A, dep.farm);
      check(rec, "precondition: A's LP0 allowance to farm is 0", allow === 0n, { allowance: allow });
      const one = parseUnits("1", 18);
      await tx("approveSTCRtoFarm", () => c.erc20(c.STCR, wA).approve(dep.farm, one));
      check(rec, "with only STCR approved, staticCall stake(0, 1e18) reverts (farm pulls only the pool's LP)", await reverts(() => farm.stake.staticCall(0, one)));
      const fs = await c.erc20(c.STCR, provider).balanceOf(dep.farm);
      check(rec, "farm holds 0 STCR", fs === 0n, { farmSTCR: fs });
    });

    await test("7-fund-check", async rec => {
      const b = (await provider.getBlockNumber()) - 1;
      const [pools, fund, paid, bal, eA, eB] = await Promise.all([
        Promise.all([0, 1, 2].map(i => farm.pools(i, at(b)))), farm.totalFund(at(b)), farm.totalPaid(at(b)),
        g3.balanceOf(dep.farm, at(b)), totalEarnedAt(A, b), totalEarnedAt(B, b)]);
      const alloc = pools.reduce((s, p) => s + p[4], 0n);
      check(rec, "sum(allocated) <= totalFund", alloc <= fund, { block: b, allocated: alloc, totalFund: fund });
      check(rec, "totalPaid + earned(A) + earned(B) <= totalFund", paid + eA + eB <= fund, { totalPaid: paid, earnedA: eA, earnedB: eB, totalFund: fund });
      check(rec, "farm GROUP3 balance covers totalFund - totalPaid", bal >= fund - paid, { balance: bal, owed: fund - paid });
      check(rec, "totalEarned(A) == sum of earned(A, i)", (await farm.totalEarned(A, at(b))) === eA);
      for (const i of [0, 1, 2]) {
        const lb = await lp[i].balanceOf(dep.farm, at(b));
        check(rec, `farm LP${i} balance covers pool ${i} totalStaked (principal separate from rewards)`, lb >= pools[i][1], { lpBalance: lb, totalStaked: pools[i][1] });
      }
    });

    await test("8-B-claimAll", async rec => {
      const r = await tx("claimAllB", () => farmB.claimAll());
      const b = r.blockNumber, cl = claimedIn(r), d = await g3Delta(B, b);
      check(rec, "claimAll: Claimed events == GROUP3 balance delta, > 0", cl === d && cl > 0n, { block: b, claimed: cl, balanceDelta: d });
      let exp = await totalEarnedAt(B, b - 1);
      for (const i of [0, 1, 2]) exp += (await expected(i, B, b - 1, b)).exp;
      check(rec, "claimAll paid all pools' earned()", close(cl, exp), { claimed: cl, expected: exp });
      check(rec, "totalEarned(B) == 0 right after claimAll", (await farm.totalEarned(B, at(b))) === 0n);
    });
  } else {
    if (now <= END) throw new Error(`campaign still running: wait ${END - now}s more`);
    await test("9-after-end", async rec => {
      const x = (rec.x ??= (await provider.getBlockNumber()) - 1); save();
      if ((await ts(x)) <= END) throw new Error("anchor block not past endTime yet, rerun in a minute");
      const y = await waitAfter(x, 60);
      for (const [n, u] of [["A", A], ["B", B]]) for (const i of [0, 1, 2]) {
        const [ex, ey] = await Promise.all([farm.earned(u, i, at(x)), farm.earned(u, i, at(y))]);
        check(rec, `earned(${n}, ${i}) frozen after endTime`, ex === ey, { x, y, earnedX: ex, earnedY: ey });
      }
      for (const [n, u, f] of [["A", A, farm], ["B", B, farmB]]) {
        const r = await tx(`claimAllAfter${n}`, () => f.claimAll());
        const b = r.blockNumber, cl = claimedIn(r), d = await g3Delta(u, b), e = await totalEarnedAt(u, b - 1);
        check(rec, `${n} claimAll after end pays exactly earned() (no accrual after end)`, cl === d && cl === e, { block: b, claimed: cl, balanceDelta: d, earnedBefore: e });
        check(rec, `${n} totalEarned == 0 after claimAll`, (await farm.totalEarned(u, at(b))) === 0n);
        for (const i of [0, 1, 2]) {
          rec[`stake${n}${i}`] ??= await farm.stakeOf(i, u); save();
          const amt = BigInt(rec[`stake${n}${i}`]);
          if (amt === 0n) continue;
          const wb = (await tx(`withdrawAfter${n}${i}`, () => f.withdraw(i, amt))).blockNumber;
          const got = await lpDelta(i, u, wb);
          check(rec, `${n} full withdraw pool ${i} after end returned all LP`, got === amt && (await farm.stakeOf(i, u, at(wb))) === 0n, { amount: amt, got });
        }
      }
      const b = (await provider.getBlockNumber()) - 1;
      const [pools, fund, paid, bal] = await Promise.all([Promise.all([0, 1, 2].map(i => farm.pools(i, at(b)))),
        farm.totalFund(at(b)), farm.totalPaid(at(b)), g3.balanceOf(dep.farm, at(b))]);
      const alloc = pools.reduce((s, p) => s + p[4], 0n);
      check(rec, "final: totalPaid <= sum(allocated) <= totalFund", paid <= alloc && alloc <= fund,
        { totalPaid: paid, allocated: alloc, totalFund: fund, farmBalance: bal, unallocatedBurned: fund - alloc, totalStaked: pools.map(p => p[1]) });
    });
  }

  const all = Object.values(log.steps).flatMap(s => s.checks || []);
  const n = r => all.filter(x => x.result === r).length;
  console.log(`\nresults so far: ${n("PASS")} PASS, ${n("FAIL")} FAIL, ${n("SKIP")} SKIP -> onchain-tests.json`);
  if (n("FAIL")) process.exit(1);
})().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
