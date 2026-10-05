const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '../docs');
  const server = http.createServer((req, res) => {
    const name = req.url.split('?')[0];
    const allowed = {'/': 'index.html', '/resources/curated-sets.js': 'resources/curated-sets.js', '/resources/learning-export.js': 'resources/learning-export.js'};
    if (!allowed[name]) {res.writeHead(404); return res.end();}
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(fs.readFileSync(path.join(root, allowed[name])));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless: true});
  const makeCard = (id, setId) => ({id, front: '猫', reading: 'ねこ', back: 'Katze', example: '猫がいる。', setIds: [setId], source: 'user', due: 123456789, intervalDays: 42, reps: 7, state: 'mature', lastReview: 123450000, ease: 2.6, lapses: 2, learningStep: 0, stability: 42, difficulty: 4, history: [{at: 123450000, rating: 'good'}]});
  const seed = {cards: [makeCard('own', 'my-cards'), makeCard('set', 'nuances-daily')], meta: {sets: {}, soundEnabled: false}};
  const fields = ['id', 'front', 'reading', 'back', 'example', 'due', 'intervalDays', 'reps', 'state', 'lastReview', 'ease', 'lapses', 'learningStep', 'stability', 'difficulty', 'history'];
  const srsSnapshot = page => page.evaluate(keys => db.cards.filter(c => c.id === 'own' || c.id === 'set').map(c => Object.fromEntries(keys.map(k => [k, c[k]]))), fields);
  fs.mkdirSync('test-results', {recursive: true});
  try {
    for (const width of [320, 360, 390, 430, 768]) {
      const context = await browser.newContext({viewport: {width, height: 900}});
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await context.addInitScript(data => localStorage.setItem('kotodama_srs_proto_v1', JSON.stringify(data)), seed);
      await context.addInitScript(fail => Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(fail)throw new Error('Clipboard unavailable');window.testCopiedText=text;}}}),width===320);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      const before = await srsSnapshot(page);
      const beforeExport = await page.evaluate(()=>JSON.stringify(db));
      await page.locator('#learningExportBtn').click();
      assert.match(await page.locator('#learningExportText').inputValue(),/\| 猫 \| ねこ \| Katze \|/);
      await page.locator('#copyLearningExport').click();
      if(width===320){
        assert.match(await page.locator('#learningExportStatus').innerText(),/Text ist markiert/);
        assert.ok(await page.locator('#learningExportText').evaluate(el=>el.selectionEnd-el.selectionStart===el.value.length));
      }else{
        assert.match(await page.locator('#learningExportStatus').innerText(),/Kopiert!/);
        assert.equal(await page.evaluate(()=>window.testCopiedText),await page.locator('#learningExportText').inputValue());
      }
      assert.equal(await page.evaluate(()=>JSON.stringify(db)),beforeExport,'export leaves entire save unchanged');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:'test-results/export-'+width+'.png',fullPage:true});
      await page.locator('#learningExportClose').click();
      await page.locator('[data-screen="reviewMenu"]').click();
      assert.equal(await page.locator('#reviewSetTiles').count(), 1);
      assert.equal(await page.locator('.review-set-tile').count(), 3);
      const layout = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll('.review-set-tile')];
        return {overflow: document.documentElement.scrollWidth > innerWidth, columns: getComputedStyle(document.querySelector('#reviewSetTiles')).gridTemplateColumns.split(' ').length,
          statusTop: document.querySelector('.review-status-block').getBoundingClientRect().top,
          tiles: tiles.map(t => ({bottom: t.getBoundingClientRect().bottom, buttons: [...t.querySelectorAll('button')].map(b => b.getBoundingClientRect().bottom)}))};
      });
      assert.equal(layout.overflow, false, 'no horizontal overflow at ' + width);
      assert.equal(layout.columns, width < 340 ? 1 : width <= 520 ? 2 : 3);
      for (const tile of layout.tiles) {
        assert.ok(tile.buttons.every(bottom => bottom <= tile.bottom + 1), 'buttons stay inside tiles at ' + width);
        assert.ok(layout.statusTop >= tile.bottom, 'status stays below tiles at ' + width);
      }
      await page.locator('.review-set-choice[data-set="my-cards"]').click();
      assert.equal(await page.locator('.review-set-choice[data-set="my-cards"]').getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('#reviewDueSummary').innerText(), /Meine Karten: 1 Karte/);
      await page.screenshot({path: 'test-results/review-' + width + '.png', fullPage: true});
      assert.deepEqual(await srsSnapshot(page), before, 'navigation preserves SRS');
      page.once('dialog', dialog => dialog.accept());
      await page.locator('.review-set-new').click();
      assert.equal(await page.locator('#reviewSetFilter').inputValue(), 'nuances-daily');
      assert.deepEqual(await srsSnapshot(page), before, 'lesson introduction preserves existing cards');
      await page.locator('#reviewMenu [data-screen="home"]').click();
      await page.locator('#learningExportBtn').click();
      assert.match(await page.locator('#learningExportText').inputValue(),/5 Karten/,'reopening reflects newly introduced cards');
      await page.locator('#learningExportClose').click();
      await page.locator('[data-screen="trainingMenu"]').click();
      await page.locator('#trainingSetFilter').selectOption('my-cards');
      await page.locator('#trainAllBtn').click();
      await page.locator('#showAnswer').click();
      const trainingFinished = page.waitForEvent('dialog');
      await page.locator('[data-rate="good"]').click();
      await (await trainingFinished).dismiss();
      await page.locator('#home').waitFor({state: 'visible'});
      assert.deepEqual(await srsSnapshot(page), before, 'training ratings preserve SRS');
      await page.locator('[data-screen="adventureMenu"]').click();
      await page.locator('#adventureSetFilter').selectOption('my-cards');
      await page.locator('#adventureDirection').selectOption('jp-de');
      await page.locator('#startAdventure').click();
      await page.locator('#advInput').fill('Katze');
      await page.locator('#advSubmit').click();
      assert.deepEqual(await srsSnapshot(page), before, 'adventure answers preserve SRS');
      assert.deepEqual(errors, [], 'no runtime errors at ' + width);
      console.log('Browser checks passed at ' + width + 'px: layout, set actions, SRS invariants, training, adventure');
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
