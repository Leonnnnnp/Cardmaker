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
    V5_DAY: 86400000, V5_MIN: 60000, reviewDirection: 'mixed', reviewDirectionBalance: 0,
    confirm: () => true, startReview: () => {context.started = nodes.reviewSetFilter.value;},
    refresh: () => {context.renderReviewSetTiles(); context.refreshReviewExpedition(context.cardsForSet(nodes.reviewSetFilter.value, context.dueCards()));},
    save: () => context.refresh()
  });
  for (const name of ['safe', 'uid', 'customSetDefinitions', 'setDefinitions', 'ensureCardSets', 'ensureCardV5', 'cardStatus', 'cardsForSet', 'setSafetyScore', 'curatedIntroducedIds', 'lessonState', 'nextGuidedLesson', 'introduceGuidedLesson', 'reviewAvailability', 'dueCards', 'laterReviewText', 'formatNextDue', 'renderReviewSetTiles', 'refreshReviewExpedition', 'mixedReviewJPProbability', 'resetReviewDirectionBalance', 'chooseReviewDirection']) {
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

test('mixed sessions meet weighting targets without one-sided clusters', () => {
  const {context} = fixture();
  for (const [state, jpProbability] of [['new', .45], ['learning', .40], ['relearning', .40], ['mature', .35]]) {
    const c = card(state, 'my-cards', 1, state);
    assert.equal(context.mixedReviewJPProbability(c), jpProbability);
    for (const offset of [0, .1, .5, .9999]) {
      context.Math.random = () => offset;
      context.resetReviewDirectionBalance();
      let jpCount = 0, last = '', streak = 0;
      for (let i = 0; i < 1000; i++) {
        const direction = context.chooseReviewDirection(c);
        if (direction === 'jp-de') jpCount++;
        streak = direction === last ? streak + 1 : 1;
        last = direction;
        assert.ok(streak <= 2, 'no long same-direction runs');
        assert.ok(Math.abs(jpCount - (i + 1) * jpProbability) < 1 + 1e-9);
      }
      assert.equal(jpCount, jpProbability * 1000);
    }
  }
});

test('mixed learning states stay balanced and direction selection leaves SRS intact', () => {
  const {context} = fixture();
  context.Math.random = () => .7;
  context.resetReviewDirectionBalance();
  let expected = 0, jpCount = 0;
  for (let i = 0; i < 400; i++) {
    const state = ['new', 'learning', 'relearning', 'mature'][i % 4];
    const c = card(String(i), 'my-cards', 123456, state);
    context.ensureCardV5(c);
    const before = JSON.stringify(c);
    expected += context.mixedReviewJPProbability(c);
    if (context.chooseReviewDirection(c) === 'jp-de') jpCount++;
    assert.ok(Math.abs(jpCount - expected) < 1 + 1e-9);
    assert.equal(JSON.stringify(c), before);
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

test('storytelling catalogue appears without introducing cards and has complete, unique content', () => {
  const {context, nodes, buttons} = fixture();
  const set = context.CURATED_SETS.find(s => s.id === 'storytelling');
  assert.equal(set.name, 'Geschichten erzählen');
  assert.equal(set.mode, 'guided');
  assert.equal(set.lessons.length, 6);
  assert.equal(set.cards.length, 19);
  assert.equal(new Set(set.cards.map(c => c.id)).size, 19);
  for (const card of set.cards) {
    assert.ok(card.front && card.reading && card.back && card.example);
    assert.ok(card.example.split('\n').length >= 3, 'Japanese, German, and nuance');
  }
  assert.equal(context.db.cards.length, 0);
  assert.match(nodes.reviewSetTiles.innerHTML, /Geschichten erzählen/);
  const introduce = () => buttons.get('.review-set-new').find(b => b.dataset.set === 'storytelling').onclick();
  context.confirm = () => false;
  introduce();
  assert.equal(context.db.cards.length, 0);
  context.confirm = () => true;
  introduce();
  assert.equal(context.db.cards.length, 3);
  assert.equal(nodes.reviewSetFilter.value, 'storytelling');
  assert.ok(context.db.cards.every(c => c.state === 'new' && c.due === context.now()));
});

test('storytelling lessons can be introduced in any order without touching existing SRS or edits', () => {
  const existing = card('existing', 'my-cards', 9876543, 'mature');
  const {context} = fixture([existing]);
  const before = JSON.stringify(existing);
  const set = context.CURATED_SETS.find(s => s.id === 'storytelling');
  for (const lesson of [...set.lessons].reverse()) context.introduceGuidedLesson(set.id, lesson.id);
  assert.equal(context.db.cards.length, 20);
  assert.equal(JSON.stringify(existing), before);
  const personal = context.db.cards.find(c => c.curatedSetId === set.id);
  personal.front = 'persönlich bearbeitet';
  personal.due = 123456789;
  const complete = JSON.stringify(context.db.cards);
  for (const lesson of set.lessons) context.introduceGuidedLesson(set.id, lesson.id);
  assert.equal(JSON.stringify(context.db.cards), complete);
  assert.equal(context.nextGuidedLesson(set), null);
});

test('all storytelling Kanji in examples and explanations carry Kana readings', () => {
  const {context} = fixture();
  const set = context.CURATED_SETS.find(s => s.id === 'storytelling');
  for (const card of set.cards) {
    const withoutReadings = card.example.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+（[\p{Script=Hiragana}\p{Script=Katakana}ー]+）/gu, '');
    assert.doesNotMatch(withoutReadings, /\p{Script=Han}/u, card.id + ' has no unannotated Kanji');
    const stripped = card.example.replace(/（[\p{Script=Hiragana}\p{Script=Katakana}ー]+）/gu, '');
    assert.equal(stripped, card.legacyExample, 'only readings change, including explanations');
  }
});

test('existing unedited storytelling cards upgrade without changing SRS or personal edits', () => {
  const {context} = fixture();
  for (const name of ['upgradeStorytellingReadings', 'normalizeSaveData']) vm.runInContext(functionSource(name), context);
  const set = context.CURATED_SETS.find(s => s.id === 'storytelling');
  const cards = set.cards.map((t, i) => ({id: String(i), curatedSetId: set.id, sourceTemplateId: t.id, example: t.legacyExample, front: 'persönlich bearbeitet', due: 987654321, state: 'mature', reps: 23, history: [{rating:'good', at:1234}], stability: 55, difficulty: 4, learningStep: 0, lapses: 2, lastReview: 1234, updatedAt: 4567}));
  const edited = {...cards[0], id:'edited', example: cards[0].example+' Meine eigene Notiz.'};
  const unrelated = {...cards[0], id:'unrelated', curatedSetId:'nuances-daily'};
  cards.push(edited, unrelated);
  const before = JSON.parse(JSON.stringify(cards));
  const save = {cards, meta:{}};
  context.normalizeSaveData(save);
  for(let i=0; i<set.cards.length; i++){
    assert.equal(cards[i].example, set.cards[i].example);
    assert.deepEqual({...cards[i], example: before[i].example}, before[i]);
  }
  assert.deepEqual(edited, before.at(-2));
  assert.deepEqual(unrelated, before.at(-1));
  const once = JSON.stringify(save);
  context.normalizeSaveData(save);
  assert.equal(JSON.stringify(save), once, 'upgrade is idempotent on load, merge, and save');
});



