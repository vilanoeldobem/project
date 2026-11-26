// Run with Node from this worktree. A local Vite fixture mounts the game's actual panels; the API and link are synthetic.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {useVila} from '/src/game/store.ts';
import {useAccount, initAccount} from '/src/lib/account.ts';
import {Games} from '/src/ui/Games.tsx';
import {Wardrobe} from '/src/ui/Wardrobe.tsx';
import {Lot} from '/src/ui/Lot.tsx';
import {Missions} from '/src/ui/Missions.tsx';
import {Account} from '/src/ui/Account.tsx';
import {activate} from '/src/ui/Hud.tsx';
await initAccount();
const h=React.createElement;
function Surface(){
  const p=useVila(s=>s.panel);
  if(p.kind==='games') return h(Games);
  if(p.kind==='avatar') return h(Wardrobe);
  if(p.kind==='lot') return h(Lot,{lotId:'plaza-01',info:{id:'plaza-01',state:'published',ngo_id:'ngo-a',ngo_name:'Associação de teste',ngo_summary:'Demo'}});
  if(p.kind==='account') return h(Account,{reason:p.reason});
  if(p.kind==='missions') return h(Missions);
  return h('p',{},p.kind);
}
createRoot(document.getElementById('root')).render(h(Surface));
window.review={store:useVila,account:useAccount,activate};
`;
const staging = process.argv.includes("--staging");
const server = await createServer({
  root, mode: staging ? "staging" : "development", server: { host: "127.0.0.1", port: 0, open: false, hmr: false },
  plugins: [{ name: "local-account-test-page",
    resolveId(id) { if (id === "virtual:account-actions") return "\0" + id; },
    load(id) { if (id === "\0virtual:account-actions") return entry; },
    configureServer(vite) {
    vite.middlewares.use("/check", async (_req,res) => {
      res.setHeader("content-type","text/html");
      res.end(await vite.transformIndexHtml("/check.html", '<div id="root"></div><script type="module" src="/@id/virtual:account-actions"></script>'));
    });
  }}],
});
let browser;
try {
  await server.listen();
  const local = `http://127.0.0.1:${server.httpServer.address().port}`;
  const origin = staging ? "https://play-staging.vilanoeldobem.com.br" : local;
  const api = staging ? "https://api-staging.vilanoeldobem.com.br" : "http://localhost:8787";
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: ["--disable-dev-shm-usage", "--disable-gpu"], env: { ...process.env, TMPDIR:"/tmp", TZ:"UTC" } });
  for (const enabled of [true, false]) {
    const context = await browser.newContext({serviceWorkers:"block"});
    const page = await context.newPage();
    page.setDefaultTimeout(25_000);
    const errors = [], requests = [], visited = [];
    let configUnavailable = staging;
    page.on("pageerror", e => { errors.push(e.message); console.error("Browser:", e.message); });
    const user = { id: "player-a", nickname: "Alice", name: "Alice Teste", email:"a@example.invalid", city:"Vila", role:"player" };
    const initial = { xp:30, completed:{"explore-gifts":true}, counters:{}, seen:{} };
    let active = null;
    await context.addInitScript(({initial, origin}) => {
      if (location.origin !== origin) return;
      if (!localStorage.getItem("seeded")) {
        localStorage.setItem("seeded","1");
        localStorage.setItem("vila.progress.v2",JSON.stringify(initial));
      }
      window.open = url => { window.reviewWindows.push(url); return null; };
      window.reviewWindows = [];
    },{initial, origin});
    if (staging) await context.routeWebSocket("**/*", socket => socket.close());
    await context.route("**/*",async route=>{
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin === origin) {
        if (!staging) return route.continue();
        const asset = await fetch(local + url.pathname + url.search);
        return route.fulfill({status:asset.status, contentType:asset.headers.get("content-type") ?? "application/octet-stream",
          body:Buffer.from(await asset.arrayBuffer())});
      }
      if (url.origin !== api) { visited.push(url.origin); return route.abort(); }
      const headers={"access-control-allow-origin":origin,"access-control-allow-credentials":"true",
        "access-control-allow-headers":"content-type,x-vila-account","access-control-allow-methods":"GET,POST,OPTIONS"};
      if(req.method()==="OPTIONS") return route.fulfill({status:204,headers});
      const path=url.pathname;
      requests.push({path,body:req.postDataJSON()});
      if(path==="/config" && configUnavailable) return route.fulfill({status:503,headers,json:{error:"unavailable"}});
      let body={}, status=200;
      if(path==="/config") body={accounts:true,donations:true,[staging?"stagingAccountActions":"localAccountActions"]:enabled};
      if(path==="/me") body={user:active};
      if(path==="/auth/link") {
        assert.equal(req.postDataJSON().email,user.email);
        body={ok:true,devLink:origin+"/check#login=fixture"};
      }
      if(path==="/auth/verify") { active=user; body={user}; }
      if(path==="/progress"||path==="/progress/events") {
        if (enabled && path==="/progress") assert.equal(req.headers()["x-vila-account"],active.id);
        body={progress:initial};
      }
      if(path.endsWith("/donation-info")) body={ngoId:"ngo-a",enabled:true,method:"external_link",name:"Associação de teste",confirmedDonations:0,confirmedAmountCents:0};
      if(path==="/donations/redirect") {
        if(enabled && req.postDataJSON().accountId!==active?.id) { status=409; body={error:"account_changed"}; }
        else body={url:"https://example.invalid/ong",tracked:true,titleCredit:"none"};
      }
      await route.fulfill({status,headers,json:body});
    });
    const open = kind=>page.evaluate(kind=>window.review.store.getState().open(kind==="lot"?{kind,lotId:"plaza-01"}:{kind}),kind);
    const panel = ()=>page.evaluate(()=>window.review.store.getState().panel.kind);
    const expectPanel=async kind=>{await page.waitForFunction(kind=>window.review.store.getState().panel.kind===kind,kind);};
    const equipment = ()=>page.evaluate(()=>window.review.store.getState().look.helmet);
    const outfit = page.locator('[data-item-id="helmet-beanie"]');
    const goto=async hash=>{await page.goto(origin+"/check"+hash);await page.waitForFunction(()=>!!window.review);};
    await goto("");
    if (staging) {
      const retry=page.getByRole("button",{name:"Consultar configuração novamente"});
      const unchanged=await equipment();
      await open("avatar");
      await outfit.getByRole("button",{name:"Equipar"}).click();
      await retry.waitFor();
      assert.equal(await equipment(),unchanged);
      await open("games");
      await page.getByRole("button",{name:"Jogar",exact:true}).first().click();
      await retry.waitFor();
      await open("lot");
      await expectPanel("lot");
      await retry.waitFor();
      await open("missions");
      await page.getByRole("button",{name:/Concluir missão: Visite/}).click();
      await retry.waitFor();
      assert.equal(await page.getByRole("tab",{name:"Já tenho conta"}).count(),0);
      assert.equal(requests.some(r=>r.path==="/donations/redirect" || r.path==="/progress/events"),false);
      assert.equal(await page.evaluate(()=>window.review.store.getState().progress.xp),initial.xp);
      configUnavailable=false;
      await retry.click();
      await expectPanel("none");
    }
    await open("avatar");
    const before = await equipment();
    await outfit.getByRole("button",{name:/Provar/}).click();
    assert.equal(await equipment(),before);
    await outfit.getByRole("button",{name:"Equipar"}).click();
    if(enabled){
      await expectPanel("account");
      assert.equal(await equipment(),before);
      await page.getByRole("button",{name:"Fechar"}).click();
      await expectPanel("none");
    } else assert.equal(await equipment(),"helmet-beanie");
    await open("games");
    await page.getByRole("button",{name:"Jogar",exact:true}).first().click();
    await expectPanel(enabled?"account":"memory");
    await open("lot");
    await page.getByRole("button",{name:"Jogar gratuitamente"}).click();
    await expectPanel(enabled?"account":"memory");
    assert.equal(await page.evaluate(()=>Boolean(window.review.store.getState().progress.completed["causes-visit-lot"])),!enabled);
    await page.evaluate(()=>window.review.activate({kind:"quest",interactionId:"play-treno-na-neve"}));
    await expectPanel(enabled?"account":"story-game");
    await open("lot");
    await page.getByRole("button",{name:"Abrir página de pagamento da ONG"}).click();
    if(enabled){
      await expectPanel("account");
      assert.ok(!requests.some(r=>r.path==="/donations/redirect"));
      await open("missions");
      await page.getByRole("button",{name:/Concluir missão: Visite/}).click();
      await expectPanel("account");
      await page.getByRole("tab",{name:"Já tenho conta"}).click();
      await page.getByLabel("E-mail da sua conta").fill(user.email);
      await page.getByRole("button",{name:"Enviar link de acesso"}).click();
      const href = await page.getByRole("link",{name:/Abrir link/}).getAttribute("href");
      assert.equal(href,origin+"/check#login=fixture");
      await page.goto("about:blank");
      await goto(new URL(href).hash);
      assert.equal(await panel(),"none");
      assert.deepEqual(await page.evaluate(()=>window.reviewWindows),[]);
      assert.ok(!requests.some(r=>r.path==="/donations/redirect"||r.path==="/progress/events"));
      await open("lot");
      await page.getByRole("button",{name:"Abrir página de pagamento da ONG"}).click();
    }
    await page.waitForFunction(()=>window.reviewWindows.length===1);
    assert.deepEqual(requests.filter(r=>r.path==="/donations/redirect").map(r=>r.body),
      [enabled?{ngoId:"ngo-a",accountId:user.id}:{ngoId:"ngo-a"}]);
    assert.equal(requests.some(r=>r.path==="/donations/pix"),false);
    if(enabled){
      await open("missions");
      await page.getByRole("button",{name:/Concluir missão: Visite/}).click();
      assert.equal(await page.evaluate(()=>window.review.store.getState().progress.xp),50);
      await open("avatar");
      await outfit.getByRole("button",{name:"Equipar"}).click();
      assert.equal(await equipment(),"helmet-beanie");
      await open("games");
      await page.getByRole("button",{name:"Jogar",exact:true}).nth(1).click();
      await expectPanel("story-game");
      // A different login in another tab changes the cookie before the next click. The stale gesture is refused;
      // session reconciliation never retries or opens the new recipient without another click.
      await open("lot");
      active={...user,id:"player-b",nickname:"Beatriz"};
      await page.getByRole("button",{name:"Abrir página de pagamento da ONG"}).click();
      await page.waitForFunction(()=>window.review.store.getState().progressOwner==="player-b");
      assert.equal(await page.evaluate(()=>window.reviewWindows.length),1);
      await page.getByRole("button",{name:"Abrir página de pagamento da ONG"}).click();
      await page.waitForFunction(()=>window.reviewWindows.length===2);
      assert.deepEqual(requests.filter(r=>r.path==="/donations/redirect").map(r=>r.body.accountId),["player-a","player-a","player-b"]);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(visited,[]);
    await context.close();
    console.log(`${staging ? "Staging" : "Local"} account actions (opt-in ${enabled ? "on" : "off"}): OK`);
  }
} finally {
  await browser?.close();
  await server.close();
}
