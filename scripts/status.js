// Read-only dump of the deployment: farm state, pools, A/B stakes, earned, balances. Sends nothing, needs no keys.
const { Contract } = require("ethers");
const path = require("path");
const c = require("./common");

(async () => {
  const provider = await c.connect();
  const { state: d } = c.loadState(path.join(c.ROOT, "deployments.json"));
  if (!d.groupToken) return console.log("nothing deployed yet (deployments.json empty)");
  const users = [["A", d.deployer], ["B", d.reserveWallet]];
  const g3 = c.erc20(d.groupToken, provider);
  const iso = t => (t ? new Date(Number(t) * 1000).toISOString() : "-");
  const now = (await provider.getBlock("latest")).timestamp;
  console.log(`block time ${now} (${iso(now)})\nGROUP3 ${d.groupToken}  supply ${c.fmt(await g3.totalSupply())}`);
  for (const [n, u] of users)
    console.log(`  ${n} ${u}: GROUP3 ${c.fmt(await g3.balanceOf(u))}, ETH ${c.fmt(await provider.getBalance(u))}`);

  const pairs = (d.pairs || []).map(p => ({ ...p, ct: new Contract(p.pair, c.PAIR_ABI, provider) }));
  for (const p of pairs) {
    const [r0, r1] = await p.ct.getReserves();
    const bals = await Promise.all(users.map(([, u]) => p.ct.balanceOf(u)));
    console.log(`pool ${p.poolId} ${p.symbol} ${p.pair}: reserves ${c.fmt(r0)} / ${c.fmt(r1)} (token0 ${p.token0}), LP A ${c.fmt(bals[0])}, B ${c.fmt(bals[1])}`);
  }
  if (!d.farm) return console.log("farm not deployed yet");

  const farm = new Contract(d.farm, c.art("GroupFarm").abi, provider);
  const [st, en, dur, rpp, fund, paid, bal, owner] = await Promise.all([farm.startTime(), farm.endTime(), farm.duration(),
    farm.rewardPerPool(), farm.totalFund(), farm.totalPaid(), g3.balanceOf(d.farm), farm.owner()]);
  const phase = st === 0n ? "not started" : BigInt(now) < en ? `running, ${en - BigInt(now)}s left` : "ended";
  console.log(`\nGroupFarm ${d.farm} (owner ${owner}): ${phase}`);
  console.log(`  start ${iso(st)}, end ${iso(en)}, duration ${dur}s, rewardPerPool ${c.fmt(rpp)}`);
  console.log(`  totalFund ${c.fmt(fund)}, totalPaid ${c.fmt(paid)}, GROUP3 held ${c.fmt(bal)}`);
  for (let i = 0; i < 3; i++) {
    const [lpToken, totalStaked, acc, lastUpdate, allocated] = await farm.pools(i);
    console.log(`  pool ${i} LP ${lpToken}: totalStaked ${c.fmt(totalStaked)}, allocated ${c.fmt(allocated)}, acc ${acc}, lastUpdate ${lastUpdate}`);
    for (const [n, u] of users) {
      const [s, e] = await Promise.all([farm.stakeOf(i, u), farm.earned(u, i)]);
      if (s || e) console.log(`    ${n}: stake ${c.fmt(s)}, earned ${c.fmt(e)}`);
    }
  }
  for (const [n, u] of users) console.log(`  totalEarned ${n}: ${c.fmt(await farm.totalEarned(u))}`);
})().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
