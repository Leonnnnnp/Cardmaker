const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
function source(name) {
  const start = app.indexOf('function ' + name + '('), line = app.indexOf('\n', start);
  assert.ok(start >= 0);
  return app.slice(start, app.slice(start, line).endsWith('}') ? line : app.indexOf('\n}', start) + 2);
}
function fixture(enabled = false) {
  const cards = Array.from({length: 37}, (_, i) => ({id: String(i), front: '猫', back: 'Katze', reading: 'ねこ', state: 'mature', due: 1000000000, reps: 5, history: [], stability: 42, difficulty: 4, lapses: 1}));
  const nodes = {trainingUpdateSrs: {checked: enabled}, trainingDirection: {value: 'de-jp'}};
  const c = vm.createContext({Date, Math, Map, Set, db: {cards, meta: {}}, trainingUpdatesSrs: enabled, reviewMode: 'training', reviewSessionToken: 0, sessionAnswered: new Set(), now: () => 1000000, V5_MIN: 60000, V5_DAY: 86400000, ensureCardSets: () => {}, $: id => nodes[id], resetReviewDirectionBalance: () => {}, resetCombatSession: () => {}, idle: () => {}, showScreen: () => {}, nextCard: () => {}, alert: () => {}});
  for (const n of ['ensureCardV5', 'appendHistory', 'schedule', 'applyReviewRating', 'startTraining']) vm.runInContext(source(n), c);
  return {c, nodes};
}
test('training SRS is opt-in and the selected option is captured for each run', () => {
  assert.doesNotMatch(html.match(/<input[^>]*id="trainingUpdateSrs"[^>]*>/)[0], /\bchecked\b/);
  const {c, nodes} = fixture(true);
  c.startTraining(c.db.cards.slice(0, 2));
  nodes.trainingUpdateSrs.checked = false;
  assert.equal(c.trainingUpdatesSrs, true);
  assert.equal(c.reviewDirection, 'de-jp');
  c.startTraining(c.db.cards.slice(0, 2));
  assert.equal(c.trainingUpdatesSrs, false);
});
test('all four ratings in free training preserve every SRS field and only log practice', () => {
  for (const rating of ['again', 'hard', 'good', 'easy']) {
    const {c} = fixture();
    const before = structuredClone(c.db.cards);
    c.applyReviewRating(c.db.cards[0], rating);
    const rated = {...c.db.cards[0]};
    delete rated.practiceHistory; delete rated.updatedAt;
    assert.deepEqual(rated, before[0]);
    assert.deepEqual(c.db.cards.slice(1), before.slice(1));
    assert.equal(c.db.cards[0].practiceHistory[0].rating, rating);
    assert.equal(c.sessionAnswered.size, 0);
  }
});
test('SRS training rates a future-due card with each normal rating and leaves 36 unanswered cards intact', () => {
  const intervals = {};
  for (const rating of ['again', 'hard', 'good', 'easy']) {
    const {c} = fixture(true), others = JSON.stringify(c.db.cards.slice(1));
    c.applyReviewRating(c.db.cards[0], rating);
    const card = c.db.cards[0];
    assert.equal(card.reps, 6);
    assert.equal(card.history.length, 1);
    assert.equal(card.history[0].rating, rating);
    assert.equal(card.lastReview, c.now());
    assert.equal(JSON.stringify(c.db.cards.slice(1)), others);
    assert.equal(c.sessionAnswered.size, 1);
    assert.equal(card.practiceHistory, undefined, 'no duplicate SRS/practice rating');
    intervals[rating] = card.due - c.now();
  }
  assert.equal(intervals.again, 600000);
  assert.ok(intervals.hard < intervals.good && intervals.good < intervals.easy);
});
test('training rates the current saved object after a merge and skips deleted cards', () => {
  const {c} = fixture(true), stale = c.db.cards[0];
  c.db.cards = structuredClone(c.db.cards);
  c.applyReviewRating(stale, 'again');
  assert.equal(stale.history.length, 0);
  assert.equal(c.db.cards[0].history.length, 1);
  c.db.cards.shift();
  const before = JSON.stringify(c.db.cards);
  assert.equal(c.applyReviewRating(stale, 'easy'), null);
  assert.equal(JSON.stringify(c.db.cards), before);
});
test('normal review always uses SRS even when the training option is off', () => {
  const {c} = fixture(false);
  c.reviewMode = 'srs';
  c.applyReviewRating(c.db.cards[0], 'good');
  assert.equal(c.db.cards[0].history[0].rating, 'good');
  assert.equal(c.db.cards[0].practiceHistory, undefined);
});
