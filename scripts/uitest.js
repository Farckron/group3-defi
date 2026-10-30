// UI test of the Group 3 Farm web app with a scripted EIP-1193 wallet (stand-in for MetaMask,
// same fake wallet as token-tools/uitest.js). Uses wallet B. Keys are read at runtime, never printed.
//   node scripts/uitest.js [url] [--readonly]
// --readonly: the fake wallet refuses every eth_sendTransaction, and the Approve/Stake/Claim/Withdraw
// steps are skipped. Validation, rejection and network checks still run (they never broadcast).
const { chromium } = require("/home/mxn/RTU/BA-sys/token-tools/node_modules/playwright-core");
const { JsonRpcProvider, Contract, formatUnits } = require("ethers");
const fs = require("fs");
const keys = require("/home/mxn/RTU/BA-sys/sepolia-test-wallets.json");

const args = process.argv.slice(2);
const READONLY = args.includes("--readonly");
const URL = args.find((a) => !a.startsWith("--")) || "https://farckron.github.io/group3-defi/";
const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const ROOT = "/home/mxn/RTU/BA-sys/group-farm";
const OUT = `${ROOT}/screenshots`;
const C = { group: "0xba07D78eF160Ce017FBDC4Bf3b2835ac3bcc91C6", farm: "0xA76DEf3427e4BBC696E9F7cCa5906b65a6595B00",
  pairs: ["0x7B9945a8D8ea4507A478F7eC84fFA7a71fF4b8df", "0x47198D03720cF8a28e87483AfcB7fb7b6258FeF8", "0xb49465E7cbbd874C55C1b7139FC8D6CCb7b85e60"],
  names: ["STCR / GROUP3", "CAFE / GROUP3", "SLV072 / GROUP3"] };
const TINY = "0.001"; // LP amount for the real tx flow on pool 1
const B = keys.walletB.address;

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`); };
const shot = (page, name) => page.screenshot({ path: `${OUT}/ui-${name}.png`, fullPage: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeWallet({ pk, chainHex, rpc, readonly }) {
  let chain = chainHex, wallet;
  const listeners = {};
  window.__log = []; window.__reject = false;
  const getW = async () => {
    if (!wallet) {
      const { ethers } = await import("https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js");
      wallet = new ethers.Wallet(pk, new ethers.JsonRpcProvider(rpc));
    }
    return wallet;
  };
  const emit = (e, v) => (listeners[e] || []).forEach((f) => f(v));
  window.ethereum = {
    isMetaMask: true,
    on(e, f) { (listeners[e] ??= []).push(f); },
    removeListener(e, f) { listeners[e] = (listeners[e] || []).filter((x) => x !== f); },
    async request({ method, params }) {
      window.__log.push(method);
      const w = await getW();
      switch (method) {
        case "eth_requestAccounts": case "eth_accounts": return [w.address];
        case "eth_chainId": return chain;
        case "wallet_switchEthereumChain": chain = params[0].chainId; emit("chainChanged", chain); return null;
        case "eth_sendTransaction": {
          if (window.__reject || readonly) { const e = new Error("User rejected the request."); e.code = 4001; throw e; }
          const t = params[0];
          return (await w.sendTransaction({ to: t.to, data: t.data })).hash;
        }
      }
      const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) }).then((r) => r.json());
      if (res.error) { const e = new Error(res.error.message); e.code = res.error.code; e.data = res.error.data; throw e; }
      return res.result;
    },
  };
}

async function openAs(browser, chainHex = "0xaa36a7") {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  await ctx.addInitScript(fakeWallet, { pk: keys.walletB.privateKey, chainHex, rpc: RPC, readonly: READONLY });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(`console: ${m.text()}`); });
  await page.goto(URL + (URL.includes("?") ? "&" : "?") + "t=" + process.pid);
  return page;
}

// UI helpers
const text = (page, sel) => page.locator(sel).innerText();
const pf = (page, i, f) => page.locator(`#pools > article:nth-child(${i + 1}) [data-f="${f}"]`);
const ptext = (page, i, f) => pf(page, i, f).innerText();
const sends = (page) => page.evaluate(() => window.__log.filter((m) => m === "eth_sendTransaction").length);
const num = (s) => parseFloat(String(s).replace(/,/g, ""));
const NUM = /^\d[\d,]*(\.\d+)?( LP| GROUP3)?$/;
// Same formatting as app.js fmt().
const fmt = (v) => Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 6 });

// Chain reads
const ro = new JsonRpcProvider(RPC);
const farm = new Contract(C.farm, ["function stakeOf(uint256,address) view returns (uint256)", "function earned(address,uint256) view returns (uint256)"], ro);
const bal = (token, who) => new Contract(token, ["function balanceOf(address) view returns (uint256)"], ro).balanceOf(who);

// Records every text the pool's status line shows, then clicks; resolves on a final state.
async function poolAction(page, i, btn, amount) {
  await page.evaluate((i) => {
    const el = document.querySelectorAll("#pools > article")[i].querySelector('[data-f="status"]');
    window.__obs?.disconnect();
    el.textContent = ""; // clear the previous result so the wait below sees only this action
    window.__seen = [];
    const rec = () => { if (window.__seen.at(-1) !== el.textContent) window.__seen.push(el.textContent); };
    window.__obs = new MutationObserver(rec);
    window.__obs.observe(el, { childList: true, characterData: true, subtree: true });
  }, i);
  if (amount !== undefined) await pf(page, i, "amount").fill(amount);
  const before = await sends(page);
  await pf(page, i, btn).click();
  await page.waitForFunction((i) => {
    const t = document.querySelectorAll("#pools > article")[i].querySelector('[data-f="status"]').textContent;
    return /confirmed|failed|rejected|Enter a|must be|exceeds|Approve at least|Could not/.test(t);
  }, i, { timeout: 240000 });
  return { status: await ptext(page, i, "status"), seen: await page.evaluate(() => window.__seen), sent: (await sends(page)) - before };
}
const flowOk = (seen) => {
  const at = (re) => seen.findIndex((t) => re.test(t));
  const [w, s, c] = [at(/waiting for wallet confirmation/), at(/sent, waiting for confirmation/), at(/confirmed in block/)];
  return w >= 0 && s > w && c > s;
};

async function connectAndWait(page) {
  await page.click("#connectBtn");
  await page.waitForFunction(() => /\d/.test(document.querySelector("#groupBal").textContent)
    && [...document.querySelectorAll('#pools [data-f="lpBal"]')].every((e) => /\d/.test(e.textContent))
    && /\d/.test(document.querySelector("#campLeft").textContent), null, { timeout: 60000 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  console.log(`URL ${URL}  wallet B ${B}  ${READONLY ? "READONLY (no transactions)" : "FULL (sends 4 transactions from B)"}`);

  // 1. Load + connect on Sepolia
  const page = await openAs(browser);
  await connectAndWait(page);
  await sleep(6000); // one more 5 s refresh cycle, so late errors show up
  check("Page loads without JS errors", page.errors.length === 0, page.errors.length ? page.errors.join(" | ") : "no pageerror / console.error");
  const acct = await text(page, "#account");
  check("Connect shows wallet B", acct.toLowerCase() === B.toLowerCase(), `account="${acct}", button="${await text(page, "#connectBtn")}"`);
  const chainMsg = await text(page, "#chainMsg");
  check("Network shown as Sepolia", /Network: Sepolia/.test(chainMsg) && !(await page.locator("#switchBtn").isVisible()), `chainMsg="${chainMsg}"`);
  const gUi = await text(page, "#groupBal"), gChain = `${fmt(await bal(C.group, B))} GROUP3`;
  check("GROUP3 balance shown", NUM.test(gUi) && gUi === gChain, `UI "${gUi}" vs chain "${gChain}"`);
  const camp = {};
  for (const id of ["campStatus", "campStart", "campEnd", "campLeft", "campFund", "campPaid"]) camp[id] = await text(page, `#${id}`);
  check("Campaign status/start/end/remaining shown",
    /^(active|ended|not started)$/.test(camp.campStatus) && /\d/.test(camp.campStart) && /\d/.test(camp.campEnd) && /\d\d:\d\d:\d\d/.test(camp.campLeft),
    JSON.stringify(camp));
  for (let i = 0; i < 3; i++) {
    const ui = {};
    for (const f of ["name", "lpBal", "stake", "total", "share", "earned"]) ui[f] = await ptext(page, i, f);
    const [lpC, stC] = await Promise.all([bal(C.pairs[i], B), farm.stakeOf(i, B)]);
    const ok = ui.name === C.names[i] && ["lpBal", "stake", "total", "earned"].every((f) => NUM.test(ui[f]))
      && ui.lpBal === `${fmt(lpC)} LP` && ui.stake === `${fmt(stC)} LP`;
    check(`Pool ${i} data shown`, ok, `${JSON.stringify(ui)} chain lpBal=${fmt(lpC)} stake=${fmt(stC)}`);
  }
  await shot(page, "01-connected-b");

  // 2. Validation on pool 1: nothing may reach the wallet
  let r = await poolAction(page, 1, "approve", "0");
  check("Validation: amount 0 refused", r.sent === 0 && /greater than zero/.test(r.status), `status="${r.status}", sends=${r.sent}`);
  r = await poolAction(page, 1, "approve", "999999999");
  check("Validation: above LP balance refused", r.sent === 0 && /exceeds your LP balance/.test(r.status), `status="${r.status}", sends=${r.sent}`);
  await shot(page, "02-validation-above-balance");
  r = await poolAction(page, 1, "withdraw", "999999999");
  check("Validation: withdraw above stake refused", r.sent === 0 && /exceeds your stake/.test(r.status), `status="${r.status}", sends=${r.sent}`);

  // 3. User rejects in the wallet
  await page.evaluate(() => { window.__reject = true; });
  r = await poolAction(page, 1, "approve", TINY);
  check("Wallet rejection shown", /rejected in wallet/.test(r.status) && !r.seen.some((t) => /confirmed|sent,/.test(t)),
    `status="${r.status}", seen=${JSON.stringify(r.seen)}`);
  await shot(page, "03-rejected");
  await page.evaluate(() => { window.__reject = false; });

  // 4. Wrong network: wallet starts on Ethereum mainnet (0x1)
  const pw = await openAs(browser, "0x1");
  await pw.click("#connectBtn");
  await pw.waitForFunction(() => /Wrong network/.test(document.querySelector("#chainMsg").textContent), null, { timeout: 30000 });
  const wrongDisabled = await pf(pw, 0, "stakeBtn").isDisabled() && await pw.locator("#claimAllBtn").isDisabled();
  const switchVisible = await pw.locator("#switchBtn").isVisible();
  check("Wrong network detected", switchVisible && wrongDisabled, `switch visible=${switchVisible}, actions disabled=${wrongDisabled}, chainMsg="${await text(pw, "#chainMsg")}"`);
  await shot(pw, "04-wrong-network");
  await pw.click("#switchBtn");
  await pw.waitForFunction(() => /Network: Sepolia/.test(document.querySelector("#chainMsg").textContent), null, { timeout: 30000 }).catch(() => {});
  await pw.waitForTimeout(1000);
  const okAfter = /Network: Sepolia/.test(await text(pw, "#chainMsg")) && !(await pw.locator("#switchBtn").isVisible()) && !(await pf(pw, 0, "stakeBtn").isDisabled());
  check("Switch to Sepolia works", okAfter, `chainMsg="${await text(pw, "#chainMsg")}", switch hidden, actions enabled`);
  await shot(pw, "05-switched");
  await pw.context().close();

  // 5. Real transactions from the UI (wallet B)
  if (READONLY) {
    console.log("SKIP tx steps (--readonly)");
  } else {
    // The public RPC is load balanced: give lagging nodes time before the next pre-send read (see scripts/common.js).
    const lag = () => sleep(12000);
    const stake1 = await farm.stakeOf(1, B);

    r = await poolAction(page, 1, "approve", TINY);
    check("Approve 0.001 LP pool 1 (waiting -> sent -> confirmed)", flowOk(r.seen) && r.sent === 1, `seen=${JSON.stringify(r.seen)}`);
    await page.waitForFunction(() => document.querySelectorAll('#pools [data-f="allow"]')[1].textContent === "0.001 LP", null, { timeout: 60000 }).catch(() => {});
    await shot(page, "06-approved");
    await lag();

    r = await poolAction(page, 1, "stakeBtn", TINY);
    const want = `${fmt(stake1 + 10n ** 15n)} LP`;
    await page.waitForFunction((w) => document.querySelectorAll('#pools [data-f="stake"]')[1].textContent === w, want, { timeout: 60000 }).catch(() => {});
    const stUi = await ptext(page, 1, "stake");
    check("Stake 0.001 LP pool 1 (waiting -> sent -> confirmed, stake updates)", flowOk(r.seen) && stUi === want,
      `seen=${JSON.stringify(r.seen)}, stake UI "${stUi}" want "${want}"`);
    await shot(page, "07-staked");
    await lag();

    const gBefore = num(await text(page, "#groupBal")), earned0 = await ptext(page, 0, "earned");
    r = await poolAction(page, 0, "claim");
    await page.waitForFunction((b) => parseFloat(document.querySelector("#groupBal").textContent.replace(/,/g, "")) > b, gBefore, { timeout: 60000 }).catch(() => {});
    const gAfter = num(await text(page, "#groupBal"));
    check("Claim pool 0 confirms and GROUP3 balance increases", /confirmed in block/.test(r.status) && gAfter > gBefore,
      `status="${r.status}", earned before=${earned0}, GROUP3 ${gBefore} -> ${gAfter}`);
    await shot(page, "08-claimed");
    await lag();

    r = await poolAction(page, 1, "withdraw", TINY);
    const back = `${fmt(stake1)} LP`;
    await page.waitForFunction((w) => document.querySelectorAll('#pools [data-f="stake"]')[1].textContent === w, back, { timeout: 60000 }).catch(() => {});
    const stBack = await ptext(page, 1, "stake");
    check("Withdraw 0.001 LP pool 1", /confirmed in block/.test(r.status) && stBack === back, `status="${r.status}", stake UI "${stBack}" want "${back}"`);
    await shot(page, "09-withdrawn");
  }

  await browser.close();
  const out = { url: URL, wallet: B, readonly: READONLY, time: new Date().toISOString(),
    passed: results.filter((x) => x.ok).length, total: results.length, results };
  fs.writeFileSync(`${ROOT}/uitest-results${READONLY ? "-readonly" : ""}.json`, JSON.stringify(out, null, 2));
  process.exit(results.every((x) => x.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
