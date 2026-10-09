// Browser assertions against the running, isolated official-source API fixture.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PULSE_PLAYWRIGHT_MODULE??'playwright');
const base='http://127.0.0.1:13000';
const web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','13000'],{cwd:new URL('../apps/web/',import.meta.url),stdio:'ignore'});
const artifacts=process.env.PULSE_BROWSER_ARTIFACTS??'/tmp/drivechain-observatory-browser-official';
mkdirSync(artifacts,{recursive:true});
let browser;
try {
  let ready=false;
  for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  assert(ready,'Next must become ready');
  browser=await chromium.launch({headless:true,executablePath:process.env.PULSE_BROWSER_EXECUTABLE});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const api=async path=>(await fetch(`http://127.0.0.1:${process.env.PULSE_TEST_API_PORT??'18080'}`+path)).json();
  const body=async()=>await page.locator('body').innerText();
  const meta=await api('/api/v1/meta');
  const unit=meta.native_asset.symbol;
  const constants=(await api('/api/v1/chain-info?limit=1')).items[0].data.bip300_constants;

  // The home page leads into the first lesson.
  await page.goto(base);
  await page.getByRole('heading',{name:'Learn drivechains by watching one run.'}).waitFor();
  // The header fills from /status after hydration; wait for it rather than racing it.
  await page.locator('.live-pill',{hasText:meta.dataset.network_id}).waitFor();
  await page.getByRole('link',{name:'Start learning'}).click();
  await page.getByRole('heading',{name:'What is a drivechain?',exact:true}).waitFor();
  await page.getByText('Live on Betanet').first().waitFor();

  // Protocol numbers come from the enforcer's reported parameters, with the strict rule.
  await page.goto(base+'/learn/creating-a-sidechain');
  await page.getByText(`> ${constants.unused_sidechain_slot_activation_threshold.toLocaleString('en-US')} votes`,{exact:true}).first().waitFor();
  await page.getByText(`> ${constants.used_sidechain_slot_activation_threshold.toLocaleString('en-US')} votes`,{exact:true}).first().waitFor();
  await page.getByRole('link',{name:/BIP300 · M2, ACK sidechain proposal/}).first().waitFor();

  // A pending bundle is shown against the observed threshold and age limit.
  await page.goto(base+'/learn/withdrawals');
  await page.getByText(`needs more than ${constants.withdrawal_bundle_inclusion_threshold.toLocaleString('en-US')}`).first().waitFor();
  await page.getByText(`limit ${constants.withdrawal_bundle_max_age.toLocaleString('en-US')} blocks`).first().waitFor();

  // An exact u64 bid keeps every digit.
  await page.goto(base+'/learn/merged-mining');
  await page.getByText(`18,446,744,073,709,551,615 ${unit}`,{exact:true}).first().waitFor();
  await page.screenshot({path:artifacts+'/merged-mining.png',fullPage:true});

  // A sidechain's story shows its exact treasury output.
  await page.goto(base+'/sidechains/9');
  await page.getByRole('heading',{name:'Its story so far'}).waitFor();
  await page.getByText(`700 ${unit}`,{exact:false}).first().waitFor();
  await page.screenshot({path:artifacts+'/sidechain.png',fullPage:true});

  // Data quality uses the coverage window the API reports.
  const coverage=await api('/api/v1/coverage');
  await page.goto(base+'/learn/how-we-know');
  await page.getByText(`Readings in the last ${coverage.observation_quality.window_hours} hours`).first().waitFor();

  // Every glossary term links back to a lesson.
  await page.goto(base+'/glossary#ctip');
  await page.getByRole('heading',{name:'CTIP (treasury output)'}).waitFor();

  // Live activity reads block by block, newest first, starting at the selected tip.
  await page.goto(base+'/live');
  await page.locator('.timeline-blocks .tl-tag',{hasText:'newest'}).waitFor();
  const firstBlock=(await page.locator('.timeline-blocks .tl-head strong').first().textContent()).replace(/\D/g,'');
  assert.equal(Number(firstBlock),(await api('/api/v1/blocks?limit=1')).blocks[0].height,'live starts at the newest block');

  // Search reaches the block page: what happened first, its proof one click away.
  const tip=(await api('/api/v1/blocks?limit=1')).blocks[0];
  await page.goto(`${base}/search?q=${tip.height}`);
  await page.getByRole('link',{name:new RegExp(`Block ${tip.height.toLocaleString('en-US')}`)}).click();
  await page.getByRole('heading',{name:'What happened in this block'}).waitFor();
  await page.getByText('Go deeper: how we know').click();
  await page.getByText('You are looking at a proof.').first().waitFor();
  assert(!(await body()).includes('Coinbase messages'),'block detail still lists coinbase messages');
  // A proof opens with what the record says in words; the exact JSON sits behind it.
  await page.getByRole('link',{name:'report'}).first().click();
  await page.getByRole('heading',{name:'What it says'}).waitFor();
  await page.getByRole('heading',{name:/^Enforcer report for /}).waitFor();
  await page.getByText('Go deeper: the exact record').waitFor();

  // The about page shows the donation address and its QR code.
  await page.goto(base+'/about');
  await page.getByRole('heading',{name:'Help the project'}).waitFor();
  await page.getByText('bc1qkh8xcznxzd2l3useajnz22pwsdtthwhp56kt6m',{exact:true}).waitFor();
  assert.equal(await page.locator('.donate-qr svg').count(),1,'the donation QR code must render');

  // Each lesson offers its question to three assistants; about shows how to reach the maintainer.
  await page.goto(base+'/learn/withdrawals');
  const asks=page.locator('.ask-ai-buttons a');
  assert.equal(await asks.count(),3,'three Ask AI links');
  const claude=new URL(await asks.nth(1).getAttribute('href'));
  assert.equal(claude.origin+claude.pathname,'https://claude.ai/new');
  assert(claude.searchParams.get('q').includes('Withdrawals by miner vote')&&claude.searchParams.get('q').includes('/learn/withdrawals'),'prompt names the lesson');
  await page.goto(base+'/about');
  await page.locator('.about-section',{hasText:'About us'}).getByText('guischet',{exact:true}).waitFor();
  assert(!(await page.locator('.site-footer').innerText()).includes('Discord'),'Discord appears only in About us');

  // Replaced technical views redirect to the page that now covers them.
  for(const [from,to] of [['/bmm','/learn/merged-mining'],['/explorer','/search'],['/about/data','/learn/how-we-know'],['/pegs','/learn/deposits']]){
    await page.goto(base+from);
    assert.equal(new URL(page.url()).pathname,to,`${from} must redirect to ${to}`);
  }

  // Lessons fit a phone screen.
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/','/learn/slots','/learn/deposits','/sidechains']){
    await page.goto(base+path);
    await page.locator('main').first().waitFor();
    assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)),`${path} scrolls horizontally on a phone`);
  }
  await page.screenshot({path:artifacts+'/mobile-sidechains.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS official-source browser: learning path, observed parameters, exact u64, treasury, coverage, proof pages, redirects, mobile');
} finally {if(browser)await browser.close();web.kill('SIGTERM');await new Promise(resolve=>web.once('exit',resolve));}
