// Start the farm campaign once (owner = wallet A). Resumable: stores startSessionTx in deployments.json.
const { Contract } = require("ethers");
const path = require("path");
const c = require("./common");

(async () => {
  const provider = await c.connect();
  const { A: signer } = c.wallets(provider);
  const { state, save } = c.loadState(path.join(c.ROOT, "deployments.json"));
  if (!state.farm || !state.farmFundTx) throw new Error("farm not deployed/funded yet: run node scripts/deploy.js");
  const step = c.makeStep(provider, state, save);
  const farm = new Contract(state.farm, c.art("GroupFarm").abi, signer);

  if (state.startSessionTx || (await farm.startTime()) === 0n) {
    const [bal, rpp] = await Promise.all([c.erc20(state.groupToken, provider).balanceOf(state.farm), farm.rewardPerPool()]);
    if (!state.startSessionTx && bal < 3n * rpp) throw new Error(`farm holds ${c.fmt(bal)} GROUP3, needs ${c.fmt(3n * rpp)}`);
    await step("startSessionTx", () => farm.startSession());
  } else console.log("session already started (not by this script)");

  const [st, en] = await Promise.all([farm.startTime(), farm.endTime()]);
  state.startTime = Number(st); state.endTime = Number(en); save();
  const iso = t => new Date(Number(t) * 1000).toISOString();
  console.log(`start ${st} (${iso(st)})`);
  console.log(`end   ${en} (${iso(en)})  duration ${en - st}s`);
})().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
