const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
function source(name) {
  const start = app.indexOf('function ' + name + '(');
  assert.ok(start >= 0);
  const line = app.indexOf('\n', start);
  const end = app.slice(start, line).endsWith('}') ? line : app.indexOf('\n}', start) + 2;
  return app.slice(start, end);
}
function fixture(updateSrs = true) {
  const cards = Array.from({length: 37}, (_, i) => ({id: String(i), front: '猫', reading: 'ねこ', back: 'Katze', setIds: [i % 2 ? 'nuances-daily' : 'my-cards'], state: 'mature', due: 900000000, reps: 7, stability: 42, difficulty: 4, lapses: 2, history: [], updatedAt: 1}));
  const c = vm.createContext({Date, Math, Map, Set, db: {cards, meta: {}}, now: () => 1000000, V5_MIN: 60000, V5_DAY: 86400000, ensureCardSets: () => {}, current: null, reviewQueue: [], advCardPool: cards.slice(), advState: {updateSrs, srsRatings: new Map(), hintUsed: false, current: cards[0], deck: cards.slice()}});
  for (const name of ['ensureCardV5', 'appendHistory', 'schedule', 'formatNextDue', 'advApplySrsAnswer', 'rebindActiveCardRefs']) vm.runInContext(source(name), c);
  return c;
}
test('SRS opt-in is unchecked in the menu', () => {
  const input = html.match(/<input[^>]*id="adventureUpdateSrs"[^>]*>/)[0];
  assert.doesNotMatch(input, /\bchecked\b/);
});
test('free adventure leaves all 37 cards byte-for-byte unchanged for any answer', () => {
  const c = fixture(false), before = JSON.stringify(c.db.cards);
  for (const card of c.db.cards) {
    c.advState.current = card;
    for (const correct of [true, false]) assert.equal(c.advApplySrsAnswer(correct), '');
  }
  assert.equal(JSON.stringify(c.db.cards), before);
});
test('correct answers use Good, hints use Hard and errors use Again, independently of tempo', () => {
  for (const [correct, hint, rating] of [[true, false, 'good'], [true, true, 'hard'], [false, false, 'again'], [false, true, 'again']]) {
    const c = fixture(), beforeOthers = JSON.stringify(c.db.cards.slice(1));
    c.advState.hintUsed = hint;
    const expected = structuredClone(c.db.cards[0]);
    c.schedule(expected, rating);
    const message = c.advApplySrsAnswer(correct);
    assert.deepEqual(c.db.cards[0], expected);
    assert.equal(JSON.stringify(c.db.cards.slice(1)), beforeOthers, 'unanswered cards in other sets remain unchanged');
    assert.equal(c.advState.srsRatings.size, 1);
    assert.match(message, /SRS:/);
    if (!correct) assert.equal(c.db.cards[0].due, 1000000 + 10 * 60000);
  }
});
test('repeated successes do not inflate SRS and cannot hide a later failure', () => {
  const c = fixture();
  c.advApplySrsAnswer(true);
  const once = JSON.stringify(c.db.cards[0]);
  for (let i = 0; i < 30; i++) c.advApplySrsAnswer(true);
  assert.equal(JSON.stringify(c.db.cards[0]), once);
  c.advApplySrsAnswer(false);
  const failed = JSON.stringify(c.db.cards[0]);
  for (const correct of [true, false, true]) c.advApplySrsAnswer(correct);
  assert.equal(JSON.stringify(c.db.cards[0]), failed);
  assert.equal(c.db.cards[0].history.length, 2);
  assert.equal(c.advState.srsRatings.get('0'), 'again');
});
test('hinted success can downgrade Good once; unassisted repetition cannot upgrade it', () => {
  const c = fixture();
  c.advApplySrsAnswer(true);
  c.advState.hintUsed = true;
  c.advApplySrsAnswer(true);
  const once = JSON.stringify(c.db.cards[0]);
  c.advState.hintUsed = false;
  c.advApplySrsAnswer(true);
  assert.equal(JSON.stringify(c.db.cards[0]), once);
  assert.equal(c.advState.srsRatings.get('0'), 'hard');
});
test('after a merge, answers update the current stored card, never the stale object', () => {
  const c = fixture(), stale = c.advState.current;
  c.db.cards = structuredClone(c.db.cards);
  c.db.cards[0].stability = 80;
  c.advApplySrsAnswer(false);
  assert.equal(stale.history.length, 0);
  assert.equal(c.db.cards[0].history.length, 1);
  assert.equal(c.advState.current, c.db.cards[0]);
  c.rebindActiveCardRefs();
  assert.equal(c.advState.deck[0], c.db.cards[0]);
  assert.equal(c.advCardPool[0], c.db.cards[0]);
});
test('deleted and unanswered cards receive no SRS changes', () => {
  const c = fixture();
  c.db.cards = c.db.cards.slice(1);
  const before = JSON.stringify(c.db.cards);
  assert.match(c.advApplySrsAnswer(false), /keine Änderung/);
  assert.equal(JSON.stringify(c.db.cards), before);
  assert.equal(c.advState.srsRatings.size, 0);
});
