const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build,assessment,recentRatings}=require('../docs/resources/learning-export.js');
const rating=(at,value)=>({at,rating:value});

test('export groups cards from ratings and intervals without mutating any save data',()=>{
 const cards=[
  {front:'猫',back:'Katze',state:'mature',intervalDays:21,history:[rating(1,'good'),rating(2,'easy')]},
  {front:'新',back:'neu',state:'new',history:[]},
  {front:'難',back:'schwierig',state:'learning',intervalDays:7,history:[rating(1,'easy')],practiceHistory:[rating(2,'hard')]},
  {front:'短',back:'kurz',state:'learning',intervalDays:1,history:[rating(1,'good'),rating(2,'good')]}
 ];
 const save={cards,meta:{localUpdatedAt:123}};const before=JSON.stringify(save);
 const text=build(save,new Date('2026-10-05T00:00:00Z'));
 assert.equal(JSON.stringify(save),before);
 assert.ok(text.indexOf('| 新 |')<text.indexOf('| 難 |'));
 assert.match(text,/Gut im Aufbau/);assert.match(text,/Leicht → Schwer/);assert.match(text,/21 Tage/);
 assert.equal(assessment(cards[1]),'Neu im SRS');assert.equal(assessment(cards[2]),'Besondere Aufmerksamkeit');
 assert.equal(assessment(cards[3]),'Noch festigen');assert.equal(assessment(cards[0]),'Gut im Aufbau');
});
test('recent ratings merge SRS and training chronologically; old mistakes roll out',()=>{
 const card={state:'learning',intervalDays:5,history:[rating(1,'again'),rating(4,'good')],practiceHistory:[rating(3,'easy'),rating(2,'good')]};
 assert.deepEqual(recentRatings(card).map(h=>h.at),[2,3,4]);
 assert.equal(assessment(card),'Gut im Aufbau');
 assert.equal(assessment({state:'relearning',history:[rating(1,'good')]}),'Besondere Aufmerksamkeit');
});
test('markdown escapes pipes, HTML and multiline content; missing fields stay readable',()=>{
 const text=build({cards:[{front:'a|b',back:'eins\nzwei <b>',intervalDays:1/1440}]});
 assert.match(text,/a\\\|b/);assert.match(text,/eins; zwei &lt;b&gt;/);assert.match(text,/1 Min\./);
 assert.match(text,/Neu im SRS/);assert.match(text,/\| — \|/);
 assert.match(build({cards:[]} ),/0 Karten/);assert.match(build({}),/Noch keine Karten/);
});
test('report is generated from the latest supplied snapshot and contains no account metadata',()=>{
 const save={cards:[{front:'猫',back:'Katze'}],meta:{email:'private@example.com',token:'secret'}};
 const first=build(save);save.cards.push({front:'犬',back:'Hund'});
 const latest=build(save);
 assert.doesNotMatch(first,/\| 犬 \|/);assert.match(latest,/\| 犬 \|/);
 assert.doesNotMatch(latest,/private@example.com|secret/);
});
