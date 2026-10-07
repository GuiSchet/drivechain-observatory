import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdirSync} from "node:fs";
const {chromium}=await import(process.env.PULSE_PLAYWRIGHT_MODULE??"playwright");
const api="http://127.0.0.1:18080",base="http://127.0.0.1:13000";
const get=async path=>(await fetch(api+path)).json();
const state=await get("/api/v1/observatory"),dataset=state.context.meta.dataset_id;
const instances=await get("/api/v1/sidechain-instances"),bundles=await get("/api/v1/withdrawal-bundles"),proposals=await get("/api/v1/sidechain-proposals"),auctions=await get("/api/v1/bmm/auctions");
const web=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","13000"],{cwd:new URL("../apps/web/",import.meta.url),stdio:"ignore"});
const artifacts=process.env.PULSE_BROWSER_ARTIFACTS??"/tmp/drivechain-observatory-browser-v7";mkdirSync(artifacts,{recursive:true});
let browser;
try {
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready);
 browser=await chromium.launch({headless:true,executablePath:process.env.PULSE_BROWSER_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce",permissions:["clipboard-read","clipboard-write"]});
 const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.addInitScript(()=>{const Native=window.EventSource;window.__pulseStreams=0;window.__pulseMaxStreams=0;window.EventSource=class extends Native{constructor(...args){super(...args);this.counted=true;window.__pulseStreams++;window.__pulseMaxStreams=Math.max(window.__pulseStreams,window.__pulseMaxStreams);}close(){if(this.counted){window.__pulseStreams--;this.counted=false;}super.close();}};});
 await page.goto(base);await page.getByRole("heading",{name:"Block river",exact:true}).waitFor();await page.locator(".river-block").first().waitFor();
 assert.equal(await page.locator(".river-block").count(),10);await page.screenshot({path:artifacts+"/home.png",fullPage:true});
 await page.getByRole("link",{name:"Sidechains",exact:true}).click();await page.getByRole("heading",{name:"Sidechains",exact:true}).waitFor();await page.locator(".instance-grid .panel").first().waitFor();
 await page.locator(".instance-grid h2 a").first().click();await page.getByRole("heading",{name:"Sidechain slot #9",exact:true}).waitFor();await page.locator(".history-chart svg").first().waitFor();await page.getByRole("button",{name:/Slot 9, block .*present/}).first().click();await page.locator(".selected-cell").waitFor();
 await page.locator("details").filter({has:page.getByText(/Exact chart values/)}).first().locator("summary").click();
 await page.getByRole("cell",{name:"No CTIP",exact:true}).first().waitFor();
 await page.screenshot({path:artifacts+"/sidechain.png"});
 await page.getByRole("link",{name:"BMM auctions",exact:true}).click();await page.getByRole("cell",{name:"18,446,744,073,709,551,615",exact:true}).first().waitFor();
 await page.getByRole("link",{name:"Inspect this observation’s evidence →",exact:true}).click();await page.getByRole("heading",{name:`Event ${auctions.source_event_id}`,exact:true}).waitFor();
 const raw=await page.locator("pre").first().textContent();assert(raw.includes("18446744073709551615"));await page.getByRole("button",{name:"Copy exact JSON",exact:true}).click();await page.getByRole("button",{name:"Copied",exact:true}).waitFor();assert((await page.evaluate(()=>navigator.clipboard.readText())).includes("18446744073709551615"));
 await page.getByRole("link",{name:"Snapshot group",exact:true}).first().click();await page.getByRole("heading",{name:"Snapshot group",exact:true}).waitFor();await page.getByRole("link",{name:"Source run",exact:true}).first().click();await page.getByRole("heading",{name:"Monitor run",exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__pulseMaxStreams),1,"one shared SSE across client navigation");
 const routes=[
  ["/pegs","Pegs and withdrawals"], ["/proposals","Activation proposals"], ["/explorer?resource=protocol-messages","Protocol explorer"], ["/learn","Learn Drivechain"], ["/about/data","About the data"], ["/blocks","Block explorer"],
  [`/sidechain-instances/${encodeURIComponent(instances.items[0].entity_id)}`,"Sidechain instance"], [`/bundle-attempts/${encodeURIComponent(bundles.items[0].entity_id)}`,"Withdrawal attempt"], [`/proposals/${encodeURIComponent(proposals.items[0].entity_id)}`,"Proposal detail"],
  [`/datasets/${dataset}/blocks/${state.context.anchor_hash}`,`Block ${state.context.anchor_height}`]
 ];
 for(const [route,heading] of routes){await page.goto(base+route);await page.getByRole("heading",{name:heading,exact:true}).waitFor();}
 await page.goto(base+"/explorer?resource=search&q="+encodeURIComponent("Pulse Test Chain"));await page.getByRole("heading",{name:"Protocol explorer",exact:true}).waitFor();
 // Shared URL filters and exact export preserve the user's selected view.
 await page.getByLabel("Slot",{exact:true}).fill("9");await page.getByRole("button",{name:"Apply filters",exact:true}).click();await page.waitForURL(/slot=9/);assert((await page.getByRole("link",{name:"Export JSON",exact:true}).getAttribute("href")).includes("slot=9"));
 await page.setViewportSize({width:390,height:844});
 for(const route of ["/","/bmm","/sidechains/9","/pegs","/explorer","/about/data","/learn"]){await page.goto(base+route);await page.locator("h1").waitFor();await page.waitForTimeout(500);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`mobile overflow ${route}`);await page.screenshot({path:artifacts+"/mobile-"+(route.replaceAll("/","-")||"home")+".png"});}
 await page.goto(base+"/bmm");await page.getByRole("cell",{name:"18,446,744,073,709,551,615",exact:true}).first().waitFor();await page.route(api+"/**",r=>r.abort());await page.getByRole("heading",{name:"API unavailable",exact:true}).waitFor({timeout:25000});await page.getByRole("cell",{name:"18,446,744,073,709,551,615",exact:true}).first().waitFor();await page.unroute(api+"/**");await page.getByRole("heading",{name:"API unavailable",exact:true}).waitFor({state:"hidden",timeout:25000});
 assert.deepEqual(errors,[],"no browser runtime or hydration errors");console.log("PASS browser v7: all product routes, exact copy, linked provenance, charts, heatmap, URL filters, mobile, reduced motion, one SSE and outage recovery");
}finally{await browser?.close();web.kill("SIGTERM");}
