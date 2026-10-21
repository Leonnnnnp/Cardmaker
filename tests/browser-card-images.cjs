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
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 const seed={cards:[{id:'image-card',front:'猫',reading:'ねこ',back:'Katze',example:'猫がいる。',setIds:['my-cards'],source:'user',state:'mature',createdAt:100,due:123456,intervalDays:42,ease:2.5,reps:7,history:[{at:123,rating:'good'}],stability:42,difficulty:4,lapses:1,learningStep:0,lastReview:123,updatedAt:123}],meta:{soundEnabled:false}};
 const snapshot=p=>p.evaluate(()=>{const {updatedAt,image,...srs}=db.cards.find(c=>c.id==='image-card');return srs;});
 async function edit(p){
  await p.locator('.topnav [data-screen="cards"]').click();
  await p.locator('.cardrow:has([data-id="image-card"]) button').click();
 }
 async function imageReady(p,id){await p.waitForFunction(id=>document.querySelector('#'+id+' img')?.naturalWidth>0,id);}
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const width of [320,390,768]){
   const context=await browser.newContext({viewport:{width,height:900}});
   let png;
   await context.route('**/*',route=>{
    if(route.request().url().startsWith(origin))return route.continue();
    if(route.request().url()==='https://images.example.test/card.jpg')return route.fulfill({status:200,contentType:'image/png',body:png});
    return route.abort();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);
   await page.evaluate(seed=>{db=normalizeSaveData(structuredClone(seed));save({cloud:false});},seed);
   const before=await snapshot(page);
   const base64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const x=c.getContext('2d');x.fillStyle='#da8b42';x.fillRect(0,0,c.width,c.height);x.fillStyle='#284f77';x.fillRect(200,100,600,400);return c.toDataURL('image/png').split(',')[1];});
   png=Buffer.from(base64,'base64');
   await edit(page);
   await page.locator('#cardImageFile').setInputFiles({name:'scene.png',mimeType:'image/png',buffer:png});
   await imageReady(page,'previewCardImage');
   const dimensions=await page.locator('#previewCardImage img').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight,src:img.src}));
   assert.equal(dimensions.width,640);assert.equal(dimensions.height,360);assert.ok(dimensions.src.length<=160*1024);
   const beforeFailure=await page.evaluate(()=>JSON.stringify(db));
   await page.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='kotodama_srs_proto_v1')throw new DOMException('Storage full','QuotaExceededError');return window.originalStorageSet.call(this,k,v);};});
   await page.locator('#saveCard').click();
   assert.match(await page.locator('#cardImageStatus').innerText(),/Nicht gespeichert/);
   assert.equal(await page.evaluate(()=>JSON.stringify(db)),beforeFailure,'failed image save rolls back memory as well');
   await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageSet;delete window.originalStorageSet;});
   await page.locator('#saveCard').click();
   const stored=await page.evaluate(()=>db.cards[0].image);
   assert.ok(stored.startsWith('data:image/'));
   assert.deepEqual(await snapshot(page),before);
   await page.reload();
   assert.equal(await page.evaluate(()=>db.cards[0].image),stored);
   await page.locator('[data-screen="trainingMenu"]').click();
   await page.locator('#trainAllBtn').click();
   await imageReady(page,'reviewCardImage');
   assert.equal(await page.locator('#reviewCardImage').isVisible(),true,'image is visible before the training answer');
   await page.locator('#showAnswer').click();await imageReady(page,'reviewCardImage');
   await page.screenshot({path:'test-results/card-image-training-'+width+'.png',fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#leaveReview').click();
   await page.locator('[data-screen="reviewMenu"]').click();await page.locator('#startReview').click();
   await imageReady(page,'reviewCardImage');assert.equal(await page.locator('#reviewCardImage').isVisible(),true,'image is visible before the SRS answer');
   await page.locator('#showAnswer').click();await imageReady(page,'reviewCardImage');
   await page.locator('#leaveReview').click();
   await page.locator('[data-screen="adventureMenu"]').click();await page.locator('#adventureDirection').selectOption('jp-de');await page.locator('#startAdventure').click();
   await imageReady(page,'advCardImage');
   assert.equal(await page.locator('#advCardImage').isVisible(),true,'image is visible before the adventure answer');
   await page.locator('#advInput').fill('Katze');await page.locator('#advSubmit').click();await imageReady(page,'advCardImage');
   await page.screenshot({path:'test-results/card-image-adventure-'+width+'.png',fullPage:true});
   page.once('dialog',d=>d.accept());await page.locator('#leaveAdventure').click();
   assert.deepEqual(await snapshot(page),before,'viewing pictures and free adventure preserve SRS');
   await edit(page);await page.locator('#cardImageUrl').fill('https://images.example.test/card.jpg');
   await page.locator('#saveCard').click();
   assert.equal(await page.evaluate(()=>db.cards[0].image),'https://images.example.test/card.jpg');
   await edit(page);await imageReady(page,'previewCardImage');
   await page.locator('#removeCardImage').click();await page.locator('#cancelEditor').click();
   assert.equal(await page.evaluate(()=>db.cards[0].image),'https://images.example.test/card.jpg','cancel preserves the saved image');
   await edit(page);await page.locator('#removeCardImage').click();await page.locator('#saveCard').click();
   assert.equal(await page.evaluate(()=>db.cards[0].image),'');
   await edit(page);
   await page.evaluate(base64=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'clipboard.png',{type:'image/png'}));
    document.querySelector('#editorModal').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
   },base64);
   await imageReady(page,'previewCardImage');
   await page.locator('#saveNext').click();
   assert.equal(await page.locator('#previewCardImage').isVisible(),false,'next card starts without previous picture');
   await page.locator('#frontInput').fill('犬');await page.locator('#readingInput').fill('いぬ');await page.locator('#backInput').fill('Hund');await page.locator('#saveCard').click();
   assert.equal(await page.evaluate(()=>db.cards[1].image),'');
   const backup=await page.evaluate(()=>JSON.stringify(db));
   await page.evaluate(()=>{applyCloudMerge(structuredClone(db));});
   assert.ok(await page.evaluate(()=>db.cards[0].image.startsWith('data:image/')));
   await edit(page);
   await page.locator('#cardImageFile').setInputFiles({name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
   assert.match(await page.locator('#cardImageStatus').innerText(),/Bitte ein JPG/);
   await page.locator('#cancelEditor').click();
   await page.locator('.topnav [data-screen="home"]').click();await page.locator('#gameSettingsBtn').click();await page.locator('#importBtn').click();
   const imported=new Promise(resolve=>{const handler=async d=>{if(d.type()==='confirm')await d.accept();else{await d.dismiss();page.off('dialog',handler);resolve();}};page.on('dialog',handler);});
   await page.locator('#importFile').setInputFiles({name:'pictures.json',mimeType:'application/json',buffer:Buffer.from(backup)});await imported;
   assert.ok(await page.evaluate(()=>db.cards.find(c=>c.id==='image-card').image.startsWith('data:image/')));
   assert.deepEqual(await snapshot(page),before);
   assert.deepEqual(errors,[]);
   await context.close();
   console.log('Card images browser checks passed at '+width+'px: upload, compression, clipboard, links, removal, cancellation, quota rollback, learning modes, reload, merge, backup, SRS');
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
