const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const curated = fs.readFileSync(path.join(__dirname, '../docs/resources/curated-sets.js'), 'utf8');

function functionSource(name) {
  const start = app.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  const firstLineEnd = app.indexOf('\n', start);
  const end = app.slice(start, firstLineEnd).endsWith('}') ? firstLineEnd : app.indexOf('\n}', start) + 2;
  return app.slice(start, end);
}

function fixture(cards = []) {
  const nodes = Object.fromEntries(['reviewSetTiles', 'reviewSetFilter', 'reviewDueSummary', 'reviewNextDue', 'startReview'].map(id => [id, {value: '', textContent: '', innerHTML: '', disabled: false}]));
  const tiles = nodes.reviewSetTiles;
  const buttons = new Map();
  tiles.querySelectorAll = selector => {
    const matches = [...tiles.innerHTML.matchAll(/<button\b([^>]*)>/g)];
    const result = matches.filter(m => new RegExp('class="[^"]*' + selector.slice(1) + '\\b').test(m[1])).map(m => {
      const dataset = Object.fromEntries([...m[1].matchAll(/data-([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
      return {dataset, disabled: /\bdisabled\b/.test(m[1]), pressed: /aria-pressed="true"/.test(m[1])};
    });
    buttons.set(selector, result);
    return result;
  };
  const context = vm.createContext({window: {}, Math: Object.create(Math), Date, Set, Map, crypto: {randomUUID: () => 'test-' + (++context.sequence)}, sequence: 0});
  vm.runInContext(curated, context);
  Object.assign(context, {
    $: id => nodes[id], db: {cards, meta: {sets: {}}}, USER_SET_ID: 'my-cards',
    CURATED_SETS: context.window.KOTODAMA_CURATED_SETS, now: () => 1000000,
    V5_DAY: 86400000, V5_MIN: 60000, reviewDirection: 'mixed',
    confirm: () => true, startReview: () => {context.started = nodes.reviewSetFilter.value;},
    refresh: () => {context.renderReviewSetTiles(); context.refreshReviewExpedition(context.cardsForSet(nodes.reviewSetFilter.value, context.dueCards()));},
    save: () => context.refresh()
  });
  for (const name of ['safe', 'uid', 'setDefinitions', 'ensureCardSets', 'ensureCardV5', 'cardStatus', 'cardsForSet', 'setSafetyScore', 'curatedIntroducedIds', 'lessonState', 'nextGuidedLesson', 'introduceGuidedLesson', 'dueCards', 'formatNextDue', 'renderReviewSetTiles', 'refreshReviewExpedition', 'mixedReviewJPProbability', 'chooseReviewDirection']) {
    vm.runInContext(functionSource(name), context);
  }
  nodes.reviewSetFilter.value = 'all';
  context.refresh();
  return {context, nodes, buttons};
}

const card = (id, setId, due, state = 'new') => ({id, front: '猫', back: 'Katze', reading: 'ねこ', setIds: [setId], due, state});

test('both application scripts compile and curated sets remain data only', () => {
  new vm.Script(app);
  new vm.Script(curated);
  const context = vm.createContext({window: {}});
  vm.runInContext(curated, context); // UI event hooks and DOM patches must not return.
  assert.ok(context.window.KOTODAMA_CURATED_SETS[0].lessons.length > 0);
  assert.equal(context.window.chooseReviewDirection, undefined);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, 'HTML IDs are unique');
});

test('all cards is selected initially; due counts include all sets', () => {
  const {nodes, buttons} = fixture([card('1', 'my-cards', 1), card('2', 'nuances-daily', 1), card('3', 'my-cards', 2000000)]);
  assert.match(nodes.reviewDueSummary.textContent, /Alle Karten: 2 Karten/);
  assert.equal(nodes.startReview.disabled, false);
  const choices = buttons.get('.review-set-choice');
  assert.equal(choices.filter(b => b.pressed).length, 1);
  assert.equal(choices.find(b => b.pressed).dataset.set, 'all');
  buttons.get('.review-set-learn').find(b => b.dataset.set === 'all').onclick();
});

test('set selection filters the next due date and disables empty reviews', () => {
  const {context, nodes, buttons} = fixture([card('1', 'my-cards', 1180000), card('2', 'nuances-daily', 1060000)]);
  buttons.get('.review-set-choice').find(b => b.dataset.set === 'my-cards').onclick();
  assert.match(nodes.reviewDueSummary.textContent, /^Meine Karten:/);
  assert.match(nodes.reviewNextDue.textContent, /3 Minuten/);
  assert.equal(nodes.startReview.disabled, true);
  assert.equal(buttons.get('.review-set-learn').find(b => b.dataset.set === 'my-cards').disabled, true);
  context.db.cards[0].due = 1;
  context.refresh();
  assert.equal(nodes.startReview.disabled, false);
  buttons.get('.review-set-learn').find(b => b.dataset.set === 'my-cards').onclick();
  assert.equal(context.started, 'my-cards');
});

test('empty user and curated sets show actionable messages', () => {
  const {nodes, buttons} = fixture();
  assert.equal(nodes.startReview.disabled, true);
  buttons.get('.review-set-choice').find(b => b.dataset.set === 'my-cards').onclick();
  assert.match(nodes.reviewNextDue.textContent, /eigene Karte/);
  buttons.get('.review-set-choice').find(b => b.dataset.set === 'nuances-daily').onclick();
  assert.match(nodes.reviewNextDue.textContent, /neue Lerneinheit/);
});

test('introducing a lesson selects the set, creates due cards once, and updates progress', () => {
  const {context, nodes, buttons} = fixture();
  const introduce = () => buttons.get('.review-set-new').find(b => b.dataset.set === 'nuances-daily').onclick();
  context.confirm = () => false;
  introduce();
  assert.equal(context.db.cards.length, 0);
  context.confirm = () => true;
  introduce();
  assert.equal(nodes.reviewSetFilter.value, 'nuances-daily');
  assert.equal(context.db.cards.length, 3);
  assert.match(nodes.reviewDueSummary.textContent, /3 Karten/);
  assert.equal(nodes.startReview.disabled, false);
  assert.match(nodes.reviewSetTiles.innerHTML, /3 \/ \d+ eingeführt/);
  context.introduceGuidedLesson('nuances-daily', 'freq-core');
  assert.equal(context.db.cards.length, 3, 'no duplicate templates');
});

test('mixed direction favors DE to JP with exact thresholds for each learning state', () => {
  const {context} = fixture();
  for (const [state, jpProbability] of [['new', .45], ['learning', .40], ['relearning', .40], ['mature', .35]]) {
    const c = card(state, 'my-cards', 1, state);
    assert.equal(context.mixedReviewJPProbability(c), jpProbability);
    context.Math.random = () => jpProbability - .000001;
    assert.equal(context.chooseReviewDirection(c), 'jp-de');
    context.Math.random = () => jpProbability;
    assert.equal(context.chooseReviewDirection(c), 'de-jp');
    let jpCount = 0;
    for (let i = 0; i < 1000; i++) {
      context.Math.random = () => (i + .5) / 1000;
      if (context.chooseReviewDirection(c) === 'jp-de') jpCount++;
    }
    assert.equal(jpCount, jpProbability * 1000);
  }
});

test('explicit training directions bypass random weighting', () => {
  const {context} = fixture();
  context.Math.random = () => {throw new Error('explicit direction must not draw randomness');};
  for (const direction of ['jp-de', 'de-jp']) {
    context.reviewDirection = direction;
    assert.equal(context.chooseReviewDirection(card('1', 'my-cards', 1)), direction);
  }
});

test('adventure keeps its independent 50/50 mix and reading fallback', () => {
  const {context} = fixture();
  context.advState = {direction: 'mixed'};
  context.adventureRomajiAnswers = c => c.reading ? ['neko'] : [];
  vm.runInContext(functionSource('adventureDirectionFor'), context);
  const c = card('1', 'my-cards', 1);
  context.Math.random = () => .49999;
  assert.equal(context.adventureDirectionFor(c), 'jp-de');
  context.Math.random = () => .5;
  assert.equal(context.adventureDirectionFor(c), 'de-jp');
  c.reading = '';
  assert.equal(context.adventureDirectionFor(c), 'jp-de');
  context.advState.direction = 'de-jp';
  assert.equal(context.adventureDirectionFor(c), 'jp-de');
});
