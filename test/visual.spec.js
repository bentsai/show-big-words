const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'big-text.deck.v1';
const SCALE = [1334,1112,926,772,643,536,446,372,310,258,215,179,149,124,104,86,72,60,50,42];

// Base64url encoder mirroring the app's encodeDeck, for building #deck= URLs.
function encodeDeck(payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Load the app with a clean localStorage (no shared hash). The init script
// uses a sessionStorage flag so it only clears once per context — a reload or
// second navigation then exercises real persistence instead of re-clearing.
async function freshLoad(page) {
  await page.addInitScript((key) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.removeItem(key);
        sessionStorage.setItem('__seeded', '1');
      }
    } catch (e) {}
  }, STORAGE_KEY);
  await page.goto('/index.html');
  await page.waitForSelector('.slide-row.selected');
}

// Load the app with a pre-seeded deck in localStorage (seeded once per context).
async function loadWithDeck(page, deck) {
  await page.addInitScript(({ key, value }) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('__seeded', '1');
      }
    } catch (e) {}
  }, { key: STORAGE_KEY, value: JSON.stringify(deck) });
  await page.goto('/index.html');
  await page.waitForSelector('.slide-row.selected');
}

function readDeck(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

// Reorder by dragging a slide's move handle. Native draggable DnD is not reliably
// driven by Playwright's mouse-based dragTo, so we dispatch the exact HTML5
// drag events the app listens for: dragstart on the .move, drop on the target row.
async function dragNumber(page, fromIndex, toIndex) {
  await page.evaluate(({ fromIndex, toIndex }) => {
    const rows = document.querySelectorAll('.slide-row');
    const move = rows[fromIndex].querySelector('.move');
    const target = rows[toIndex];
    const dt = new DataTransfer();
    move.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    move.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  }, { fromIndex, toIndex });
}

// ---------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------

test.describe('data model', () => {
  test('first load seeds a single sample slide', async ({ page }) => {
    await freshLoad(page);
    const rows = page.locator('.slide-row');
    await expect(rows).toHaveCount(1);
    await expect(page.locator('#slide-text')).toHaveValue('Ship');
    const deck = await readDeck(page);
    expect(deck.slides.length).toBe(1);
    expect(deck.version).toBe(1);
  });

  test('editing updates only the current slide', async ({ page }) => {
    await freshLoad(page);
    await page.locator('#btn-new').click();
    await expect(page.locator('.slide-row')).toHaveCount(2);

    // The new slide is selected and empty; type into it.
    await page.locator('#slide-text').fill('Second');
    let deck = await readDeck(page);
    expect(deck.slides[0].text).toBe('Ship');
    expect(deck.slides[1].text).toBe('Second');

    // Switch to the first slide; its text is unchanged.
    await page.locator('.slide-row').first().click();
    await expect(page.locator('#slide-text')).toHaveValue('Ship');
  });

  test('new slide creates an empty, selected slide', async ({ page }) => {
    await freshLoad(page);
    await page.locator('#slide-text').fill('Alpha');
    await page.locator('#btn-new').click();
    await expect(page.locator('.slide-row')).toHaveCount(2);
    // The new slide is selected, empty, and numbered 2 (zero-padded display).
    await expect(page.locator('#slide-text')).toHaveValue('');
    await expect(page.locator('.slide-row.selected .num')).toHaveText('02');

    const deck = await readDeck(page);
    expect(deck.slides[0].text).toBe('Alpha');
    expect(deck.slides[1].text).toBe('');
    expect(deck.currentSlideId).toBe(deck.slides[1].id);
  });

  test('delete is hidden at one slide and removes the current slide otherwise', async ({ page }) => {
    await freshLoad(page);
    await expect(page.locator('.delete')).toHaveCount(0);

    await page.locator('#btn-new').click();
    await page.locator('#slide-text').fill('Two');
    await expect(page.locator('.delete')).toBeVisible();

    await page.locator('.delete').click();
    await expect(page.locator('.slide-row')).toHaveCount(1);
    await expect(page.locator('.delete')).toHaveCount(0);
    const deck = await readDeck(page);
    expect(deck.slides.some(s => s.id === deck.currentSlideId)).toBe(true);
  });

  test('drag-move reorder keeps selection on the moved slide', async ({ page }) => {
    await freshLoad(page);
    await page.locator('#slide-text').fill('One');
    await page.locator('#btn-new').click();
    await page.locator('#slide-text').fill('Two');

    // Slide 2 ("Two") is selected; drag its move handle above slide 1.
    await dragNumber(page, 1, 0);

    const deck = await readDeck(page);
    expect(deck.slides[0].text).toBe('Two');
    expect(deck.slides[1].text).toBe('One');
    // Selection follows the moved slide, now at the top and open for editing.
    expect(deck.currentSlideId).toBe(deck.slides[0].id);
    await expect(page.locator('.slide-row.selected #slide-text')).toHaveValue('Two');
  });

  test('settings cycle on click and persist independently of slide text', async ({ page }) => {
    await freshLoad(page);
    await page.locator('#set-theme').click();       // paper -> ink
    await page.locator('#set-font').click();         // sans -> mono
    await page.locator('#set-transition').click();   // none -> wipe
    await page.locator('#slide-text').fill('Body changed');

    const deck = await readDeck(page);
    expect(deck.settings).toEqual({ theme: 'ink', font: 'mono', transition: 'wipe' });
    expect(deck.slides[0].text).toBe('Body changed');
  });

  test('reload restores the deck from localStorage', async ({ page }) => {
    await freshLoad(page);
    await page.locator('#slide-text').fill('Persisted');
    await page.locator('#set-theme').click(); // paper -> ink

    await page.reload();
    await page.waitForSelector('.slide-row.selected');
    await expect(page.locator('#slide-text')).toHaveValue('Persisted');
    await expect(page.locator('#set-theme')).toHaveText('ink');
  });

  test('alignment indicator is stacked beside the editor and restored from text', async ({ page }) => {
    await freshLoad(page);
    await page.locator('#btn-new').click();
    await expect(page.locator('.delete')).toBeVisible();

    const align = page.locator('.slide-row.selected .align');
    await expect(align).toHaveText('↥‐↧');
    await expect(align).toHaveAttribute('aria-label', 'Vertical alignment: center');

    const layout = await page.evaluate(() => {
      const indicator = document.querySelector('.slide-row.selected .align');
      const symbols = Array.from(indicator.querySelectorAll('[data-align]'));
      const textarea = document.getElementById('slide-text');
      const del = document.querySelector('.slide-row.selected .delete');
      const ir = indicator.getBoundingClientRect();
      const tr = textarea.getBoundingClientRect();
      const dr = del.getBoundingClientRect();
      return {
        stacked: symbols.every((symbol, i) =>
          i === 0 || symbol.getBoundingClientRect().top > symbols[i - 1].getBoundingClientRect().top
        ),
        besideEditor: ir.left > tr.right,
        alignedWithDelete: Math.abs(ir.right - dr.right) <= 1
      };
    });
    expect(layout).toEqual({ stacked: true, besideEditor: true, alignedWithDelete: true });

    await page.locator('#slide-text').fill('Top aligned\n');
    await expect(align).toHaveAttribute('aria-label', 'Vertical alignment: top');
    await expect(page.locator('.slide-row.selected .align [data-align="top"]')).toHaveClass(/on/);

    let deck = await readDeck(page);
    expect(deck.slides[1].text).toBe('Top aligned\n');

    await page.reload();
    await page.waitForSelector('.slide-row.selected');
    await page.locator('.slide-row').nth(1).click();
    await expect(page.locator('.slide-row.selected .align')).toHaveAttribute('aria-label', 'Vertical alignment: top');
  });
});

// ---------------------------------------------------------------------
// Editor interactions (new for the manuscript redesign)
// ---------------------------------------------------------------------

test.describe('editor interactions', () => {
  test('clicking a collapsed slide opens it and collapses the previous one', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [
      { id: 'slide-1', text: 'First', align: 'center' },
      { id: 'slide-2', text: 'Second', align: 'center' }
    ], currentSlideId: 'slide-1', nextId: 3 });

    // Slide 1 is open initially (zero-padded display).
    await expect(page.locator('.slide-row.selected .num')).toHaveText('01');
    await expect(page.locator('#slide-text')).toHaveValue('First');

    // Open slide 2 by clicking its collapsed row.
    await page.locator('.slide-row').nth(1).click();
    await expect(page.locator('.slide-row.selected .num')).toHaveText('02');
    await expect(page.locator('#slide-text')).toHaveValue('Second');
    // Exactly one textarea is open at a time.
    await expect(page.locator('#slide-text')).toHaveCount(1);
    // Slide 1 is now collapsed to its snippet.
    await expect(page.locator('.slide-row').nth(0).locator('.snippet')).toHaveText('First');
  });

  test('slide body height does not shift between active and inactive', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [
      { id: 'slide-1', text: 'One line of text', align: 'center' },
      { id: 'slide-2', text: 'Line one\nLine two\nLine three', align: 'center' }
    ], currentSlideId: 'slide-1', nextId: 3 });

    const bodyHeight = (index) => page.evaluate((i) =>
      Math.round(document.querySelector('.slide-row[data-index="' + i + '"] .slide-body').getBoundingClientRect().height), index);

    // Slide 1 (one line) open vs collapsed.
    const oneLineActive = await bodyHeight(0);
    await page.locator('.slide-row').nth(1).click();   // open slide 2, collapses slide 1
    const oneLineInactive = await bodyHeight(0);
    expect(oneLineActive).toBe(oneLineInactive);

    // Slide 2 (three lines) open vs collapsed.
    const multiActive = await bodyHeight(1);
    await page.locator('.slide-row').nth(0).click();   // open slide 1, collapses slide 2
    const multiInactive = await bodyHeight(1);
    expect(multiActive).toBe(multiInactive);
  });

  test('clicking a settings word cycles to the next value and persists', async ({ page }) => {
    await freshLoad(page);
    await expect(page.locator('#set-transition')).toHaveText('no transition');
    await page.locator('#set-transition').click();
    await expect(page.locator('#set-transition')).toHaveText('wipe transition');
    const deck = await readDeck(page);
    expect(deck.settings.transition).toBe('wipe');
  });

  test('no Duplicate control exists', async ({ page }) => {
    await freshLoad(page);
    await expect(page.locator('#btn-dup')).toHaveCount(0);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text.toLowerCase()).not.toContain('duplicate');
  });
});

// ---------------------------------------------------------------------
// URL sharing
// ---------------------------------------------------------------------

test.describe('url sharing', () => {
  test('Share URL encodes the full deck into #deck=', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await freshLoad(page);
    await page.locator('#slide-text').fill('Shared');
    await page.locator('#set-theme').click(); // paper -> ink
    await page.locator('#btn-share').click();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('#deck=');

    const encoded = clip.split('#deck=')[1];
    const json = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    const payload = JSON.parse(json);
    expect(payload.slides[0].text).toBe('Shared');
    expect(payload.settings.theme).toBe('ink');
  });

  test('visiting a valid shared hash imports and saves the deck', async ({ page }) => {
    const payload = {
      version: 1,
      settings: { theme: 'ink', font: 'serif', transition: 'none' },
      slides: [
        { id: 'slide-1', text: 'Imported one', align: 'center' },
        { id: 'slide-2', text: 'Imported two', align: 'top' }
      ]
    };
    // Seed a different local deck, then land on the hash URL in a single
    // navigation so boot() runs with the hash present and the local deck set.
    await page.addInitScript(({ key, value }) => {
      try { localStorage.setItem(key, value); } catch (e) {}
    }, { key: STORAGE_KEY, value: JSON.stringify({ version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Local only', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 }) });
    await page.goto('/index.html#deck=' + encodeDeck(payload));
    await page.waitForSelector('.slide-row.selected');

    await expect(page.locator('.slide-row')).toHaveCount(2);
    await expect(page.locator('#slide-text')).toHaveValue('Imported one');
    await expect(page.locator('#set-font')).toHaveText('serif');

    // Hash is cleared and the imported deck is now in localStorage.
    expect(page.url()).not.toContain('#deck=');
    const deck = await readDeck(page);
    expect(deck.slides.map(s => s.text)).toEqual(['Imported one', 'Imported two']);
  });

  test('invalid hash does not overwrite localStorage', async ({ page }) => {
    const local = { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Keep me', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 };
    await page.addInitScript(({ key, value }) => {
      try { localStorage.setItem(key, value); } catch (e) {}
    }, { key: STORAGE_KEY, value: JSON.stringify(local) });
    await page.goto('/index.html#deck=not-valid-base64-$$$');
    await page.waitForSelector('.slide-row.selected');

    await expect(page.locator('#slide-text')).toHaveValue('Keep me');
    const deck = await readDeck(page);
    expect(deck.slides[0].text).toBe('Keep me');
  });

  test('no hash loads localStorage or the sample deck', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'From storage', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await expect(page.locator('#slide-text')).toHaveValue('From storage');
  });
});

// ---------------------------------------------------------------------
// Rendering and presentation
// ---------------------------------------------------------------------

// Enter present mode (the deck must already be loaded).
async function present(page) {
  await page.locator('#btn-present').click();
  // #present is a zero-size wrapper (its layers are position:fixed), so wait on
  // the editor hiding rather than the wrapper becoming "visible".
  await page.waitForFunction(() => document.getElementById('editor').classList.contains('hidden'));
}

test.describe('presentation', () => {
  test('present starts at the selected slide', async ({ page }) => {
    await freshLoad(page);
    await page.locator('#slide-text').fill('First');
    await page.locator('#btn-new').click();
    await page.locator('#slide-text').fill('Second');
    await page.locator('#btn-new').click();
    await page.locator('#slide-text').fill('Third');

    // Select the middle slide, then present.
    await page.locator('.slide-row').nth(1).click();
    await present(page);
    await expect(page.locator('#text')).toHaveText('Second');
  });

  test('single word is never broken across lines', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Ship', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    await expect(page.locator('#text')).toHaveText('Ship');

    const lines = await page.evaluate(() => {
      const el = document.getElementById('text');
      const textNode = el.firstChild.firstChild;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      return range.getClientRects().length;
    });
    expect(lines).toBe(1);
  });

  test('single word fills significant viewport width', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Ship', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    await expect(page.locator('#text')).toHaveText('Ship');
    const ratio = await page.evaluate(() => {
      const el = document.getElementById('text');
      return el.getBoundingClientRect().width / window.innerWidth;
    });
    expect(ratio).toBeGreaterThan(0.5);
  });

  test('multi-word text wraps at spaces not mid-word', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Ship it today', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    await expect(page.locator('#text')).toHaveText('Ship it today');

    const hasBrokenWords = await page.evaluate(() => {
      const el = document.getElementById('text');
      const text = el.textContent;
      const words = text.split(/\s+/);
      const range = document.createRange();
      const textNode = el.firstChild.firstChild;
      let pos = 0;
      for (const word of words) {
        const start = text.indexOf(word, pos);
        range.setStart(textNode, start);
        range.setEnd(textNode, start + word.length);
        if (range.getClientRects().length > 1) return true;
        pos = start + word.length;
      }
      return false;
    });
    expect(hasBrokenWords).toBe(false);
  });

  test('text does not overflow the slide', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [
      { id: 'slide-1', text: 'Ship', align: 'center' },
      { id: 'slide-2', text: 'The best way to predict the future is to invent it', align: 'center' }
    ], currentSlideId: 'slide-1', nextId: 3 });
    await present(page);
    await expect(page.locator('#text')).toHaveText('Ship');

    for (let i = 0; i < 2; i++) {
      const overflow = await page.evaluate(() => {
        const slide = document.getElementById('slide');
        const text = document.getElementById('text');
        const s = slide.getBoundingClientRect();
        const t = text.getBoundingClientRect();
        return { right: t.right > s.right + 1, bottom: t.bottom > s.bottom + 1 };
      });
      expect(overflow.right).toBe(false);
      expect(overflow.bottom).toBe(false);
      if (i === 0) await page.keyboard.press('ArrowRight');
    }
  });

  test('keyboard navigation works', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [
      { id: 'slide-1', text: 'One', align: 'center' },
      { id: 'slide-2', text: 'Two', align: 'center' },
      { id: 'slide-3', text: 'Three', align: 'center' }
    ], currentSlideId: 'slide-1', nextId: 4 });
    await present(page);
    await expect(page.locator('#text')).toHaveText('One');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#text')).toHaveText('Two');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#text')).toHaveText('One');
    await page.keyboard.press('End');
    await expect(page.locator('#text')).toHaveText('Three');
    await page.keyboard.press('Home');
    await expect(page.locator('#text')).toHaveText('One');
  });

  test('f key cycles fonts and persists to the deck', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Ship', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    const getFont = () => page.evaluate(() => {
      const c = document.documentElement.className;
      if (c.includes('font-mono')) return 'mono';
      if (c.includes('font-serif')) return 'serif';
      if (c.includes('font-pixel')) return 'pixel';
      return 'sans';
    });
    expect(await getFont()).toBe('sans');
    await page.keyboard.press('f');
    expect(await getFont()).toBe('mono');

    // Exit and confirm the new font was saved to the deck and editor.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#editor:not(.hidden)');
    const deck = await readDeck(page);
    expect(deck.settings.font).toBe('mono');
    await expect(page.locator('#set-font')).toHaveText('mono');
  });

  test('t key cycles themes and persists to the deck', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Ship', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    const getBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await getBg()).toBe('rgb(255, 255, 255)'); // paper
    await page.keyboard.press('t');
    expect(await getBg()).toBe('rgb(17, 17, 17)'); // ink

    await page.keyboard.press('Escape');
    await page.waitForSelector('#editor:not(.hidden)');
    const deck = await readDeck(page);
    expect(deck.settings.theme).toBe('ink');
    await expect(page.locator('#set-theme')).toHaveText('ink');
  });

  test('b key toggles text visibility', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Ship', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    const getVis = () => page.evaluate(() => getComputedStyle(document.getElementById('text')).visibility);
    expect(await getVis()).toBe('visible');
    await page.keyboard.press('b');
    expect(await getVis()).toBe('hidden');
    await page.keyboard.press('b');
    expect(await getVis()).toBe('visible');
  });

  test('Escape returns to the editor', async ({ page }) => {
    await freshLoad(page);
    await present(page);
    await expect(page.locator('#present')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#editor:not(.hidden)');
    await expect(page.locator('#present')).toHaveClass(/hidden/);
  });

  test('subtext renders at half the main scale', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Main\n\nsubtext here', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    await expect(page.locator('.subtext')).toHaveCount(1);
    const result = await page.evaluate(() => {
      const text = document.getElementById('text');
      const sub = text.querySelector('.subtext');
      return { main: parseInt(text.style.fontSize), sub: parseInt(sub.style.fontSize) };
    });
    expect(result.sub).toBe(Math.round(result.main / 2));
  });

  test('tab-indented line renders centered', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: '\tcentered line\nnot centered', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    const result = await page.evaluate(() => {
      const text = document.getElementById('text');
      const centered = text.querySelector('.center');
      const divs = text.querySelectorAll('div');
      const nonCentered = Array.from(divs).find(d => !d.classList.contains('center'));
      return {
        hasCenter: !!centered,
        centeredText: centered ? centered.textContent : null,
        centeredAlign: centered ? getComputedStyle(centered).textAlign : null,
        nonCenteredAlign: nonCentered ? getComputedStyle(nonCentered).textAlign : null,
      };
    });
    expect(result.hasCenter).toBe(true);
    expect(result.centeredText).toBe('centered line');
    expect(result.centeredAlign).toBe('center');
    expect(result.nonCenteredAlign).not.toBe('center');
  });

  test('annotation renders 4 steps smaller with reduced opacity', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Do not be like them ((Matthew 6:8))', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    const result = await page.evaluate((SCALE) => {
      const text = document.getElementById('text');
      const ann = text.querySelector('.annotation');
      if (!ann) return { found: false };
      const parentIdx = SCALE.indexOf(parseInt(text.style.fontSize));
      const annIdx = SCALE.indexOf(parseInt(ann.style.fontSize));
      return { found: true, text: ann.textContent, opacity: getComputedStyle(ann).opacity, stepsDiff: annIdx - parentIdx };
    }, SCALE);
    expect(result.found).toBe(true);
    expect(result.text).toBe('Matthew 6:8');
    expect(parseFloat(result.opacity)).toBeLessThan(1);
    expect(result.stepsDiff).toBe(4);
  });

  test('per-slide align maps to flex alignment', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [
      { id: 'slide-1', text: 'Top\n', align: 'center' },
      { id: 'slide-2', text: 'Center', align: 'center' },
      { id: 'slide-3', text: '\nBottom', align: 'center' }
    ], currentSlideId: 'slide-1', nextId: 4 });
    await present(page);
    const align = () => page.evaluate(() => getComputedStyle(document.getElementById('slide')).alignItems);
    expect(await align()).toBe('flex-start');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#text')).toHaveText('Center');
    expect(await align()).toBe('center');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#text')).toHaveText('Bottom');
    expect(await align()).toBe('flex-end');
  });
});

// ---------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------

test.describe('styling', () => {
  test('UI contains no emoji', async ({ page }) => {
    await freshLoad(page);
    const text = await page.evaluate(() => document.body.innerText);
    // Match common emoji ranges.
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
    expect(emoji.test(text)).toBe(false);
  });

  test('controls remain visible and non-overlapping at mobile and desktop widths', async ({ page }) => {
    await freshLoad(page);
    for (const size of [{ width: 375, height: 700 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      const present = page.locator('#btn-present');
      const ta = page.locator('#slide-text');
      await expect(present).toBeVisible();
      await expect(ta).toBeVisible();
      const overlap = await page.evaluate(() => {
        const a = document.getElementById('btn-present').getBoundingClientRect();
        const b = document.getElementById('slide-text').getBoundingClientRect();
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      });
      expect(overlap).toBe(false);
    }
  });
});
