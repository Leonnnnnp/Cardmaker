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
 let id=0;
 const c=vm.createContext({Map,Set,Date,structuredClone,USER_SET_ID:'my-cards',CURATED_SETS:[{id:'storytelling',name:'Geschichten erzählen',kind:'curated'}],window:{},db:{cards:[{id:'card',source:'user',front:'猫',back:'Katze',setIds:['my-cards'],due:123456789,state:'mature',reps:9,stability:42,difficulty:4,learningStep:0,lapses:1,lastReview:111,history:[{at:111,rating:'good'}],updatedAt:111}],meta:{}},uid:()=>String(++id),now:()=>1000});
 for(const name of ['customSetDefinitions','mergeCustomSets','setDefinitions','createCustomSet','ensureCardSets','cardsForSet','addCardsToSet','upgradeStorytellingReadings','normalizeSaveData','cardChangedAt','mergeSaveData'])vm.runInContext(source(name),c);
 return c;
}
test('empty custom sets persist, have unique IDs, and create no cards or SRS changes',()=>{
 const c=fixture(),before=JSON.stringify(c.db.cards);
 const a=c.createCustomSet(' Reisen ',' Meine Reisewörter '),b=c.createCustomSet('Kochen');
 assert.notEqual(a,b);
 assert.equal(c.setDefinitions().find(s=>s.id===a).name,'Reisen');
 assert.equal(c.setDefinitions().find(s=>s.id===a).kind,'user');
 c.db=JSON.parse(JSON.stringify(c.db));
 assert.equal(c.cardsForSet(a).length,0);
 assert.equal(c.customSetDefinitions().length,2);
 assert.equal(JSON.stringify(c.db.cards),before);
});
test('set names must be nonempty, bounded, and unique across personal and curated sets',()=>{
 const c=fixture();
 for(const name of ['', '   ', 'x'.repeat(61), 'Meine Karten','Geschichten erzählen'])assert.throws(()=>c.createCustomSet(name));
 c.createCustomSet('Reisen');
 assert.throws(()=>c.createCustomSet(' reisen '));
});
test('adding existing cards is idempotent and changes only membership and content timestamp',()=>{
 const c=fixture(),id=c.createCustomSet('Reisen'),before=structuredClone(c.db.cards[0]);
 assert.equal(c.addCardsToSet(['card'],id),1);
 assert.equal(c.cardsForSet(id).length,1);
 assert.equal(c.cardsForSet('my-cards').length,1);
 const after={...c.db.cards[0],setIds:before.setIds,updatedAt:before.updatedAt};
 assert.deepEqual(after,before);
 assert.equal(c.addCardsToSet(['card'],id),0);
 assert.equal(c.addCardsToSet(['card'],'storytelling'),0,'curated membership is not bulk-assigned');
 assert.equal(c.db.cards.length,1,'no duplicate learning objects');
});
test('cloud merge retains independent sets from both devices, even when one device has none',()=>{
 const c=fixture(),first=c.createCustomSet('Reisen');
 const local=structuredClone(c.db);
 c.db={cards:[],meta:{}};
 const second=c.createCustomSet('Kochen'),remote=structuredClone(c.db);
 const merged=c.mergeSaveData(local,remote);
 assert.equal(c.customSetDefinitions(merged.meta).length,2);
 assert.ok(merged.meta.customSets[first]);assert.ok(merged.meta.customSets[second]);
 assert.equal(c.customSetDefinitions(c.mergeSaveData({cards:[],meta:{}},remote).meta).length,1);
 remote.meta.customSets[first]={...local.meta.customSets[first],name:'Neu benannt',updatedAt:2000};
 assert.equal(c.mergeSaveData(local,remote).meta.customSets[first].name,'Neu benannt');
});
test('malformed custom metadata cannot override built-in sets or inject option IDs',()=>{
 const c=fixture();
 c.db.meta.customSets={bad:{id:'my-cards',name:'Fake'},invalid:{id:'custom-\" onclick=\"bad',name:'Bad'},empty:{id:'custom-empty',name:' '}};
 assert.equal(c.customSetDefinitions().length,0);
 assert.equal(c.setDefinitions().filter(s=>s.id==='my-cards').length,1);
});
