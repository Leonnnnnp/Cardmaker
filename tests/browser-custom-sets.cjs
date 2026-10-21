const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
async function main(){
 const root=path.resolve(__dirname,'../docs');
 const server=http.createServer((req,res)=>{
  const file={'/':'index.html','/resources/curated-sets.js':'resources/curated-sets.js','/resources/learning-export.js':'resources/learning-export.js'}[req.url.split('?')[0]];
  if(!file){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(path.join(root,file)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const seed={cards:[{id:'existing',front:'猫',reading:'ねこ',back:'Katze',example:'猫がいる。',setIds:['my-cards'],source:'user',state:'mature',due:2000000000000,reps:7,history:[{at:123,rating:'good'}],stability:42,difficulty:4,lapses:1,learningStep:0,lastReview:123,updatedAt:123}],meta:{soundEnabled:false}};
 const srs=p=>p.evaluate(()=>{const {setIds,updatedAt,...rest}=db.cards.find(c=>c.id==='existing');return rest;});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const width of [320,390,768]){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);
   await page.evaluate(seed=>{db=normalizeSaveData(structuredClone(seed));save({cloud:false});},seed);
   const before=await srs(page);
   await page.locator('[data-screen="sets"]').click();
   await page.locator('#customSetName').fill('Reisen & Geschichten');
   await page.locator('#customSetDescription').fill('Meine eigenen Wörter für unterwegs');
   await page.locator('#createSetForm button').click();
   assert.match(await page.locator('#customSetStatus').innerText(),/Set angelegt/);
   const id=await page.evaluate(()=>customSetDefinitions()[0].id);
   assert.equal(await page.evaluate(()=>db.cards.length),1);
   assert.deepEqual(await srs(page),before);
   await page.locator('#customSetName').fill(' reisen & geschichten ');
   await page.locator('#createSetForm button').click();
   assert.match(await page.locator('#customSetStatus').innerText(),/bereits vorhanden/);
   assert.equal(await page.evaluate(()=>customSetDefinitions().length),1);
   // Assign an existing card without cloning or changing its learning state.
   await page.locator('#sets [data-screen="home"]').click();
   await page.locator('[data-screen="cards"]').click();
   await page.locator('.card-select[data-id="existing"]').check();
   await page.locator('#assignSetSelect').selectOption(id);
   await page.locator('#assignSelectedToSet').click();
   assert.match(await page.locator('#assignSetStatus').innerText(),/1 Karte/);
   assert.deepEqual(await srs(page),before);
   await page.locator('#cardSetFilter').selectOption(id);
   assert.equal(await page.locator('.cardrow').count(),1);
   await page.locator('.cardrow button').click();
   await page.locator('.editor-set-choice[value="my-cards"]').uncheck();
   await page.locator('#saveCard').click();
   assert.deepEqual(await page.evaluate(()=>db.cards.find(c=>c.id==='existing').setIds),[id]);
   assert.deepEqual(await srs(page),before);
   // New cards go directly into this set; Save + next retains the chosen set.
   await page.locator('.topnav [data-screen="home"]').click();
   await page.locator('[data-screen="sets"]').click();
   await page.locator('.set-add-card[data-set="'+id+'"]').click();
   await page.locator('#frontInput').fill('旅行');await page.locator('#readingInput').fill('りょこう');await page.locator('#backInput').fill('Reise');
   await page.locator('#saveNext').click();
   assert.equal(await page.evaluate(id=>cardsForSet(id).length,id),2);
   await page.locator('#frontInput').fill('駅');await page.locator('#readingInput').fill('えき');await page.locator('#backInput').fill('Bahnhof');
   await page.locator('#saveCard').click();
   assert.equal(await page.evaluate(id=>cardsForSet(id).length,id),3);
   assert.deepEqual(await srs(page),before);
   // Check durable local reload and a simulated second-device merge.
   await page.reload();
   assert.equal(await page.evaluate(()=>customSetDefinitions().length),1);
   assert.equal(await page.evaluate(id=>cardsForSet(id).length,id),3);
   await page.evaluate(()=>applyCloudMerge({cards:[],meta:{customSets:{'custom-second':{id:'custom-second',name:'Kochen',updatedAt:999}}}}));
   assert.equal(await page.evaluate(()=>customSetDefinitions().length),2);
   for(const selector of ['reviewSetFilter','trainingSetFilter','adventureSetFilter','cardSetFilter'])assert.equal(await page.locator('#'+selector+' option[value="'+id+'"]').count(),1);
   await page.locator('[data-screen="reviewMenu"]').click();
   await page.locator('.review-set-choice[data-set="'+id+'"]').click();
   assert.match(await page.locator('#reviewDueSummary').innerText(),/2 Karten sind jetzt fällig/);
   await page.locator('.review-set-learn[data-set="'+id+'"]').click();
   assert.equal(await page.evaluate(()=>sessionTotal),2);
   await page.locator('#leaveReview').click();
   await page.locator('[data-screen="trainingMenu"]').click();
   await page.locator('#trainingSetFilter').selectOption(id);await page.locator('#trainAllBtn').click();
   assert.equal(await page.evaluate(()=>sessionTotal),3);
   await page.locator('#leaveReview').click();
   await page.locator('[data-screen="adventureMenu"]').click();
   await page.locator('#adventureSetFilter').selectOption(id);await page.locator('#startAdventure').click();
   assert.equal(await page.evaluate(()=>advCardPool.length),3);
   page.once('dialog',d=>d.accept());await page.locator('#leaveAdventure').click();
   // Backup import preserves set definitions, memberships and the SRS fields.
   const backup=await page.evaluate(()=>JSON.stringify(db));
   await page.locator('#gameSettingsBtn').click();await page.locator('#importBtn').click();
   const imported=new Promise(resolve=>{
    const handler=async d=>{if(d.type()==='confirm')await d.accept();else{await d.dismiss();page.off('dialog',handler);resolve();}};
    page.on('dialog',handler);
   });
   await page.locator('#importFile').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(backup)});
   await imported;
   assert.equal(await page.evaluate(()=>customSetDefinitions().length),2);
   assert.deepEqual(await srs(page),before);
   await page.locator('#gameSettingsClose').click();
   await page.locator('[data-screen="sets"]').click();
   await page.locator('#customSetName').fill('SehrLangerSetnameOhneLeerzeichen'.repeat(2).slice(0,60));
   await page.locator('#createSetForm button').click();
   await page.screenshot({path:'test-results/custom-sets-'+width+'.png',fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);
   await context.close();
   console.log('Custom sets browser checks passed at '+width+'px: creation, membership, SRS, reload, merge, all modes, backup');
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
