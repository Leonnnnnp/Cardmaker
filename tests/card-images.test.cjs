const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
const app=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function source(name){
 const start=app.indexOf('function '+name+'('),line=app.indexOf('\n',start);
 assert.ok(start>=0);
 return app.slice(start,app.slice(start,line).endsWith('}')?line:app.indexOf('\n}',start)+2);
}
function fixture(){
 const c=vm.createContext({URL,Map,Set,Date,structuredClone,window:{}});
 for(const name of ['validCardImage','upgradeStorytellingReadings','normalizeSaveData','customSetDefinitions','mergeCustomSets','cardChangedAt','mergeSaveData'])vm.runInContext(source(name),c);
 return c;
}
test('image links support encoded ImmersionKit paths without permitting active or local protocols',()=>{
 const c=fixture();
 const url="https://us-southeast-1.linodeobjects.com/immersionkit/media/anime/Frieren%20Beyond%20Journey's%20End/media/frieren_03_0.13.32.019.jpg";
 assert.equal(c.validCardImage(url),new URL(url).href);
 for(const src of ['javascript:alert(1)','file:///secret','http://example.com/a.jpg','data:image/svg+xml;base64,AAAA','https://user:password@example.com/a.jpg','not a URL',null,{},'https://example.com/'+ 'a'.repeat(5000)])assert.equal(c.validCardImage(src),'');
});
test('only small raster data images are accepted',()=>{
 const c=fixture();
 for(const type of ['png','jpeg','webp'])assert.equal(c.validCardImage('data:image/'+type+';base64,AAAA'),'data:image/'+type+';base64,AAAA');
 assert.equal(c.validCardImage('data:image/png;base64,'+'A'.repeat(160*1024)),'');
 assert.equal(c.validCardImage('data:text/html;base64,AAAA'),'');
});
test('image addition and explicit removal survive JSON and cloud merge without changing SRS',()=>{
 const c=fixture();
 const card={id:'one',front:'猫',due:123456,state:'mature',reps:9,stability:42,difficulty:4,learningStep:0,lapses:1,lastReview:123,history:[{at:123,rating:'good'}],updatedAt:10};
 const withImage={...card,image:'data:image/webp;base64,AAAA',updatedAt:20};
 let merged=c.mergeSaveData({cards:[card],meta:{}},{cards:[withImage],meta:{}});
 assert.equal(merged.cards[0].image,withImage.image);
 const {image,updatedAt,...rest}=merged.cards[0];
 const {updatedAt:ignored,...before}=card;
 assert.deepEqual(rest,before);
 const backup=JSON.parse(JSON.stringify(merged));
 assert.equal(backup.cards[0].image,withImage.image);
 merged=c.mergeSaveData({cards:[{...withImage,image:'',updatedAt:30}],meta:{}},backup);
 assert.equal(merged.cards[0].image,'','a stale device cannot restore a removed image');
 assert.equal(merged.cards[0].due,card.due);
 assert.deepEqual(merged.cards[0].history,card.history);
});
