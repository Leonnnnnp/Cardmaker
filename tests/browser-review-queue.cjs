const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const base = Date.parse('2026-10-18T09:41:00+02:00');
const makeCard = (i,due=base-1000,updatedAt=base-3*86400000) => ({id:'queue-'+i,front:'猫',reading:'ねこ',back:'Katze',example:'猫がいる。',setIds:[['my-cards','storytelling','nuances-daily'][i%3]],source:'user',state:i%2?'relearning':'learning',due,updatedAt,createdAt:base-10*86400000,lastReview:updatedAt,reps:2,lapses:1,learningStep:0,intervalDays:1,stability:1,difficulty:5,history:[{at:updatedAt,due,rating:'good'}]});
async function main(){
  const root=path.resolve(__dirname,'../docs');
  const server=http.createServer((req,res)=>{
    const allowed={'/':'index.html','/resources/curated-sets.js':'resources/curated-sets.js','/resources/learning-export.js':'resources/learning-export.js'};
    const file=allowed[req.url.split('?')[0]];
    if(!file){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');
    res.end(fs.readFileSync(path.join(root,file)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  fs.mkdirSync('test-results',{recursive:true});
  async function open(cards){
    const context=await browser.newContext({viewport:{width:390,height:900},timezoneId:'Europe/Berlin'});
    await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await context.addInitScript(({cards,base})=>{
      window.reviewTestTime=base;Date.now=()=>window.reviewTestTime;
      localStorage.setItem('kotodama_srs_proto_v1',JSON.stringify({cards,meta:{soundEnabled:false}}));
    },{cards,base});
    const page=await context.newPage(), errors=[], summaries=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',async d=>{summaries.push(d.message());await d.accept();});
    await page.goto(origin);
    return {context,page,errors,summaries};
  }
  try{
    // Reproduce the exact 27 -> 8 split: yesterday's progress exists in the cloud,
    // while the local cache still marks all cards as due.
    const {context,page,errors,summaries}=await open(Array.from({length:27},(_,i)=>makeCard(i)));
    assert.equal(await page.locator('#dueCount').innerText(),'27');
    const remote=Array.from({length:27},(_,i)=>makeCard(i,i<8?base-1000:Date.parse('2026-10-18T09:52:00+02:00')+(i-8)*40000,base-86400000));
    await page.evaluate(cards=>applyCloudMerge({cards,meta:{}}),remote);
    assert.equal(await page.locator('#dueCount').innerText(),'8');
    assert.match(await page.locator('#homeSyncNotice').innerText(),/27 → zusammengeführt 8/);
    assert.match(await page.locator('#homeText').innerText(),/19 Karten später fällig/);
    const futureBefore=await page.evaluate(()=>JSON.stringify(db.cards.filter(c=>c.due>Date.now())));
    await page.locator('[data-screen="reviewMenu"]').click();
    assert.match(await page.locator('#reviewNextDue').innerText(),/19 Karten später fällig/);
    await page.screenshot({path:'test-results/review-sync-27-to-8.png',fullPage:true});
    await page.locator('.review-set-learn[data-set="all"]').click();
    const seen=new Set();
    for(let i=0;i<8;i++){
      await page.locator('#showAnswer').waitFor({state:'visible'});
      assert.match(await page.locator('#reviewProgress').innerText(),new RegExp('Start: 8 fällig.*'+(8-i)+' offen'));
      seen.add(await page.evaluate(()=>current.id));
      if(i===3)await page.evaluate(cards=>applyCloudMerge({cards,meta:{}}),remote);
      await page.locator('#showAnswer').click();
      await page.locator('[data-rate="good"]').click();
    }
    await page.locator('#reviewMenu').waitFor({state:'visible'});
    assert.equal(seen.size,8);
    assert.match(summaries.at(-1),/Beantwortete Karten: 8/);
    assert.match(summaries.at(-1),/19 Karten später fällig/);
    assert.equal(await page.evaluate(()=>JSON.stringify(db.cards.filter(c=>c.id.replace('queue-','')*1>=8))),futureBefore);
    // Time passing changes availability without touching card due/history values.
    const beforeTime=await page.evaluate(()=>JSON.stringify(db.cards));
    await page.evaluate(()=>{window.reviewTestTime=Date.parse('2026-10-18T10:05:00+02:00');window.dispatchEvent(new Event('focus'));});
    assert.equal(await page.locator('#dueCount').innerText(),'19');
    assert.equal(await page.locator('#startReview').isEnabled(),true);
    assert.equal(await page.evaluate(()=>JSON.stringify(db.cards)),beforeTime);
    assert.deepEqual(errors,[]);
    await context.close();

    // All 37 due cards survive set mixing, direction mixing, zero HP, a cloud merge,
    // and two Again answers. There must be 39 presentations, never an early finish.
    const run=await open(Array.from({length:37},(_,i)=>makeCard(i)));
    const p=run.page;
    await p.locator('[data-screen="reviewMenu"]').click();
    await p.locator('.review-set-learn[data-set="all"]').click();
    const unique=new Set(),directions=new Set(),retried=new Set();
    let presentations=0;
    while(presentations<39){
      await p.locator('#showAnswer').waitFor({state:'visible'});
      const q=await p.evaluate(()=>({id:current.id,direction:currentDirection,total:sessionTotal}));
      assert.equal(q.total,37);unique.add(q.id);directions.add(q.direction);
      if(presentations===10)await p.evaluate(()=>{applyCloudMerge(structuredClone(db));heroHp=0;});
      const again=['queue-0','queue-1'].includes(q.id)&&!retried.has(q.id);
      if(again)retried.add(q.id);
      await p.locator('#showAnswer').click();
      await p.locator('[data-rate="'+(again?'again':'good')+'"]').click();
      presentations++;
    }
    await p.locator('#reviewMenu').waitFor({state:'visible'});
    assert.equal(unique.size,37);assert.equal(directions.size,2);
    assert.match(run.summaries.at(-1),/Beim Start fällig: 37/);
    assert.match(run.summaries.at(-1),/Beantwortete Karten: 37/);
    assert.match(run.summaries.at(-1),/In der Runde übrig: 0/);
    assert.deepEqual(await p.evaluate(()=>db.cards.map(c=>c.reps)),Array.from({length:37},(_,i)=>i<2?4:3));
    assert.deepEqual(run.errors,[]);
    await run.context.close();
    console.log('Review queue regression checks passed: 27 -> 8 plus 19 later today, clock refresh, 37 due across sets, mixed directions, merge, zero HP, Again');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
