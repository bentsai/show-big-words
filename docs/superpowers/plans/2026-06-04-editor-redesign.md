# Editor Redesign — "Manuscript" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the border-heavy editor chrome in `index.html` with a type-driven, single-column "manuscript" editor — one hairline under the masthead, inline slide editing one-at-a-time, click-to-cycle settings, and drag-the-number reorder — without changing the deck model, storage, URL sharing, present mode, or the rendering core.

**Architecture:** `index.html` stays a single static file with embedded CSS/JS. The redesign touches three contiguous regions: the editor-chrome CSS block, the editor markup, and the editor-view JS. The slide-rendering core, deck model, storage, URL-hash sharing, and present mode are untouched in behavior. The deck is still selected one slide at a time via `currentSlideId`; the open slide *is* the selection, rendered inline as a `<textarea>` plus a controls row, while every other slide collapses to a big-type snippet.

**Tech Stack:** Vanilla HTML/CSS/JS in one file; Playwright (`@playwright/test`) served over `http-server` for tests; Google Fonts (adding Fraunces).

---

## Design source

This plan implements `docs/superpowers/specs/2026-06-04-editor-redesign-design.md`. Read it for the visual rationale. One open question was resolved before planning: **the Share URL control stays as a quiet muted text link in the masthead** (between the settings summary and the Present button). Its behavior and the `shareUrl()` wiring are unchanged.

## File structure

Only two files change:

- **Modify: `index.html`** — three regions rewritten:
  1. The Google Fonts `<link>` (line ~9): add Fraunces.
  2. The editor-chrome CSS block (between `/* ---- Editor chrome ... ---- */` and the closing `</style>`): replaced with manuscript styles. The slide-rendering CSS block above it is untouched.
  3. The editor markup (`<!-- Editor mode --> <div id="editor"> ... </div>`): replaced with masthead + single-column stack. The `#present` block above it is untouched.
  4. The editor-view JS (the `// ===== Editor view =====` section through the slide-list click handler) plus removal of `duplicateSlide` and `moveSlide` in the slide-operations section.
- **Modify: `test/visual.spec.js`** — add a `dragNumber` helper, update selectors/assertions on editor-interaction tests for the new DOM, and add three new tests. Deck-model, storage, URL-sharing, and present-mode behaviors are unchanged; only selectors change where the DOM changed.

Functions reused **unchanged**: `selectSlide`, `reorderSlide`, `deleteSlide`, `currentSlide`, `currentSlideIndex`, `saveDeck`, `newSlide`, `setStatus`, `snippetFor`, `setSnippet`, `shareUrl`, `enterPresent`, `exitPresent`, plus the entire rendering core and storage/URL layer. Functions **removed**: `duplicateSlide`, `moveSlide`, `renderAlign`.

> **Note on intermediate state:** A chrome rewrite of a single file cannot be split into separately-green commits — markup, CSS, and JS must change together for the suite to pass. Task 1 writes the tests (red). Task 2 rewrites `index.html` in ordered steps and ends green in one commit. Apply Task 2's edits in order before running the suite.

---

## Task 1: Write the redesigned test suite (red)

**Files:**
- Modify: `test/visual.spec.js`

We rewrite the spec first. Against the current (old) `index.html` the changed/new tests will fail — that is expected and proves they exercise the new DOM.

- [ ] **Step 1: Replace the entire contents of `test/visual.spec.js` with the version below**

This keeps every unchanged test verbatim (data-model seed/edit, all URL-sharing imports, all presentation and styling tests), updates the editor-interaction tests to the new DOM, adds a `dragNumber` helper, and adds three new tests.

```js
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

// Reorder by dragging a slide number. Native draggable DnD is not reliably
// driven by Playwright's mouse-based dragTo, so we dispatch the exact HTML5
// drag events the app listens for: dragstart on the .num, drop on the target row.
async function dragNumber(page, fromIndex, toIndex) {
  await page.evaluate(({ fromIndex, toIndex }) => {
    const rows = document.querySelectorAll('.slide-row');
    const num = rows[fromIndex].querySelector('.num');
    const target = rows[toIndex];
    const dt = new DataTransfer();
    num.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    num.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
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
    // The new slide is selected, empty, and numbered 2.
    await expect(page.locator('#slide-text')).toHaveValue('');
    await expect(page.locator('.slide-row.selected .num')).toHaveText('2');

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

  test('drag-number reorder keeps selection on the moved slide', async ({ page }) => {
    await freshLoad(page);
    await page.locator('#slide-text').fill('One');
    await page.locator('#btn-new').click();
    await page.locator('#slide-text').fill('Two');

    // Slide 2 ("Two") is selected; drag its number above slide 1.
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

  test('per-slide align is stored and restored', async ({ page }) => {
    await freshLoad(page);
    await page.locator('button[data-align="top"]').click();
    await expect(page.locator('button[data-align="top"]')).toHaveClass(/on/);
    let deck = await readDeck(page);
    expect(deck.slides[0].align).toBe('top');

    await page.reload();
    await page.waitForSelector('.slide-row.selected');
    await expect(page.locator('button[data-align="top"]')).toHaveClass(/on/);
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

    // Slide 1 is open initially.
    await expect(page.locator('.slide-row.selected .num')).toHaveText('1');
    await expect(page.locator('#slide-text')).toHaveValue('First');

    // Open slide 2 by clicking its collapsed row.
    await page.locator('.slide-row').nth(1).click();
    await expect(page.locator('.slide-row.selected .num')).toHaveText('2');
    await expect(page.locator('#slide-text')).toHaveValue('Second');
    // Exactly one textarea is open at a time.
    await expect(page.locator('#slide-text')).toHaveCount(1);
    // Slide 1 is now collapsed to its snippet.
    await expect(page.locator('.slide-row').nth(0).locator('.snippet')).toHaveText('First');
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

  test('f key cycles fonts ephemerally (deck unchanged)', async ({ page }) => {
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

    // Exit and confirm the saved deck font was not changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#editor:not(.hidden)');
    const deck = await readDeck(page);
    expect(deck.settings.font).toBe('sans');
    await expect(page.locator('#set-font')).toHaveText('sans');
  });

  test('t key cycles themes ephemerally (deck unchanged)', async ({ page }) => {
    await loadWithDeck(page, { version: 1, settings: { theme: 'paper', font: 'sans', transition: 'none' }, slides: [{ id: 'slide-1', text: 'Ship', align: 'center' }], currentSlideId: 'slide-1', nextId: 2 });
    await present(page);
    const getBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await getBg()).toBe('rgb(255, 255, 255)'); // paper
    await page.keyboard.press('t');
    expect(await getBg()).toBe('rgb(17, 17, 17)'); // ink

    await page.keyboard.press('Escape');
    await page.waitForSelector('#editor:not(.hidden)');
    const deck = await readDeck(page);
    expect(deck.settings.theme).toBe('paper');
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
      { id: 'slide-1', text: 'Top', align: 'top' },
      { id: 'slide-2', text: 'Center', align: 'center' },
      { id: 'slide-3', text: 'Bottom', align: 'bottom' }
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
```

- [ ] **Step 2: Run the suite against the current (old) `index.html` to confirm the new tests fail**

Run: `npm run test:visual`
Expected: FAIL. The editor-interaction tests (`new slide creates an empty, selected slide`, `delete is hidden...`, `drag-number reorder...`, `settings cycle on click...`, `reload restores...`, `per-slide align...`, the three `editor interactions` tests, the two updated `url sharing` assertions, and the `f`/`t` `toHaveText` checks) fail because the old DOM still uses `<select>` elements, move/duplicate buttons, a sidebar, and `#align-seg`. Unchanged behavior tests (seed, edit, present rendering) still pass. This red state proves the tests target the new design.

- [ ] **Step 3: Commit the failing tests**

```bash
git checkout -b editor-redesign
git add test/visual.spec.js
git commit -m "test: target manuscript editor DOM (red)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Rewrite the editor in `index.html` (green)

**Files:**
- Modify: `index.html`

Apply these edits **in order**. After all four steps the suite goes green.

- [ ] **Step 1: Add Fraunces to the Google Fonts link**

Find the `<link href="https://fonts.googleapis.com/css2?...">` line (~line 9) and replace it with the same link plus a `Fraunces` family:

Old:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@200;600&family=IBM+Plex+Mono:wght@200;400;600&family=IBM+Plex+Sans:wght@200;600&family=DM+Serif+Display:ital@0;1&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">
```

New:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@200;600&family=Fraunces:opsz,wght@9..144,400;9..144,600&family=IBM+Plex+Mono:wght@200;400;600&family=IBM+Plex+Sans:wght@200;600&family=DM+Serif+Display:ital@0;1&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Replace the entire editor-chrome CSS block with manuscript styles**

In the `<style>` element, the slide-rendering block ends with the `.annotation { opacity: 0.65; }` rule. Immediately after it begins the editor-chrome block, starting with the comment `/* ---- Editor chrome (brutalist, typography-driven) ---- */` and running through the editor `@media (max-width: 720px)` block, ending just before `</style>`.

Replace everything from that `/* ---- Editor chrome ... ---- */` comment through the closing `}` of that media query (i.e. the whole editor-chrome CSS, **not** the slide-rendering CSS above it) with:

```css
  /* ---- Editor chrome (manuscript, type-driven) ---- */

  :root {
    --paper: #faf9f6;
    --ink: #1a1a1a;
    --muted: #999999;
    --slide-gray: #9a9a93;
    --hairline: rgba(26, 26, 26, 0.12);
    --ed-mono: 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace;
    --indent: calc(2ch + 20px);   /* number column + gap, for aligning loose items */
  }

  #editor {
    position: fixed;
    inset: 0;
    overflow-y: auto;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--ed-mono);
    -webkit-font-smoothing: antialiased;
  }
  #editor.hidden { display: none; }
  #present.hidden { display: none; }

  /* Masthead: title + settings summary + share + Present. One hairline below. */
  .masthead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 24px 32px;
    flex-wrap: wrap;
    padding: 24px 32px 18px;
    border-bottom: 1px solid var(--hairline);
  }
  .masthead .title {
    font-family: 'Fraunces', Georgia, 'Times New Roman', serif;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  .masthead-right {
    display: flex;
    align-items: baseline;
    gap: 18px;
    flex-wrap: wrap;
  }

  /* Flat, borderless buttons everywhere except the filled Present button. */
  button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .settings {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
    color: var(--muted);
  }
  .settings .dot { color: var(--muted); }
  .set-word { color: var(--muted); }
  .set-word:hover { color: var(--ink); }

  .share { font-size: 13px; color: var(--muted); }
  .share:hover { color: var(--ink); }

  .present {
    background: var(--ink);
    color: var(--paper);
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
  }
  .present:hover { opacity: 0.85; }

  .masthead-status {
    padding: 8px 32px 0;
    min-height: 1.3em;
    font-size: 12px;
    color: var(--muted);
  }
  .masthead-status.error { color: #c41e3a; }

  /* Slide stack: vertical numbered list, one slide open at a time. */
  .slide-stack {
    list-style: none;
    padding: 20px 32px 0;
    max-width: 1100px;
  }
  .slide-row {
    display: flex;
    align-items: baseline;
    gap: 20px;
    padding: 14px 0;
  }
  .slide-row.drag-over { box-shadow: inset 0 2px 0 0 var(--ink); }
  .slide-row .num {
    font-variant-numeric: tabular-nums;
    font-size: 14px;
    min-width: 2ch;
    color: var(--muted);
    cursor: grab;
    user-select: none;
  }
  .slide-row.selected .num { color: var(--ink); }
  .slide-row .snippet {
    flex: 1;
    min-width: 0;
    font-size: 34px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--slide-gray);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .slide-row .snippet.empty { font-style: italic; opacity: 0.7; }

  .slide-editor {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  #slide-text {
    width: 100%;
    min-height: 30vh;
    resize: vertical;
    border: none;
    outline: none;
    padding: 0;
    background: none;
    color: var(--ink);
    font-family: var(--ed-mono);
    font-size: 34px;
    line-height: 1.25;
    letter-spacing: -0.02em;
    tab-size: 4;
  }
  .controls {
    display: flex;
    align-items: baseline;
    gap: 14px;
    font-size: 13px;
    color: var(--muted);
  }
  .controls .align { display: flex; gap: 12px; }
  .controls .align button { color: var(--muted); }
  .controls .align button:hover { color: var(--ink); }
  .controls .align button.on { color: var(--ink); font-weight: 600; }
  .controls .sep { color: var(--muted); }
  .controls .delete { color: var(--muted); }
  .controls .delete:hover { color: #c41e3a; }

  .new-slide {
    display: block;
    margin: 8px 0 48px 32px;
    padding-left: var(--indent);
    font-size: 18px;
    color: var(--muted);
  }
  .new-slide:hover { color: var(--ink); }

  @media (max-width: 720px) {
    .masthead { padding: 16px 18px 12px; }
    .masthead .title { font-size: 22px; }
    .masthead-status { padding: 8px 18px 0; }
    .slide-stack { padding: 16px 18px 0; }
    .slide-row .snippet, #slide-text { font-size: 24px; }
    #slide-text { min-height: 24vh; }
    .new-slide { margin-left: 18px; font-size: 16px; }
  }
```

- [ ] **Step 3: Replace the editor markup**

Find the editor markup — the `<!-- Editor mode -->` comment and the entire `<div id="editor"> ... </div>` that follows it (the toolbar + workspace/sidebar/edit-pane structure). Leave the `<!-- Present mode ... -->` `<div id="present">...</div>` block above it untouched. Replace the editor block with:

```html
<!-- Editor mode -->
<div id="editor">
  <header class="masthead">
    <h1 class="title">Show Big Words</h1>
    <div class="masthead-right">
      <div class="settings" id="settings">
        <button class="set-word" id="set-theme" data-kind="theme" type="button">paper</button>
        <span class="dot">·</span>
        <button class="set-word" id="set-font" data-kind="font" type="button">sans</button>
        <span class="dot">·</span>
        <button class="set-word" id="set-transition" data-kind="transition" type="button">no transition</button>
      </div>
      <button class="share" id="btn-share" type="button">share url</button>
      <button class="present" id="btn-present" type="button">Present →</button>
    </div>
  </header>

  <div class="masthead-status" id="status"></div>

  <ol id="slide-list" class="slide-stack"></ol>

  <button class="new-slide" id="btn-new" type="button">+ New slide</button>
</div>
```

Note: the initial words `paper` / `sans` / `no transition` are placeholders; `renderSettings()` overwrites them from `deck.settings` on boot. The `→`, `·`, and `+` characters are non-emoji (outside the emoji ranges the styling test checks).

- [ ] **Step 4: Remove `duplicateSlide` and `moveSlide` from the slide-operations section**

In the `// ===== Slide operations =====` section, delete the entire `duplicateSlide` function:

```js
function duplicateSlide() {
  const src = currentSlide();
  const id = freshId();
  const at = currentSlideIndex();
  deck.slides.splice(at + 1, 0, { id, text: src.text, align: src.align });
  deck.currentSlideId = id;
  saveDeck();
  renderEditor();
  focusTextarea();
}
```

and the entire `moveSlide` function:

```js
function moveSlide(delta) {
  const at = currentSlideIndex();
  const to = at + delta;
  if (to < 0 || to >= deck.slides.length) return;
  reorderSlide(at, to);
}
```

Leave `newSlide`, `deleteSlide`, `reorderSlide`, and `selectSlide` exactly as they are (they all call `renderEditor()` / `focusTextarea()`, which still exist after Step 5).

- [ ] **Step 5: Replace the editor-view JS region**

Find the `// ===== Editor view =====` banner comment. The editor-view region runs from that banner through the `// Click to select (but not when finishing a drag).` `listEl.addEventListener('click', ...)` handler — i.e. everything up to (but not including) the `// ===== Present mode =====` banner. This region contains: element refs, `setStatus`, `snippetFor`, `setSnippet`, `renderSlideList`, `renderAlign`, `renderEditor`, `focusTextarea`, the textarea input handler, the align/select change handlers, the new/dup/del/prev/next button wiring, and all the drag-and-drop handlers.

Replace that **entire region** with:

```js
// =====================================================================
// Editor view
// =====================================================================

const editorEl = document.getElementById('editor');
const presentEl = document.getElementById('present');
const listEl = document.getElementById('slide-list');
const statusEl = document.getElementById('status');
const themeWord = document.getElementById('set-theme');
const fontWord = document.getElementById('set-font');
const transitionWord = document.getElementById('set-transition');

let statusTimer = null;
function setStatus(msg, isError) {
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('error', !!isError);
  if (statusTimer) clearTimeout(statusTimer);
  if (msg) statusTimer = setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('error'); }, 4000);
}

function snippetFor(text) {
  return (text.split('\n').find(l => l.trim() !== '') || '').trim();
}

// Fill a collapsed row's snippet from slide text, marking empty slides.
function setSnippet(el, text) {
  const snippet = snippetFor(text);
  el.textContent = snippet || 'Empty slide';
  el.classList.toggle('empty', !snippet);
}

// ---- Settings summary (click to cycle) ----

const SETTING_LISTS = { theme: THEMES, font: FONTS, transition: TRANSITIONS };

// Map a stored setting value to its friendly display word. Stored values are
// unchanged; only the label differs (notably the transition values).
function settingLabel(kind, value) {
  if (kind === 'transition') return value === 'wipe' ? 'wipe transition' : 'no transition';
  return value;
}

function renderSettings() {
  themeWord.textContent = settingLabel('theme', deck.settings.theme);
  fontWord.textContent = settingLabel('font', deck.settings.font);
  transitionWord.textContent = settingLabel('transition', deck.settings.transition);
}

function cycleSetting(kind) {
  const list = SETTING_LISTS[kind];
  if (!list) return;
  const cur = deck.settings[kind];
  deck.settings[kind] = list[(list.indexOf(cur) + 1) % list.length];
  saveDeck();
  renderSettings();
}

document.getElementById('settings').addEventListener('click', (e) => {
  const word = e.target.closest('.set-word');
  if (word) cycleSetting(word.dataset.kind);
});

// ---- Slide stack ----

// Build the inline editor (textarea + controls) for the open slide.
function buildSlideEditor(slide) {
  const wrap = document.createElement('div');
  wrap.className = 'slide-editor';

  const ta = document.createElement('textarea');
  ta.id = 'slide-text';
  ta.spellcheck = false;
  ta.placeholder = 'Type slide text. Blank line makes subtext. Tab-indent centers a line. ((parentheses)) make an annotation.';
  ta.value = slide.text;
  ta.addEventListener('input', () => { currentSlide().text = ta.value; saveDeck(); });
  wrap.appendChild(ta);

  const controls = document.createElement('div');
  controls.className = 'controls';

  const alignWrap = document.createElement('span');
  alignWrap.className = 'align';
  ['top', 'center', 'bottom'].forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.align = a;
    b.textContent = a;
    if (slide.align === a) b.classList.add('on');
    b.addEventListener('click', () => {
      currentSlide().align = a;
      saveDeck();
      alignWrap.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.align === a));
    });
    alignWrap.appendChild(b);
  });
  controls.appendChild(alignWrap);

  // Delete is hidden when only one slide remains. There is no Duplicate.
  if (deck.slides.length > 1) {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '·';
    controls.appendChild(sep);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = 'delete';
    del.addEventListener('click', deleteSlide);
    controls.appendChild(del);
  }

  wrap.appendChild(controls);
  return wrap;
}

// Render the full stack: every slide is a numbered row; the selected slide is
// expanded inline (textarea + controls), all others collapse to a snippet.
function renderSlideList() {
  listEl.innerHTML = '';
  deck.slides.forEach((slide, i) => {
    const li = document.createElement('li');
    li.className = 'slide-row' + (slide.id === deck.currentSlideId ? ' selected' : '');
    li.dataset.id = slide.id;
    li.dataset.index = String(i);

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    num.draggable = true;   // drag the number to reorder
    li.appendChild(num);

    if (slide.id === deck.currentSlideId) {
      li.appendChild(buildSlideEditor(slide));
    } else {
      const snip = document.createElement('span');
      snip.className = 'snippet';
      setSnippet(snip, slide.text);
      li.appendChild(snip);
    }
    listEl.appendChild(li);
  });
}

function renderEditor() {
  renderSettings();
  renderSlideList();
}

function focusTextarea() {
  const ta = document.getElementById('slide-text');
  if (ta) ta.focus();
}

document.getElementById('btn-new').addEventListener('click', newSlide);

// ---- Open a collapsed slide (the open slide IS the selection) ----

listEl.addEventListener('click', (e) => {
  const row = e.target.closest('.slide-row');
  if (!row || row.classList.contains('selected')) return;
  selectSlide(row.dataset.id);
});

// ---- Drag the number to reorder ----

let dragFrom = null;

function clearDragOver() {
  listEl.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
}

listEl.addEventListener('dragstart', (e) => {
  const num = e.target.closest('.num');
  if (!num) return;
  const row = num.closest('.slide-row');
  dragFrom = Number(row.dataset.index);
  e.dataTransfer.effectAllowed = 'move';
  // Some browsers require data to be set for drag to start.
  try { e.dataTransfer.setData('text/plain', row.dataset.id); } catch (err) {}
});

listEl.addEventListener('dragover', (e) => {
  if (dragFrom === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const row = e.target.closest('.slide-row');
  clearDragOver();
  if (row) row.classList.add('drag-over');
});

listEl.addEventListener('dragleave', (e) => {
  const row = e.target.closest('.slide-row');
  if (row && !row.contains(e.relatedTarget)) row.classList.remove('drag-over');
});

listEl.addEventListener('drop', (e) => {
  if (dragFrom === null) return;
  e.preventDefault();
  const row = e.target.closest('.slide-row');
  clearDragOver();
  if (row) reorderSlide(dragFrom, Number(row.dataset.index));
  dragFrom = null;
});

listEl.addEventListener('dragend', () => {
  clearDragOver();
  dragFrom = null;
});
```

Note: `shareUrl` and the `#btn-share` wiring stay where they already are in the `// ===== URL hash sharing =====` section (`document.getElementById('btn-share').addEventListener('click', shareUrl);`) — do not duplicate it here. The `#btn-present` wiring stays in the `// ===== Present mode =====` section. `cycleSetting` deliberately calls only `renderSettings()` (not `renderEditor()`), so cycling a setting never rebuilds the open textarea and never loses focus or caret.

- [ ] **Step 6: Run the full suite to verify it passes**

Run: `npm run test:visual`
Expected: PASS — all specs green, including the three new `editor interactions` tests, the drag-number reorder, click-to-cycle settings, and hidden-delete-at-one-slide.

If anything fails, debug against the new DOM (do not weaken assertions): confirm `#slide-text` exists only inside `.slide-row.selected`, that `#set-theme/#set-font/#set-transition` render the friendly words, and that `.delete` is absent at one slide.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: redesign editor as type-driven manuscript layout

Single-column numbered stack with inline one-at-a-time editing,
click-to-cycle settings summary, drag-the-number reorder, and a
filled Present button. Removes the sidebar, toolbar selects,
move/duplicate buttons, and all per-element borders except the
masthead hairline. Deck model, storage, URL sharing, and present
mode are unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Manual verification and scope check

**Files:**
- Inspect only: `index.html`

- [ ] **Step 1: Confirm no stray editor hooks or emojis remain**

Run: `grep -n -E "btn-dup|btn-prev|btn-next|set-theme\"|<select|align-seg|duplicateSlide|moveSlide|class=\"toolbar|class=\"sidebar|class=\"workspace" index.html`
Expected: no matches (all removed). A match means an old hook survived the rewrite — remove it.

Run: `grep -nP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{1F1E6}-\x{1F1FF}]" index.html`
Expected: no matches (no emoji). The `→`, `·`, `+` characters are intentionally outside these ranges.

- [ ] **Step 2: Manual browser check**

Run: `npx http-server . -p 4173 -c-1 --silent` then open `http://localhost:4173/index.html`.

Verify by hand:
- Exactly one structural line: the hairline under the masthead. No borders on buttons, rows, or the textarea.
- The title reads "Show Big Words" in a serif (Fraunces).
- The settings summary reads e.g. `paper · sans · no transition`; clicking each word advances it (`paper → ink → presenter → gradient`, `sans → mono → serif → pixel`, `no transition → wipe transition → no transition`). Reload — the change persists.
- One slide is open at a time. Clicking a collapsed (grayed) slide opens it inline and collapses the previously open one.
- Dragging a slide **number** reorders the stack; selection stays on the moved slide.
- `delete` appears in the controls row only when 2+ slides exist; deleting back to one hides it. There is no Duplicate.
- `+ New slide` at the bottom adds a slide and opens it focused.
- `Present →` opens present mode at the selected slide; Escape returns. Themes/fonts/transition/wipe and all keyboard shortcuts behave as before.
- Resize narrow (≈375px wide): masthead wraps cleanly, type scales down, controls stay usable and non-overlapping.

- [ ] **Step 3: Final clean run**

Run: `npm run test:visual`
Expected: PASS (all specs). Stop the local `http-server` if you started one.

---

## Self-review

**Spec coverage** (against `2026-06-04-editor-redesign-design.md`):
- Kill the borders / single masthead hairline → CSS Step 2 (`--hairline`, only `.masthead` has `border-bottom`; flat `button` rule).
- Canvas paper tone + near-black; Fraunces title; mono editing text; muted labels → CSS vars + `.title` + `#slide-text` + `--muted`.
- Masthead: title left; settings summary + Present (filled) right; share link; status near masthead → markup Step 3.
- Slide stack: numbered vertical list, collapsed = number + first non-empty line in big bold gray; one open at a time; controls row `align top center bottom` + `· delete` (hidden at one slide); no Duplicate; `+ New slide` at bottom → `renderSlideList`/`buildSlideEditor` (JS Step 5), CSS, markup.
- Settings cycle on click via THEMES/FONTS/TRANSITIONS; friendly transition labels; stored values unchanged → `cycleSetting`/`settingLabel`/`renderSettings`.
- Reorder by dragging the number; reuse `reorderSlide` → drag handlers keyed on `.num`.
- Open/select reuses `selectSlide` → list click handler.
- Removed: Duplicate, move buttons, selects, segmented align, sidebar → Task 2 Steps 3–5.
- Reused model funcs unchanged; `newSlide` kept, `duplicateSlide` removed → Step 4.
- Testing: existing behaviors keep assertions, selectors updated; new tests for open/collapse, settings-cycle persistence, no Duplicate → Task 1.
- Out of scope (present mode, deck model, storage, URL hash) untouched → only the three editor regions change.

**Placeholder scan:** No TBD/"handle edge cases"/"similar to" — every code step shows complete code; every run step shows the command and expected result.

**Type/name consistency:** `renderEditor` calls `renderSettings` + `renderSlideList`; `focusTextarea` finds `#slide-text`; `buildSlideEditor` creates the `#slide-text` textarea and `.delete`/`button[data-align]` controls the tests query; `cycleSetting`/`settingLabel`/`SETTING_LISTS` agree on `theme`/`font`/`transition`; drag handlers and `dragNumber` agree on `.num` (dragstart) and `.slide-row` (drop); CSS classes (`.masthead`, `.settings`, `.set-word`, `.share`, `.present`, `.slide-stack`, `.slide-row`, `.num`, `.snippet`, `.slide-editor`, `.controls`, `.align`, `.delete`, `.new-slide`, `#status`, `#slide-text`) match the markup and the spec selectors.
