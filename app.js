import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js";

// ---- Configuration (addresses live in config.js) ----
const C = window.CONFIG;
const SEPOLIA_HEX = "0x" + C.chainId.toString(16); // 0xaa36a7
const EXPLORER = "https://sepolia.etherscan.io";
const REFRESH_MS = 5000;
const RPC = C.rpc || "https://ethereum-sepolia-rpc.publicnode.com";

// OpenZeppelin 5 custom errors, so a revert shows a readable reason.
const OZ_ERRORS = [
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error SafeERC20FailedOperation(address token)",
  "error OwnableUnauthorizedAccount(address account)",
  "error ReentrancyGuardReentrantCall()",
];
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  ...OZ_ERRORS,
];
const PAIR_ABI = [
  ...ERC20_ABI,
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];
// Matches the frozen GroupFarm interface.
const FARM_ABI = [
  "function startSession()",
  "function stake(uint256 poolId, uint256 amount)",
  "function withdraw(uint256 poolId, uint256 amount)",
  "function claim(uint256 poolId)",
  "function claimAll()",
  "function earned(address account, uint256 poolId) view returns (uint256)",
  "function totalEarned(address account) view returns (uint256)",
  "function stakeOf(uint256 poolId, address account) view returns (uint256)",
  "function pools(uint256 poolId) view returns (address lpToken, uint256 totalStaked, uint256 accRewardPerShare, uint256 lastUpdate, uint256 allocated)",
  "function rewardToken() view returns (address)",
  "function duration() view returns (uint256)",
  "function rewardPerPool() view returns (uint256)",
  "function startTime() view returns (uint256)",
  "function endTime() view returns (uint256)",
  "function totalFund() view returns (uint256)",
  "function totalPaid() view returns (uint256)",
  ...OZ_ERRORS,
];

// ---- State ----
const $ = (id) => document.getElementById(id);
const isAddr = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a) && a !== ethers.ZeroAddress;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const farmOk = isAddr(C.farm);
const groupOk = isAddr(C.groupToken);

// All reads go through the public RPC, so the page works without a wallet or on the wrong chain.
const ro = new ethers.JsonRpcProvider(RPC, C.chainId, { staticNetwork: true });
const farmRO = farmOk ? new ethers.Contract(C.farm, FARM_ABI, ro) : null;
const groupRO = groupOk ? new ethers.Contract(C.groupToken, ERC20_ABI, ro) : null;

let account = null;   // connected address or null
let onSepolia = false;
let pending = false;  // a transaction is in flight: all action buttons disabled
let gen = 0;          // refresh generation: older refreshes must not overwrite newer ones
let inflight = null;  // current refresh promise (the timer skips a tick while one runs)
let camp = null;      // last campaign read: { start, end, ... } as bigint
const pools = C.pools.map((p) => ({ ...p, ok: isAddr(p.pair), info: null, data: null, el: null }));

// ---- Formatting ----
const fmt = (v) => Number(ethers.formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 6 });
const when = (s) => new Date(Number(s) * 1000).toLocaleString();
function hms(sec) {
  const s = Math.max(0, Math.floor(sec));
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
function link(href, text) {
  const a = document.createElement("a");
  a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = text;
  return a;
}
const addrLink = (a) => { const l = link(`${EXPLORER}/address/${a}`, a); l.className = "addr"; return l; };

// Transaction state line: text, optional class, optional tx hash (rendered as Etherscan link).
function setStatus(el, text, cls = "", hash = null) {
  el.className = `status ${cls}`;
  el.textContent = text;
  if (hash) { el.append(" "); el.append(link(`${EXPLORER}/tx/${hash}`, `${hash.slice(0, 10)}...`)); }
}

// ---- Static layout ----
function renderPools() {
  const tpl = $("poolTpl");
  for (const p of pools) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const f = (name) => node.querySelector(`[data-f="${name}"]`);
    p.el = f;
    f("id").textContent = p.poolId;
    f("name").textContent = `Pool ${p.poolId}`;
    if (p.ok) { f("lp").textContent = ""; f("lp").append(addrLink(p.pair)); }
    f("maxLp").addEventListener("click", () => fillMax(p, "lpBal"));
    f("maxStake").addEventListener("click", () => fillMax(p, "stake"));
    // Pre-send reads can fail (RPC down): show it instead of an unhandled rejection.
    const on = (b, fn) => f(b).addEventListener("click", () => fn(p).catch((e) => {
      console.error(e); setStatus(f("status"), `Could not read from Sepolia: ${e.shortMessage || e.message}`, "bad");
    }));
    on("approve", doApprove); on("stakeBtn", doStake); on("withdraw", doWithdraw); on("claim", doClaim);
    $("pools").append(node);
  }
}

function renderNotDeployed() {
  const missing = [];
  if (!groupOk) missing.push("GROUP3 token");
  if (!farmOk) missing.push("GroupFarm");
  for (const p of pools) if (!p.ok) missing.push(`pool ${p.poolId} pair`);
  if (!missing.length) return;
  $("notDeployed").hidden = false;
  $("notDeployedMsg").textContent = `Contract addresses are not configured yet: ${missing.join(", ")}. `
    + "Data and actions for these parts appear after deployment (config.js).";
}

// ---- Reads ----
async function pairInfo(p) {
  const pair = new ethers.Contract(p.pair, PAIR_ABI, ro);
  const [t0, t1] = await Promise.all([pair.token0(), pair.token1()]);
  const erc = (a) => new ethers.Contract(a, ERC20_ABI, ro);
  const [s0, s1] = await Promise.all([erc(t0).symbol(), erc(t1).symbol()]);
  // Show the personal token first, GROUP3 second.
  const flip = groupOk && same(t0, C.groupToken);
  return { other: flip ? t1 : t0, group: flip ? t0 : t1, name: flip ? `${s1} / ${s0}` : `${s0} / ${s1}` };
}

async function readPool(p, acct) {
  if (!p.ok) return null;
  p.info ||= await pairInfo(p);
  const lp = new ethers.Contract(p.pair, PAIR_ABI, ro);
  const [pool, lpBal, stake, allowance, earned] = await Promise.all([
    farmOk ? farmRO.pools(p.poolId) : null,
    acct ? lp.balanceOf(acct) : null,
    acct && farmOk ? farmRO.stakeOf(p.poolId, acct) : null,
    acct && farmOk ? lp.allowance(acct, C.farm) : null,
    acct && farmOk ? farmRO.earned(acct, p.poolId) : null,
  ]);
  return { lpToken: pool?.lpToken, total: pool?.totalStaked ?? null, lpBal, stake, allowance, earned };
}

async function readCampaign(acct) {
  if (!farmOk) return null;
  const [start, end, fund, paid, duration, perPool, balance, earned] = await Promise.all([
    farmRO.startTime(), farmRO.endTime(), farmRO.totalFund(), farmRO.totalPaid(),
    farmRO.duration(), farmRO.rewardPerPool(),
    groupOk ? groupRO.balanceOf(C.farm) : null,
    acct ? farmRO.totalEarned(acct) : null,
  ]);
  return { start, end, fund, paid, duration, perPool, balance, earned };
}

// Each part catches its own error so one bad contract does not blank the whole page.
const safe = (pr) => pr.catch((e) => { console.error(e); return { error: true }; });

async function load(my) {
  const acct = account;
  const [c, gBal, ...ps] = await Promise.all([
    safe(readCampaign(acct)),
    safe(groupOk && acct ? groupRO.balanceOf(acct) : Promise.resolve(null)),
    ...pools.map((p) => safe(readPool(p, acct))),
  ]);
  if (my !== gen) return;
  camp = c?.error ? null : c;
  renderCampaign(c);
  $("groupBal").textContent = gBal?.error ? "read error" : gBal === null ? "-" : `${fmt(gBal)} GROUP3`;
  ps.forEach((d, i) => renderPool(pools[i], d));
  updateButtons();
}

function refresh() {
  const my = ++gen;
  inflight = load(my).catch(console.error).finally(() => { if (my === gen) inflight = null; });
  return inflight;
}

// ---- Render ----
function renderCampaign(c) {
  if (!farmOk) {
    for (const id of ["campStatus", "campStart", "campEnd", "campLeft", "campFund", "campPaid", "campBalance"]) $(id).textContent = "-";
    $("campStatus").textContent = "not deployed yet";
    $("farmLink").textContent = "not deployed yet";
    $("totalEarned").textContent = "-";
    return;
  }
  $("farmLink").textContent = ""; $("farmLink").append(addrLink(C.farm));
  if (c?.error) { $("campStatus").textContent = "read error"; return; }
  const started = c.start > 0n;
  $("campStart").textContent = started ? when(c.start) : "-";
  $("campEnd").textContent = started ? when(c.end) : "-";
  $("campFund").textContent = started
    ? `${fmt(c.fund)} GROUP3`
    : `${fmt(c.perPool * 3n)} GROUP3 planned (3 × ${fmt(c.perPool)}), recorded at start`;
  $("campPaid").textContent = `${fmt(c.paid)} GROUP3`;
  $("campBalance").textContent = c.balance === null ? "-" : `${fmt(c.balance)} GROUP3`;
  $("totalEarned").textContent = c.earned === null ? "-" : fmt(c.earned);
  tick();
}

// Live status + countdown, every second from the last read campaign times (local clock).
function tick() {
  if (!camp) return;
  const now = Date.now() / 1000;
  const st = $("campStatus"), left = $("campLeft");
  if (camp.start === 0n) {
    st.className = "warn"; st.textContent = "not started";
    left.textContent = `${hms(Number(camp.duration))} (starts when the owner calls startSession)`;
  } else if (now < Number(camp.end)) {
    st.className = "ok"; st.textContent = "active";
    left.textContent = hms(Number(camp.end) - now);
  } else {
    st.className = "muted"; st.textContent = "ended";
    left.textContent = "00:00:00 (claim and withdraw still work)";
  }
}

function renderPool(p, d) {
  const f = p.el;
  if (!p.ok) { f("name").textContent = `Pool ${p.poolId}: not deployed yet`; p.data = null; return; }
  // Read errors go to their own line so they never overwrite the tx state line.
  if (d?.error) { f("err").textContent = "Could not read this pool on Sepolia."; return; }
  f("err").textContent = "";
  p.data = d;
  f("name").textContent = p.info.name;
  const show = (v) => (v === null ? "-" : `${fmt(v)} LP`);
  f("lpBal").textContent = show(d.lpBal);
  f("stake").textContent = show(d.stake);
  f("total").textContent = farmOk ? show(d.total) : "farm not deployed yet";
  f("allow").textContent = show(d.allowance);
  f("earned").textContent = d.earned === null ? "-" : fmt(d.earned);
  f("share").textContent = d.stake === null || d.total === null ? "-"
    : `${d.total === 0n ? 0 : Number((d.stake * 10000n) / d.total) / 100}%`;
  if (d.lpToken && !same(d.lpToken, p.pair)) {
    f("err").textContent = `Warning: farm pool ${p.poolId} uses LP ${d.lpToken}, config says ${p.pair}.`;
  }
  const links = f("links");
  if (!links.childElementCount) {
    const uni = `https://app.uniswap.org/positions/create/v2?chain=sepolia&currencyA=${p.info.other}&currencyB=${p.info.group}`;
    links.append("Manage liquidity: ", link(uni, "add on Uniswap v2"), " · ", link("https://app.uniswap.org/positions", "your positions / remove"),
      " · ", link(`${EXPLORER}/address/${C.router}#writeContract`, "removeLiquidity via Router"), " · ", link(`${EXPLORER}/address/${p.pair}`, "pair on Etherscan"));
  }
}

function updateButtons() {
  const canTx = !!account && onSepolia && !pending && farmOk;
  $("claimAllBtn").disabled = !canTx;
  for (const p of pools) {
    const f = p.el;
    for (const b of ["approve", "stakeBtn", "withdraw", "claim"]) f(b).disabled = !(canTx && p.ok);
    f("maxLp").disabled = !(p.data?.lpBal != null);
    f("maxStake").disabled = !(p.data?.stake != null);
  }
}

// ---- Wallet / chain ----
async function refreshWallet() {
  try {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    onSepolia = chainId.toLowerCase() === SEPOLIA_HEX;
    $("chainMsg").className = onSepolia ? "ok" : "warn";
    $("chainMsg").textContent = onSepolia
      ? "Network: Sepolia"
      : `Wrong network (chain ${parseInt(chainId, 16)}). Read-only until you switch to Sepolia.`;
  } catch (err) {
    console.error(err);
    onSepolia = false;
    $("chainMsg").className = "bad";
    $("chainMsg").textContent = `Could not read the network from the wallet: ${err.message}`;
  }
  $("account").textContent = account || "not connected";
  $("connectBtn").textContent = account ? "Connected" : "Connect Wallet";
  $("switchBtn").hidden = onSepolia;
  updateButtons();
}

async function connect() {
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    account = accounts[0] || null;
    $("walletMsg").textContent = "";
    await refreshWallet();
    await refresh();
  } catch (err) {
    $("walletMsg").className = err.code === 4001 ? "warn" : "bad";
    $("walletMsg").textContent = err.code === 4001 ? "Connection cancelled." : `Could not connect: ${err.message}`;
  }
}

async function switchToSepolia() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_HEX }] });
  } catch (err) {
    // MetaMask Mobile nests the code in data.originalError.
    const code = err.code ?? err.data?.originalError?.code;
    try {
      if (code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: SEPOLIA_HEX, chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [RPC], blockExplorerUrls: [EXPLORER],
          }],
        });
      } else throw err;
    } catch (e) {
      $("walletMsg").className = (e.code ?? code) === 4001 ? "warn" : "bad";
      $("walletMsg").textContent = (e.code ?? code) === 4001 ? "Network switch cancelled." : `Could not switch network: ${e.message}`;
    }
  }
  // chainChanged listener refreshes the page state.
}

// ---- Transactions ----
function revertReason(err) {
  if (err.revert) return `${err.revert.name}(${err.revert.args.join(", ")})`;
  return err.reason || err.shortMessage || err.message;
}

// waiting for wallet confirmation -> sent (hash) -> confirmed in block N | failed: reason.
// Only receipt.status === 1 is shown as confirmed.
async function runTx(el, label, send) {
  pending = true;
  updateButtons();
  let tx = null;
  try {
    // Fresh chain + account check: cached state may be stale.
    const cid = await window.ethereum.request({ method: "eth_chainId" });
    if (cid.toLowerCase() !== SEPOLIA_HEX) return setStatus(el, `${label} failed: wallet is not on Sepolia.`, "bad");
    const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
    if (!account || !same(signer.address, account)) return setStatus(el, `${label} failed: account changed, try again.`, "bad");

    setStatus(el, `${label}: waiting for wallet confirmation...`);
    tx = await send(signer);
    setStatus(el, `${label}: sent, waiting for confirmation`, "", tx.hash);
    // ethers v6: wait() throws CALL_EXCEPTION on revert and TRANSACTION_REPLACED on speed up/cancel.
    const r = await tx.wait();
    if (r.status === 1) setStatus(el, `${label}: confirmed in block ${r.blockNumber}.`, "ok", tx.hash);
    else setStatus(el, `${label} failed: reverted on chain.`, "bad", tx.hash);
  } catch (err) {
    if (err.code === "ACTION_REJECTED" || err.code === 4001 || err.info?.error?.code === 4001) {
      setStatus(el, `${label}: rejected in wallet.`, "warn");
    } else if (err.code === "TRANSACTION_REPLACED" && !err.cancelled) {
      // Sped up in the wallet: same action, new hash.
      if (err.receipt?.status === 1) setStatus(el, `${label}: confirmed in block ${err.receipt.blockNumber}.`, "ok", err.replacement.hash);
      else setStatus(el, `${label} failed on chain.`, "bad", err.replacement?.hash);
    } else if (err.code === "TRANSACTION_REPLACED") {
      setStatus(el, `${label}: cancelled or replaced in wallet.`, "warn", err.replacement?.hash);
    } else {
      console.error(err);
      setStatus(el, `${label} failed: ${revertReason(err)}`, "bad", tx?.hash);
    }
  } finally {
    pending = false;
    await refresh();
  }
}

// Parse the amount input (18 decimals). Returns bigint or null (and writes the error).
function parseAmount(p, max, maxName) {
  const f = p.el, text = f("amount").value.trim();
  const fail = (msg) => { setStatus(f("status"), msg, "bad"); return null; };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return fail("Enter a positive number, for example 1 or 0.5.");
  let v;
  try { v = ethers.parseUnits(text, 18); } catch { return fail("Too many decimal places (max 18)."); }
  if (v <= 0n) return fail("Amount must be greater than zero.");
  if (v > max) return fail(`Amount exceeds ${maxName} (${ethers.formatUnits(max, 18)} LP).`);
  return v;
}

function fillMax(p, key) {
  const v = p.data?.[key];
  if (v != null) p.el("amount").value = ethers.formatUnits(v, 18); // exact value, not the rounded display
}

const lpOf = (p, runner) => new ethers.Contract(p.pair, PAIR_ABI, runner);
const farmOf = (runner) => new ethers.Contract(C.farm, FARM_ABI, runner);

async function doApprove(p) {
  const bal = await lpOf(p, ro).balanceOf(account);
  const v = parseAmount(p, bal, "your LP balance");
  if (v !== null) await runTx(p.el("status"), "Approve", (s) => lpOf(p, s).approve(C.farm, v));
}

async function doStake(p) {
  const lp = lpOf(p, ro);
  const [bal, allowance] = await Promise.all([lp.balanceOf(account), lp.allowance(account, C.farm)]);
  const v = parseAmount(p, bal, "your LP balance");
  if (v === null) return;
  if (allowance < v) return setStatus(p.el("status"), `Approve at least ${ethers.formatUnits(v, 18)} LP first (approved: ${ethers.formatUnits(allowance, 18)}).`, "bad");
  await runTx(p.el("status"), "Stake", (s) => farmOf(s).stake(p.poolId, v));
}

async function doWithdraw(p) {
  const staked = await farmRO.stakeOf(p.poolId, account);
  const v = parseAmount(p, staked, "your stake");
  if (v !== null) await runTx(p.el("status"), "Withdraw", (s) => farmOf(s).withdraw(p.poolId, v));
}

const doClaim = (p) => runTx(p.el("status"), "Claim", (s) => farmOf(s).claim(p.poolId));
const doClaimAll = () => runTx($("claimAllStatus"), "Claim all", (s) => farmOf(s).claimAll());

// ---- Start ----
async function init() {
  renderPools();
  renderNotDeployed();
  updateButtons();
  setInterval(() => { if (!inflight) refresh(); }, REFRESH_MS);
  setInterval(tick, 1000);
  $("claimAllBtn").addEventListener("click", doClaimAll);

  if (!window.ethereum) {
    $("walletMsg").className = "warn";
    $("walletMsg").textContent = "No wallet detected (install MetaMask to stake). Read-only mode.";
    $("connectBtn").disabled = true;
    return refresh();
  }

  $("connectBtn").addEventListener("click", connect);
  $("switchBtn").addEventListener("click", switchToSepolia);
  window.ethereum.on("accountsChanged", (accounts) => {
    account = accounts[0] || null;
    refreshWallet();
    refresh();
  });
  window.ethereum.on("chainChanged", () => { refreshWallet(); refresh(); });

  // Silent reconnect if this site was already authorised (no popup).
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    account = accounts[0] || null;
  } catch (err) { console.error(err); }
  await refreshWallet();
  await refresh();
}

init();
