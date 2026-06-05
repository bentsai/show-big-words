# Static Local-First Slide Editor Plan

## Summary

Create a brand-new static slide editor based on `big-words`. The app starts on slide 1, edits one slide at a time, stores one deck locally, and presents from the selected slide. Runtime is a single `index.html` with embedded CSS/JS and no build step.

MVP portability is URL-based only: users generate a share URL, and visiting that URL imports the deck automatically.

## Key Changes

- Use a structured local deck model:
  - `deck.settings`: `{ theme, font, transition }`
  - `deck.slides`: ordered `{ id, text, align }` objects
  - `deck.currentSlideId`: selected slide
- Store the deck in `localStorage` key `big-text.deck.v1`.
  - First load creates slide 1 with sample text.
  - Edits autosave immediately.
- Editor is scoped to the selected slide:
  - textarea edits only that slide’s `text`
  - no slide separators
  - no front matter
  - theme/font/transition use controls
- Preserve slide formatting:
  - blank line creates subtext
  - tab-indented lines center
  - `((annotation))` styles annotation text
  - alignment is controlled per slide with center/top/bottom UI
- Add slide controls:
  - New Slide, Duplicate, Delete, Move Previous, Move Next
  - Delete disabled when only one slide exists
- Presentation mode:
  - starts from selected slide
  - hides editor chrome
  - Arrow keys navigate slides
  - Escape returns to editor
  - theme/font/blank shortcuts remain

## Styling

- Use a brutalist, typography-driven visual direction.
- Prioritize stark structure, strong contrast, visible borders, dense controls, and direct labels.
- Avoid soft SaaS styling: no gradients as UI decoration, no rounded card-heavy layout, no glass effects, no decorative illustrations.
- Make typography the main visual system:
  - oversized slide preview text
  - compact mono or system UI text for controls
  - clear hierarchy through size, weight, borders, and spacing
- Use plain text labels and familiar symbols where useful.
- Use no emojis anywhere in UI, docs, sample content, tests, or commit messages.

## URL Sharing

- Add a “Share URL” control that copies or displays the current URL with the full deck encoded in the hash.
- Hash format: `#deck=<base64url-encoded-json>`.
- Encoded JSON includes:
  ```json
  {
    "version": 1,
    "settings": {
      "theme": "paper",
      "font": "sans",
      "transition": "none"
    },
    "slides": [
      {
        "id": "slide-1",
        "text": "Ship",
        "align": "center"
      }
    ]
  }
  ```
- On page load:
  - if `#deck=` exists and decodes cleanly, import that deck, save it to localStorage, and select the first slide
  - if the hash is invalid, keep the existing local deck and show a non-blocking error
  - if no hash exists, load localStorage or seed the sample deck
- No “Import URL” control in MVP; visiting the URL is the import action.
- No text import/export in MVP.

## Test Plan

- Data model:
  - first load creates slide 1
  - editing current slide updates only that slide
  - slide creation, duplication, deletion, and reordering preserve valid selection
  - settings persist separately from slide text
  - reload restores localStorage deck
- URL sharing:
  - Share URL encodes full deck into `#deck=`
  - visiting a valid shared hash imports and saves the deck
  - invalid hash does not overwrite localStorage
  - no hash loads localStorage or sample deck
- Rendering/presentation:
  - selected slide renders immediately
  - subtext, tab centering, and annotations render correctly
  - per-slide alignment affects top/center/bottom placement
  - text scales to fit and avoids mid-word breaks
  - Present starts at selected slide
  - Arrow keys, Escape, font/theme cycling, and blank toggle work
- Styling:
  - UI has no emojis
  - controls remain readable at desktop and mobile widths
  - editor/preview layout keeps brutalist borders and typography hierarchy without overlap

## Assumptions

- This is for a new repo, not changes to the current repo.
- Runtime is one static `index.html`; dev-only Playwright tests are allowed.
- v1 stores one deck, not multiple named decks.
- URL hash sharing is the only MVP import/export path.
- Brutalist, typography-driven styling is a hard design constraint, not a later polish pass.
