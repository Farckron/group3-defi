// Deploy GROUP3, move the reserve to wallet B, seed 3 Uniswap v2 pools, deploy + fund GroupFarm.
// Pool 2 is Dzoanna's SLV072 pool: until her SLV072 reaches wallet A the pair is only created (empty);
// rerun after her transfer to add the liquidity and send the LP to her wallet.
// Does NOT start the session (scripts/start.js does). Resumable via deployments.json.
// Env: FARM_DURATION seconds (default 7200), FARM_REWARD whole GROUP3 per pool (default 40000).
const { ContractFactory, Contract, parseUnits, getAddress } = require("ethers");
const path = require("path");
const c = require("./common");

const DURATION = BigInt(process.env.FARM_DURATION || 7200);
const REWARD = parseUnits(process.env.FARM_REWARD || "40000", 18);
const RESERVE = parseUnits("99580000", 18);
const POOLS = [
  { symbol: "STCR", token: () => c.STCR, amount: "5000" },
  { symbol: "CAFE", token: () => c.CAFE, amount: "80000" },
  { symbol: "SLV072", token: () => c.SLV072, amount: "50000", lpTo: c.DZOANNA },
];
const G3_PER_POOL = parseUnits("100000", 18);

(async () => {
  const provider = await c.connect();
  const { A: signer, B } = c.wallets(provider);
  const { state, save } = c.loadState(path.join(c.ROOT, "deployments.json"));
  const step = c.makeStep(provider, state, save);
  Object.assign(state, { network: "sepolia", chainId: 11155111, deployer: signer.address, reserveWallet: B.address,
    router: c.UNI.router, factory: c.UNI.factory, stcr: c.STCR, cafe: c.CAFE, slv072: c.SLV072, dzoanna: c.DZOANNA }); save();

  async function deploy(key, name, args = []) {
    // Redeploy if the address or its tx hash is missing (the failed-tx message tells the user to delete the hash).
    if (!state[key] || !state[`${key}DeployTx`]) {
      const { abi, bytecode } = c.art(name);
      const ct = await new ContractFactory(abi, bytecode, signer).deploy(...args);
      state[key] = await ct.getAddress(); save();
      console.log(`${name} at ${state[key]}`);
      return step(`${key}DeployTx`, async () => ct.deploymentTransaction());
    }
    console.log(`skip deploy ${name}: ${state[key]}`);
    return step(`${key}DeployTx`); // hash is stored, so step() only waits for it
  }

  // 1. tokens
  await deploy("groupToken", "GroupToken");
  const g3 = c.erc20(state.groupToken, signer);
  const [sym, supply] = await Promise.all([g3.symbol(), g3.totalSupply()]);
  if (sym !== "GROUP3" || supply !== parseUnits("100000000", 18)) throw new Error(`GROUP3 check failed: ${sym} ${supply}`);
  console.log(`GROUP3 supply ${c.fmt(supply)}`);

  // 2. reserve to wallet B (documented, never used)
  await step("reserveTx", () => g3.transfer(B.address, RESERVE));

  // 3. pools
  const factory = new Contract(c.UNI.factory, c.FACTORY_ABI, signer);
  const router = new Contract(c.UNI.router, c.ROUTER_ABI, signer);
  state.pairs ||= [];
  for (const [i, p] of POOLS.entries()) {
    const tokenAddr = p.token(state);
    const token = c.erc20(tokenAddr, signer);
    const amt = parseUnits(p.amount, 18);
    if (!state[`addLiquidity${i}Tx`]) {
      const [tb, gb] = await Promise.all([token.balanceOf(signer.address), g3.balanceOf(signer.address)]);
      if (tb < amt && p.lpTo) {
        // her tokens not here yet: create the empty pair so the farm can fix its LP address now
        if ((await factory.getPair(tokenAddr, state.groupToken)) === "0x0000000000000000000000000000000000000000")
          await step(`createPair${i}Tx`, () => factory.createPair(tokenAddr, state.groupToken));
        state.pairAddr ||= {}; state.pairAddr[i] = await factory.getPair(tokenAddr, state.groupToken); save();
        console.log(`pool ${i} ${p.symbol}/GROUP3: pair ${state.pairAddr[i]} created EMPTY (A has ${c.fmt(tb)} ${p.symbol}); rerun after the transfer`);
        continue;
      }
      if (tb < amt || gb < G3_PER_POOL) throw new Error(`pool ${i}: A has ${c.fmt(tb)} ${p.symbol}, ${c.fmt(gb)} GROUP3`);
    }
    await step(`approve${p.symbol}Tx`, () => token.approve(c.UNI.router, amt));
    await step(`approveGroup${i}Tx`, () => g3.approve(c.UNI.router, G3_PER_POOL));
    await step(`addLiquidity${i}Tx`, () => router.addLiquidity(tokenAddr, state.groupToken, amt, G3_PER_POOL,
      amt * 99n / 100n, G3_PER_POOL * 99n / 100n, signer.address, Math.floor(Date.now() / 1000) + 1200));

    if (!state.pairs[i]) {
      const pairAddr = await factory.getPair(tokenAddr, state.groupToken);
      const pair = new Contract(pairAddr, c.PAIR_ABI, provider);
      const [t0, t1, [r0, r1], lp] = await Promise.all([pair.token0(), pair.token1(), pair.getReserves(), pair.balanceOf(signer.address)]);
      const tokIs0 = getAddress(t0) === getAddress(tokenAddr);
      const [rTok, rG3] = tokIs0 ? [r0, r1] : [r1, r0];
      if (rTok !== amt || rG3 !== G3_PER_POOL) console.warn(`WARNING pool ${i}: reserves ${c.fmt(rTok)}/${c.fmt(rG3)} differ from seeded amounts (pair touched since?)`);
      state.pairs[i] = { poolId: i, symbol: `${p.symbol}/GROUP3`, token: tokenAddr, pair: pairAddr, token0: t0, token1: t1,
        reserves: { reserve0: r0.toString(), reserve1: r1.toString() }, lp: lp.toString(), addLiquidityTx: state[`addLiquidity${i}Tx`] };
      save();
    }
    if (p.lpTo) { // the LP of Dzoanna's pool belongs to her
      const pair = c.erc20(state.pairs[i].pair, signer);
      await step(`lpTo${i}Tx`, () => pair.transfer(p.lpTo, BigInt(state.pairs[i].lp)));
      state.pairs[i].lpOwner = p.lpTo; save();
    }
    console.log(`pool ${i} ${state.pairs[i].symbol}: pair ${state.pairs[i].pair}, LP ${c.fmt(state.pairs[i].lp)} to ${p.lpTo || "A"}`);
  }

  // 4. farm
  const pairs = [0, 1, 2].map(i => state.pairs[i]?.pair || state.pairAddr?.[i]);
  if (pairs.some(x => !x)) throw new Error("missing pair address");
  await deploy("farm", "GroupFarm", [state.groupToken, pairs, DURATION, REWARD]);
  const farm = new Contract(state.farm, c.art("GroupFarm").abi, signer);
  const [rt, dur, rpp] = await Promise.all([farm.rewardToken(), farm.duration(), farm.rewardPerPool()]);
  if (getAddress(rt) !== getAddress(state.groupToken)) throw new Error("farm reward token mismatch");
  if (dur !== DURATION || rpp !== REWARD) throw new Error(`farm on chain has duration ${dur}, reward ${c.fmt(rpp)}; env asks ${DURATION}, ${c.fmt(REWARD)}. Unset env or use a fresh deployments.json`);
  for (let i = 0; i < 3; i++) if (getAddress((await farm.pools(i))[0]) !== getAddress(pairs[i])) throw new Error(`farm pool ${i} LP mismatch`);
  state.farmDuration = dur.toString(); state.farmRewardPerPool = rpp.toString(); save();
  await step("farmFundTx", () => g3.transfer(state.farm, 3n * rpp)); // from chain, never from env

  // summary
  const [fb, ab, bb] = await Promise.all([g3.balanceOf(state.farm), g3.balanceOf(signer.address), g3.balanceOf(B.address)]);
  console.log("\n=== summary ===");
  console.log(`GROUP3      ${state.groupToken}`);
  for (const p of state.pairs.filter(Boolean)) console.log(`pool ${p.poolId} ${p.symbol.padEnd(12)} ${p.pair}`);
  console.log(`GroupFarm   ${state.farm}  duration ${dur}s, ${c.fmt(rpp)} GROUP3/pool`);
  console.log(`GROUP3: farm ${c.fmt(fb)}, A ${c.fmt(ab)}, reserve B ${c.fmt(bb)}`);
  console.log("Session NOT started. Next: node scripts/start.js");
  console.log("deployer ETH left:", c.fmt(await provider.getBalance(signer.address)));
})().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
