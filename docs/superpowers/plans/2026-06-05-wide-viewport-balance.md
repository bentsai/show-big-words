# Wide-Viewport Balance & Scale-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On wide viewports, center the editor as one 84ch "sheet" (masthead sharing the column's edges) and scale the whole editor up to a 20px root font-size.

**Architecture:** Wrap the editor's four blocks (masthead, status, slide stack, add-slide button) in a single `.editor-sheet` div capped at `max-width: 84ch` with `margin-inline: auto`. Remove the slide stack's own narrower cap so it fills the sheet. Bump `html { font-size }` to 20px so the rem-sized editor scales proportionally. Present mode (pixel-sized) is untouched.

**Tech Stack:** Single-file static app (`index.html` — markup + embedded CSS + JS, no build step). Tests: Playwright via `npm run test:visual`.

---

### Task 1: Center the editor as an 84ch sheet

**Files:**
- Modify: `index.html` markup (`#editor` block, ~lines 556–604) — wrap the four child blocks in `.editor-sheet`
- Modify: `index.html` CSS — add `.editor-sheet` rule near `#editor` (~line 207), remove `max-width` from `.slide-stack` (line 317)
- Test: `test/visual.spec.js` (add a test to the existing `styling` describe block, ~line 685)

Context: `#editor` is `position: fixed; inset: 0; overflow-y: auto` — it must keep filling the window (it is the scroll container), so the width cap goes on an **inner** wrapper, not on `#editor` itself. Global `box-sizing: border-box` is already set (line 23), so each block's existing 32px horizontal padding stays *inside* the 84ch width. The masthead's `border-bottom` hairline will therefore span 84ch (matching the column) — this is the intended "one sheet" look.

- [ ] **Step 1: Write the failing test**

Add to `test/visual.spec.js` inside the `test.describe('styling', ...)` block (after the existing `controls remain visible...` test, before the block's closing `});` near line 709):

```js
  test('on a wide viewport the editor is one centered sheet', async ({ page }) => {
    await freshLoad(page);
    await page.setViewportSize({ width: 1900, height: 900 });

    const m = await page.evaluate(() => {
      const sheet = document.querySelector('.editor-sheet');
      const mast = document.querySelector('.masthead');
      const stack = document.querySelector('.slide-stack');
      const s = sheet.getBoundingClientRect();
      return {
        leftMargin: s.left,
        rightMargin: window.innerWidth - s.right,
        sheetWidth: s.width,
        mastLeft: mast.getBoundingClientRect().left,
        mastRight: mast.getBoundingClientRect().right,
        stackLeft: stack.getBoundingClientRect().left,
        stackRight: stack.getBoundingClientRect().right,
      };
    });

    // The sheet is centered: real margins on both sides, roughly equal.
    expect(m.leftMargin).toBeGreaterThan(100);
    expect(Math.abs(m.leftMargin - m.rightMargin)).toBeLessThanOrEqual(2);
    // The sheet does not span the whole window (it is capped at 84ch).
    expect(m.sheetWidth).toBeLessThan(1900);
    // Masthead and slide stack share the sheet's left/right edges.
    expect(Math.abs(m.mastLeft - m.stackLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.mastRight - m.stackRight)).toBeLessThanOrEqual(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test -g "centered sheet"`
Expected: FAIL — `.editor-sheet` does not exist yet, so `sheet.getBoundingClientRect()` throws (TypeError on null).

- [ ] **Step 3: Add the `.editor-sheet` wrapper to the markup**

In `index.html`, wrap the four blocks inside `#editor`. Change:

```html
        <!-- Editor mode -->
        <div id="editor">
            <header class="masthead">
```

to:

```html
        <!-- Editor mode -->
        <div id="editor">
            <div class="editor-sheet">
            <header class="masthead">
```

and change the closing of `#editor`:

```html
            <button class="new-slide" id="btn-new" type="button">
                + add slide
            </button>
        </div>
```

to:

```html
            <button class="new-slide" id="btn-new" type="button">
                + add slide
            </button>
            </div>
        </div>
```

(Only the wrapper open/close lines are added; the four blocks between them are unchanged. Re-indentation of the inner blocks is optional and not required.)

- [ ] **Step 4: Add the `.editor-sheet` CSS rule**

In `index.html`, immediately after the `#editor.hidden { display: none; }` rule (~line 210), add:

```css
            /* On wide viewports the editor is one centered sheet: masthead, status,
               slide stack, and add-slide button all share these left/right edges.
               #editor stays full-window (it is the scroll container); the cap lives
               on this inner wrapper. */
            .editor-sheet {
                max-width: 84ch;
                margin-inline: auto;
            }
```

- [ ] **Step 5: Remove the slide stack's own width cap**

The sheet now owns the width. The slide stack must fill the sheet (84ch), not stay at its old 80ch — otherwise it would be narrower than the masthead and break edge alignment. In `index.html`, in the `.slide-stack` rule (~line 314), delete this line:

```css
                max-width: 80ch;
```

So `.slide-stack` becomes:

```css
            .slide-stack {
                list-style: none;
                padding: 20px 32px;
            }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx playwright test -g "centered sheet"`
Expected: PASS

- [ ] **Step 7: Run the full suite**

Run: `npm run test:visual`
Expected: all tests PASS (42 total — the 41 existing plus the new one). In particular `controls remain visible and non-overlapping at mobile and desktop widths` still passes at 375px and 1280px.

- [ ] **Step 8: Commit**

```bash
git add index.html test/visual.spec.js
git commit -m "feat: center editor as one 84ch sheet on wide viewports"
```

---

### Task 2: Scale the editor up to a 20px root font-size

**Files:**
- Modify: `index.html` CSS — add a `html { font-size }` rule (the global reset block is at the top of `<style>`, ~lines 18–24; add the rule right after it)
- Test: `test/visual.spec.js` (add a test to the `styling` describe block)

Context: the editor sizes everything in `rem` (masthead title 2.5rem, slide numbers 2rem, textarea/snippets 1.5rem, controls 0.8125rem, `--num-col: 4.5rem`). There is currently no root font-size override, so it inherits the browser default of 16px. Setting it to 20px scales the whole editor ~25% from one rule. Present mode is **not** affected — present-mode text is sized from a pixel scale array in JS (`fitText`), not from `rem`. The mobile block (`@media max-width: 720px`) already overrides the key font-sizes, so phone sizing stays controlled there.

- [ ] **Step 1: Write the failing test**

Add to `test/visual.spec.js` inside the `test.describe('styling', ...)` block:

```js
  test('editor scales up via a 20px root font-size, present mode unaffected', async ({ page }) => {
    await freshLoad(page);

    const rootPx = await page.evaluate(() =>
      getComputedStyle(document.documentElement).fontSize);
    expect(rootPx).toBe('20px');

    // The slide-number gutter (--num-col: 4.5rem) scales with root: 4.5 * 20 = 90px.
    const numFontPx = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.slide-head .num')).fontSize));
    expect(numFontPx).toBeCloseTo(40, 0); // 2rem * 20px

    // Present mode text is pixel-sized (not rem), so entering present still fits.
    await page.locator('#slide-text').fill('Ship');
    await page.locator('#btn-present').click();
    await page.waitForFunction(() => document.getElementById('editor').classList.contains('hidden'));
    await expect(page.locator('#text')).toHaveText('Ship');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test -g "scales up via a 20px"`
Expected: FAIL — `rootPx` is `'16px'` (browser default), not `'20px'`.

- [ ] **Step 3: Add the root font-size rule**

In `index.html`, immediately after the global reset block (the `*, *::before, *::after { ... box-sizing: border-box; }` rule that ends ~line 24), add:

```css
            /* Scale the whole editor up ~25%. Everything in the editor is sized in
               rem, so this one rule lifts title, numbers, text, and controls together.
               Present mode is pixel-sized (see fitText) and is unaffected. */
            html {
                font-size: 125%; /* 20px from the 16px browser default */
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test -g "scales up via a 20px"`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm run test:visual`
Expected: all tests PASS (43 total). Confirm the mobile-width assertions in `controls remain visible and non-overlapping...` still pass at 375px — the mobile block's font-size overrides keep phone text in check.

- [ ] **Step 6: Commit**

```bash
git add index.html test/visual.spec.js
git commit -m "feat: scale editor up to a 20px root font-size"
```

---

## Self-Review

**Spec coverage:**
- Centered column, 84ch, masthead shares edges (option A + B) → Task 1 ✓
- Scale up to 20px → Task 2 ✓
- Mobile breakpoint retained → no change to the `@media max-width: 720px` block; verified by the existing mobile test in both tasks ✓
- `ch` font-relative caveat → informational in the spec; no action needed ✓
- Present mode untouched → asserted in Task 2 Step 1 ✓
- Testing: add centering test + keep existing green → Task 1; scale regression test → Task 2 ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact code and exact commands. ✓

**Type/selector consistency:** `.editor-sheet` is the class name used in both the markup (Task 1 Step 3), the CSS (Task 1 Step 4), and the test selector (Task 1 Step 1). `.slide-stack`, `.masthead`, `.slide-head .num` match existing selectors in `index.html`. ✓

No gaps found.
