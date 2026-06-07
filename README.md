# Show Big Words

Present text as large as possible. A static, local-first slide editor that displays each slide with the text scaled to fill the screen. No accounts, no build step — decks save in your browser and share by URL.

## Usage

Open `index.html` in a browser. That's the whole app.

To run it over a local server (recommended — `localStorage` and the clipboard work in a secure context, `file://` does not):

```
npx http-server . -p 4173
```

Then visit <http://localhost:4173/index.html>.

Type your slides in the editor, then hit **Present →** to show them full-screen. Your deck is saved automatically to the browser's local storage, so it's there when you come back.

## Editing

Each slide is a text box. The masthead shows the current **theme**, **font**, and **transition** — click any of them to cycle through the options. Use the slide controls to insert, reorder, and align slides. On wide screens the editor sits as a centered column so the layout stays balanced rather than hugging the left edge.

While editing, press **Escape** to step out of the text box; then `t` cycles the theme, `f` cycles the font, and `p` starts presenting. Press **Shift+Enter** to jump to the next slide's text box — or, on the last slide, to add a new slide and start editing it.

### Settings

| Setting | Values | Default |
|---------|--------|---------|
| theme | `paper`, `ink`, `presenter`, `gradient` | `paper` |
| font | `sans`, `mono`, `serif`, `pixel` | `sans` |
| transition | `wipe`, `fade` | `none` |

### Formatting

#### Subtext

A blank line within a slide splits it into main text and subtext. Subtext renders at half the font size with a lighter weight:

```
Big headline

Smaller supporting text
```

#### Vertical alignment

By default, text is vertically centered. Pad the text with blank lines to shift it: a blank line **after** the text pushes it to the top, a blank line **before** it pushes it to the bottom. The alignment indicator beside the slide number reflects what the padding produced.

#### Horizontal centering

Start a line with **two leading spaces** to center it horizontally; other lines stay left-aligned:

```
  Centered line
Left-aligned line
```

#### Annotations

Wrap text in double parentheses to style it as an annotation (reduced opacity, smaller):

```
Main point
((small note))
```

## Presenting

Click anywhere on the slide to advance to the next one. The keys below also work:

| Key | Action |
|-----|--------|
| Right / Space / Enter | Next slide |
| Left / Backspace | Previous slide |
| Home | First slide |
| End | Last slide |
| `f` | Cycle font (saved to the deck) |
| `t` | Cycle theme (saved to the deck) |
| `b` | Toggle blank screen |
| Escape | Exit present mode |

## Sharing

Click **share url** to copy a link to your clipboard. The whole deck is encoded into the URL's `#deck=` fragment — open that link anywhere and the deck is imported and saved locally. Nothing leaves your machine until you share the link.

## How text scaling works

The app uses a minor-third (1.2×) type scale. For each slide it tries the largest font size first and steps down until the text fits both the width and height of the slide area. Words never break mid-word — they wrap at spaces and scale down to fit.

## Development

The entire app — markup, styles, and logic — lives in `index.html`. Tests are in `test/`.

## License

MIT
