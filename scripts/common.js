// Shared bits for the on-chain scripts: provider, artifacts, minimal ABIs, resumable step().
const { JsonRpcProvider, Wallet, Contract, formatUnits } = require("ethers");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const KEYS = "/home/mxn/RTU/BA-sys/sepolia-test-wallets.json"; // read at runtime only, never printed

const UNI = {
  router: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
  factory: "0xF62c03E08ada871A0bEb309762E260a7a6a880E6",
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
};
const STCR = "0xF482674A7250dcF818cE8936946B5Bad30F0AFDD";
const CAFE = "0x65BE388dC442AB1A6E64712dE1cE6Bb50c8dC323";
const SLV072 = "0x08945bC23e0022AE2876998EA5fd29F952A3F3E8"; // Dzoanna's personal token
const DZOANNA = "0x99aeA2Da85075D4283A347011883bc299c259d6A";

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
const PAIR_ABI = [...ERC20_ABI,
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)",
];
const ROUTER_ABI = ["function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)"];
const FACTORY_ABI = ["function getPair(address,address) view returns (address)", "function createPair(address,address) returns (address)"];

function art(name) {
  const p = path.join(ROOT, "artifacts/contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`missing artifact ${p} (run npx hardhat compile)`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function connect() {
  const provider = new JsonRpcProvider(RPC);
  if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error("Not Sepolia");
  return provider;
}

function wallets(provider) {
  const keys = JSON.parse(fs.readFileSync(KEYS, "utf8"));
  return { A: new Wallet(keys.walletA.privateKey, provider), B: new Wallet(keys.walletB.privateKey, provider) };
}

const json = o => JSON.stringify(o, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2);

function loadState(file) {
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  return { state, save: () => fs.writeFileSync(file, json(state)) };
}

// Same pattern as token-tools/deploy.js: hash saved before waiting, rerun skips done steps.
// Extension: the skip path waits for the stored hash too, so callers always get a confirmed receipt.
function makeStep(provider, state, save) {
  const ok = (name, r) => { if (r.status !== 1) throw new Error(`${name} failed: ${r.hash} (delete "${name}" from the state file to resend)`); return r; };
  return async function step(name, fn) {
    if (state[name]) { console.log(`skip ${name}: ${state[name]}`); return ok(name, await provider.waitForTransaction(state[name])); }
    const tx = await fn();
    console.log(`${name}: sent ${tx.hash}`);
    state[name] = tx.hash; save(); // save hash before waiting, so a rerun never resends
    const r = await tx.wait();
    ok(name, r);
    console.log(`${name}: confirmed in block ${r.blockNumber}`);
    // ponytail: the public RPC is load-balanced and some nodes lag a block; without this pause the next
    // gas estimate can run on stale state (out-of-gas / "transferFrom failed"). Use a dedicated RPC if it still bites.
    await new Promise(res => setTimeout(res, 12000));
    return r;
  };
}

const fmt = (v, d = 18) => formatUnits(v, d);
const erc20 = (addr, runner) => new Contract(addr, ERC20_ABI, runner);

module.exports = { ROOT, UNI, STCR, CAFE, SLV072, DZOANNA, ERC20_ABI, PAIR_ABI, ROUTER_ABI, FACTORY_ABI, art, connect, wallets, json, loadState, makeStep, fmt, erc20 };
