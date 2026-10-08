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
  await page.goto(base);
  await page.getByRole('heading',{name:'See the protocol move.'}).waitFor();
  await page.getByRole('link',{name:'BMM auctions',exact:true}).click();
  await page.getByRole('heading',{name:'BMM auctions',exact:true}).waitFor();
  await page.getByRole('cell',{name:'18,446,744,073,709,551,615',exact:true}).waitFor();
  assert((await page.locator('body').innerText()).toLowerCase().includes('readiness'));
  await page.screenshot({path:artifacts+'/bmm.png',fullPage:true});
  await page.goto(base+'/sidechains/9');
  await page.getByRole('heading',{name:'Treasury balance history'}).waitFor();
  await page.getByText(/Separate observed responses, plotted by read time/).waitFor();
  await page.getByText(/Exact chart values/).click();
  await page.getByRole('cell',{name:'700',exact:true}).first().waitFor();
  await page.screenshot({path:artifacts+'/treasury.png',fullPage:true});
  // Content of every corrected view, not only its heading.
  const api=async path=>(await fetch('http://127.0.0.1:18080'+path)).json();
  const body=async()=>await page.locator('body').innerText();
  const meta=await api('/api/v1/meta');
  await page.goto(base+'/bmm');
  await page.getByRole('heading',{name:'BMM commitment history'}).waitFor();
  for(const stale of ['Rate / coverage','Uncovered','Inactive','M7 and slot'])assert(!(await body()).includes(stale),`/bmm still shows ${stale}`);
  // The header fills from /status after hydration; wait for it rather than racing it.
  await page.locator('.network-label',{hasText:meta.dataset.network_id}).waitFor();
  await page.goto(base+'/sidechains/9');
  await page.getByText(`700 ${meta.native_asset.symbol}`,{exact:false}).first().waitFor();
  const bundle=(await api('/api/v1/withdrawal-bundles?scope=all')).items.find(x=>x.kind==='bundle');
  await page.goto(base+'/bundle-attempts/'+encodeURIComponent(bundle.entity_id));
  await page.locator('.protocol-card').first().waitFor();
  assert(!(await body()).includes('No matching record has been imported'),'bundle attempt page must find its record');
  for(const stale of ['current state unknown','additional votes required','Theoretical margin'])assert(!(await body()).includes(stale),`bundle attempt still shows ${stale}`);
  await page.goto(base+'/learn');
  await page.getByText('Tip matched',{exact:true}).waitFor();
  assert(!(await body()).includes('Reconstructed'));
  const coverage=await api('/api/v1/coverage');
  await page.goto(base+'/about/data');
  await page.getByRole('heading',{name:'Gaps in global transitions'}).waitFor();
  assert((await body()).includes(`last ${coverage.observation_quality.window_hours} hours`));
  await page.goto(base+'/explorer');
  await page.getByRole('heading',{name:'Protocol explorer'}).waitFor();
  assert.equal(await page.locator('select[name=time_basis]').inputValue(),'');
  assert(!(await page.locator('select[name=resource] option').allInnerTexts()).includes('protocol messages'));
  const tip=(await api('/api/v1/blocks?limit=1')).blocks[0];
  await page.goto(`${base}/datasets/${meta.dataset.dataset_id}/blocks/${tip.hash}`);
  await page.getByRole('heading',{name:'Header and membership'}).waitFor();
  assert(!(await body()).includes('Coinbase messages'),'block detail still lists coinbase messages');
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/blocks');
  await page.getByRole('heading',{name:'Block explorer'}).first().waitFor();
  await page.screenshot({path:artifacts+'/mobile-blocks.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS official-source browser: exact u64, readiness, observation chart, corrected views, mobile blocks');
} finally {if(browser)await browser.close();web.kill('SIGTERM');await new Promise(resolve=>web.once('exit',resolve));}
