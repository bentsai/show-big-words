# Wide-Viewport Balance & Scale-Up — Design

Date: 2026-06-05
Status: Approved (pending written-spec review)

## Context

On a wide viewport the editor in `index.html` hugs the left edge: the slide stack
is capped at `max-width: 80ch` with `padding: 20px 32px` and no horizontal
centering, while the masthead spans the full window. The result is a left-pinned
column with a large, lopsided empty area on the right (the user shared a ~1900px
screenshot showing roughly the right 55% of the window blank).

The user's intent is **not** to fill the space functionally (no live preview, no
multi-slide grid). It is to make the emptiness **calm and intentional** — symmetric
whitespace rather than a left-hugging accident. Alongside this, the user asked to
**scale the whole editor up** so it reads larger on big screens.

This change touches **only the editor's layout chrome and base sizing**. The deck
model, `localStorage` persistence, URL hash sharing, and **present mode** are
untouched in behavior.

## Decisions (from brainstorming)

- **Balance approach:** center the column (mockup option A), not indent or
  left-bias.
- **Column width:** widen the cap from `80ch` to **`84ch`**.
- **Masthead:** the masthead **shares the column's left/right edges** (mockup
  option B), so the title sits above the column's left edge and the
  settings/share/Present cluster above its right edge. The whole editor reads as
  one centered sheet — not a centered column under a window-anchored masthead.
- **Scale:** set the root font-size to **20px** (from the browser default 16px),
  a ~25% increase.

## Design

### 1. Centered, shared-width sheet

All four editor blocks — the masthead, the status line, the slide stack, and the
"+ add slide" button — share **one** centering rule: `max-width: 84ch` plus
`margin-inline: auto`, so they line up on identical left and right edges and the
leftover space splits evenly into left/right margins.

Implementation: `#editor` already wraps all four blocks. Apply the shared
constraint via a single inner wrapper (or a shared class on the four blocks),
whichever is least disruptive to the existing markup. The existing horizontal
padding (32px desktop / 18px mobile) is preserved *inside* the 84ch width so text
and controls never touch the sheet's edge. Global `box-sizing: border-box` is
already set, so padding stays inside the max-width.

The masthead's bottom hairline currently spans the full window. Within the shared
sheet it spans the 84ch width instead (matching the column). This is the intended
"one sheet" look; a full-bleed hairline is explicitly *not* used.

### 2. Scale up ~25%

Set the root font-size to **20px** (e.g. `html { font-size: 125% }` or `20px`).
The editor sizes everything in `rem` (masthead title 2.5rem, slide numbers 2rem,
textarea/snippets 1.5rem, controls 0.8125rem, `--num-col: 4.5rem`), so the entire
editor scales proportionally from this single change — no per-element edits.

**Present mode is unaffected:** present-mode slide text is sized from a separate
pixel scale array (`fitText`), not from `rem`, so the big-text rendering does not
change.

### 3. Interactions with existing layout

- **Mobile breakpoint (`@media max-width: 720px`):** retained. At narrow widths
  84ch exceeds the viewport, so `margin-inline: auto` is a no-op and the sheet
  fills the screen as it does today. The mobile block already overrides the key
  font-sizes (`#slide-text`/`.snippet` to 1.5rem, title to 1.875rem); after the
  20px root bump these mobile values must still feel right — verify and, if the
  text now reads oversized on a phone, adjust within the existing mobile block
  only.
- **`ch` is font-relative:** 84ch at 20px is physically wider than 80ch was at
  16px, and shifts slightly between the mono/sans/serif/pixel fonts. This is
  acceptable for a soft max-width (it is not meant to be pixel-exact) and is noted
  so a width that "changes with the font" is not a surprise.

## Testing

- **Add** a Playwright test: on a wide viewport (e.g. 1900×900), assert the slide
  stack is horizontally centered — left margin ≈ right margin, both clearly > 0 —
  and that the masthead shares the column's left/right edges (masthead content
  box left ≈ slide-stack left, masthead right ≈ slide-stack right, within a small
  tolerance).
- The existing `controls remain visible and non-overlapping at mobile and desktop
  widths` test must still pass at both 375px and 1280px.
- Keep all existing tests green (`npm run test:visual`).

## Out of scope

- Live slide preview in the empty space.
- Multi-column / grid deck overview.
- Any change to present mode, the deck data model, sharing, or persistence.
- Responsive behavior beyond the existing 720px breakpoint (no new breakpoints
  unless the wide-centering or scale-up demonstrably needs one).
