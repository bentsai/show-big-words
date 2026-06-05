# Editor Redesign — "Manuscript" — Design

Date: 2026-06-04
Status: Approved (pending written-spec review)

## Context

The current editor in `index.html` is heavily border-driven: 2px rules between the
toolbar, sidebar, and edit pane; 1px borders on every button, settings field, and
slide row; a segmented align control; a bordered status bar. The user finds it too
"line-heavy" and wants a **type-driven** redesign where typography, weight, color,
and whitespace carry the structure instead of borders.

Two directions were explored in the visual companion:
1. **whatandwhen.fyi language** — a sidebar list + edit pane with big UPPERCASE
   section headers each underlined by a single full-width rule. Held in reserve.
2. **Manuscript single-column** — no sidebar or panes; the deck is a vertical
   numbered stack edited inline. **This is the chosen direction.**

The redesign changes **only the editor chrome**. The deck model, `localStorage`
persistence, URL hash sharing, present mode, and the rendering core (`fitText`,
`populateLayer`, wipe transition) are untouched in behavior.

## Guiding principle

Kill the borders. Exactly **one** structural line on the page — a 1px hairline
under the masthead. Everything else is expressed through type size, weight, color,
and whitespace.

## Visual language

- **Canvas:** warm off-white paper tone (`#faf9f6`), near-black text (`#1a1a1a`).
- **Title font:** "Show Big Words" set in **Fraunces** (serif display), loaded via
  Google Fonts. This is the one serif on the page — a deliberate counterpoint to
  the monospace editing text.
- **Editing text:** the existing IBM Plex Mono, large.
- **Body/labels:** IBM Plex Sans / system UI, small, uppercase with letter-spacing
  for labels; muted gray (`~#999`) for secondary text.
- No boxed buttons, no per-row borders, no dropdown chrome. The single exception is
  the filled **Present →** button.

## Layout

Single column, no sidebar, no panes.

### Masthead
- Left: **"Show Big Words"** in Fraunces.
- Right: a settings summary `paper · sans · no transition` (muted text) and a solid
  black filled **Present →** button with the label and arrow.
- One 1px hairline under the masthead — the only rule on the page.
- Quiet status/error text (e.g. invalid share hash) renders near the masthead.

### Slide stack
- The deck renders as a vertical numbered list. Each collapsed slide shows its
  tabular-figure number + the first non-empty line of its text in big bold type,
  grayed (`~#9a9a93`) when not selected.
- **Inline editing, one open at a time:** clicking a slide line expands it in place
  into the large mono `<textarea>` plus a controls row. The previously open slide
  collapses back to its display text. The open slide *is* the selection
  (`currentSlideId`).
- **Controls row** (under the open textarea): `align top center bottom` with the
  current value bold, then `· delete`. **Delete is hidden when only one slide
  remains. There is no Duplicate.**
- **New slide:** a `+ New slide` line at the bottom of the stack.

## Interactions

- **Settings cycle on click:** clicking `paper` / `sans` / `no transition` advances
  each to its next value using the existing `THEMES` / `FONTS` / `TRANSITIONS`
  lists, applies it, and autosaves. No dropdowns. The displayed word is always the
  current value. Display labels map the stored value to friendly text — notably the
  transition value `none` displays as `no transition` and `wipe` as `wipe
  transition` (or similar); the stored values themselves are unchanged.
- **Reorder:** drag the slide **number** to a new position (replaces the old
  sidebar-row drag). Uses the existing `reorderSlide(from, to)` logic.
- **Delete:** text link on the open slide; uses the existing `deleteSlide()`
  (hidden at one slide).
- **Open/select:** clicking a collapsed slide calls the existing `selectSlide(id)`
  and re-renders with that slide expanded and the prior one collapsed.
- **Removed entirely:** Duplicate, the Up/Down move buttons, the old toolbar
  `<select>`s, the segmented align buttons, and the bordered sidebar — all replaced
  by the above.

## Code changes (all within `index.html`)

- **CSS:** remove the entire editor-chrome block (`.toolbar`, `.settings`,
  `.field`, `.workspace`, `.sidebar`, `.slide-ops`, `.slide-row` borders, `.seg`,
  `.align-bar`, the bordered `button` rules) and rewrite as the manuscript styles.
  Add the Fraunces font to the existing Google Fonts `<link>`.
- **Markup:** replace the `.toolbar` + `.workspace` (sidebar + edit-pane) structure
  with a masthead + single-column stack.
- **JS wiring:** rework `renderSlideList` / `renderEditor` to build the stack with
  one expanded slide (textarea + controls inline); add click-to-open, click-to-cycle
  settings, and drag-on-number reorder handlers. Reuse the existing model functions
  unchanged: `selectSlide`, `reorderSlide`, `deleteSlide`, `currentSlide`,
  `currentSlideIndex`, `saveDeck`, `applyTheme`, `applyFont`, `setStatus`,
  `snippetFor`, `enterPresent`.
- The `newSlide` op stays; `duplicateSlide` and its button/handler are removed.

## Out of scope (unchanged)

- Present mode look and behavior: themes, fonts, fit-to-fill scaling, wipe
  transition, and all keyboard shortcuts (arrows / Space / Enter / Home / End /
  Backspace / `f` / `t` / `b` / Escape).
- Deck model, `localStorage` key and shape, URL hash encode/decode and on-load
  import semantics.
- The runtime file remains a single human-readable `index.html` with no test
  scaffolding.

## Testing

- Deck-model, storage, URL-sharing, and present-mode tests are unaffected in
  behavior; their assertions stay the same.
- Editor-interaction tests (select, edit current slide only, delete disabled at one
  slide, reorder keeps selection, settings persist independently) need their
  **selectors** updated to the new DOM while asserting the same behaviors.
- New small tests:
  - Clicking a collapsed slide opens it inline and collapses the previously open one.
  - Clicking a settings word (theme/font/transition) cycles to the next value and
    persists to `localStorage`.
  - No Duplicate control exists.
- Target: full Playwright suite green again.

## Verification

1. `npm run test:visual` — all specs pass.
2. Manual check at desktop and mobile widths: one open slide at a time, drag-number
   reorder works, settings cycle on click and persist across reload, Present → opens
   present mode at the selected slide, no stray borders besides the masthead hairline.
3. Confirm `index.html` still has no emojis and no test hooks.
