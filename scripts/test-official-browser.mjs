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
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/blocks');
  await page.getByRole('heading',{name:'Block explorer'}).first().waitFor();
  await page.screenshot({path:artifacts+'/mobile-blocks.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS official-source browser: exact u64, readiness, observation chart, mobile blocks');
} finally {if(browser)await browser.close();web.kill('SIGTERM');await new Promise(resolve=>web.once('exit',resolve));}
