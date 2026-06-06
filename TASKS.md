# Tasks

Live backlog. Top of **Now** gets tackled first; reorder to reprioritize.
Each task carries `where:` (so it's actionable without a grep), `why:`, and
`done:` (the check that says it's finished).

## Now

- [ ] Cap share-URL length and warn on overflow
  - where: `shareUrl()` / `encodeDeck()` in index.html
  - why: a large deck base64-encodes into the `#deck=` hash with no cap; some
    targets reject very long URLs, but the button always reports "copied!"
  - done: an oversized deck flashes a warning instead of a false "copied!"

## Later

- [ ] Replace deprecated `escape`/`unescape` in the base64url helpers
  - where: `base64urlEncode`/`base64urlDecode` in index.html (~line 1517, 1527)
  - why: both functions are deprecated; `TextEncoder`/`TextDecoder` is the
    modern path
  - note: works correctly today; UTF-8 round-trip must be preserved — add a
    round-trip test before changing

## Decisions / won't-do

- PLAN.md has drifted from the shipped app (it describes tab-indent centering
  and explicit align UI; the app now uses two-leading-spaces and a derived
  read-only indicator). Left as a historical record of the original plan —
  README.md is the source of truth for current behavior.
