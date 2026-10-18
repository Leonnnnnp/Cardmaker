const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
function source(name) {
  const start = app.indexOf('function ' + name + '('), line = app.indexOf('\n', start);
  assert.ok(start >= 0);
  return app.slice(start, app.slice(start, line).endsWith('}') ? line : app.indexOf('\n}', start) + 2);
}
function fixture(cards, base) {
  const c = vm.createContext({Date, db:{cards}, now:()=>base, V5_MIN:60000});
  for (const name of ['reviewAvailability', 'dueCards', 'formatNextDue', 'laterReviewText']) vm.runInContext(source(name), c);
  return c;
}
test('eight due now and nineteen later today are separate; next-day scheduling is not moved to midnight', () => {
  const base = new Date(2026,9,18,9,41).getTime();
  const cards = Array.from({length:27}, (_,i)=>({id:String(i),due:i<8?base-1000:new Date(2026,9,18,9,52,40*(i-8)).getTime()}));
  const c = fixture(cards, base), before = JSON.stringify(cards);
  const a = c.reviewAvailability();
  assert.equal(a.due.length,8);
  assert.equal(a.laterToday,19);
  assert.equal(a.nextDue,new Date(2026,9,18,9,52).getTime());
  assert.match(c.laterReviewText(), /19 Karten später fällig/);
  c.now = () => new Date(2026,9,18,10,5).getTime();
  assert.equal(c.dueCards().length,27);
  assert.equal(c.reviewAvailability().laterToday,0);
  assert.equal(JSON.stringify(cards),before);
});
test('today ends at local midnight; exactly midnight and tomorrow are excluded from later today', () => {
  const base = new Date(2026,9,18,23,50).getTime();
  const midnight = new Date(2026,9,19).getTime();
  const c = fixture([{due:base},{due:midnight-1},{due:midnight},{due:midnight+60000}],base);
  assert.equal(c.reviewAvailability().due.length,1);
  assert.equal(c.reviewAvailability().laterToday,1);
});
test('empty availability is truthful and a focus/timer refresh cannot run the review queue', () => {
  const c = fixture([],1000000);
  assert.equal(c.reviewAvailability().due.length,0);
  assert.equal(c.reviewAvailability().nextDue,null);
  assert.equal(c.laterReviewText(),'');
  let refreshed = 0;
  c.refresh = () => refreshed++;
  c.document = {hidden:false};
  let active = 'review';
  c.$ = id => ({classList:{contains:()=>id===active}});
  vm.runInContext(source('refreshVisibleReviewAvailability'),c);
  c.refreshVisibleReviewAvailability();
  assert.equal(refreshed,0,'active review is left untouched');
  active = 'reviewMenu'; c.refreshVisibleReviewAvailability();
  assert.equal(refreshed,1);
  c.document.hidden = true; c.refreshVisibleReviewAvailability();
  assert.equal(refreshed,1);
});
