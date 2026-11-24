# Design guide: House to i3d (for the map app to follow)

Written 2026-11-23 from what the app does today (`frontend/src/app/globals.css`, `layout.tsx`, `src/app/page.tsx`, `components/`). Where the code and this
file disagree, the code wins until this file is updated; change both together. The aim: the two apps (buildings and the map app) look and behave
like one product, with the app switch in the header (Maps | Buildings) as the seam.

## 1. Principles

1. **Calm and tool-like.** A work surface for building things, not a marketing page: muted green-grey ground, one warm red accent, little decoration.
2. **One accent, used for the main action only.** The red (`--accent`) marks the single primary button on a view (New, Save, Pack) and the selected state of
   a segmented control. Everything else is neutral. Never two primary buttons side by side.
3. **Show one thing at a time.** Long lists are split with tabs (folder, kind) instead of scrolling; "New" shows only what you can start from, not the
   list of what already exists (the list is hidden while choosing).
4. **Same control, same meaning, everywhere.** A choice between a few named alternatives is always tabs (see 4.3), never a dropdown. A dropdown is for
   a long list of values (a folder, a language). The same goes for the building's types in "New" and in the list.
5. **Counts on tabs.** Every tab that filters a list shows how many items it holds (`Houses 4`).
6. **Plain words, English text is the key.** Labels are short and in sentence case (`Not in a folder`, not `NOT IN A FOLDER`). Every visible text goes
   through `t()` (see "Languages" in CLAUDE.md); Swedish is `sv.json`. User-written names get `translate="no"`.
7. **Works on a phone.** 16 px side gutters, grids and tab rows wrap, nothing wider than the screen except tables and code in their own scroll box.

## 2. Tokens

All colours are CSS variables on `:root`. A light set is the default; the dark set applies under `prefers-color-scheme: dark` (unless
`data-theme="light"`) and under `data-theme="dark"`. Both blocks list every token. `color-scheme` follows.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#E7EAE4` | `#131815` | page background |
| `--panel` | `#F6F7F3` | `#1A201C` | cards, top bar, selected tab, panels |
| `--field` | `#FFFFFF` | `#222A25` | inputs, buttons (resting) |
| `--ink` | `#1E2621` | `#E3E8E1` | text |
| `--muted` | `#5A655E` | `#98A49C` | secondary text, counts, hints, unselected tabs |
| `--line` | `#CDD3CB` | `#2E3832` | every border and divider |
| `--accent` | `#9B2A1F` | `#D4553F` | primary button, destructive text, errors, selected segment |
| `--accent-ink` | `#FFFFFF` | `#FFFFFF` | text on the accent |
| `--pine` | `#2F4A3C` | `#8FB8A0` | links, focus ring |
| `--stage` | `#D9E0D6` | `#1E2621` | picture/preview background (3D view, thumbnails) |
| `--ground` | `#A9B59C` | `#3A4636` | the ground in 3D previews |
| `--ok` | `#2F6B45` | `#7FC79A` | success, "ok" badge |

Rules: no hard-coded colours in components (a picture's own colours excepted); `body` always has an explicit background; focus is a 2 px `--pine`
outline with 2 px offset on every focusable thing (`:focus-visible`).

## 3. Type, shape and space

- **Fonts** (Google Fonts via `next/font`): body **Barlow** 400/500/600, headings **Barlow Condensed** 600/700 (`--font-body`, `--font-display`),
  fallbacks system-ui / Arial Narrow. Body 15 px, line height 1.45.
- **Headings** are Barlow Condensed bold, line height 1.1: page title (`h2`) 30 px, section (`h3`) 20 px, card/group title 15-16 px, small caps
  label (`h4`) 15 px muted uppercase with .04em tracking. Card titles and buttons are Barlow 600.
- **Hints and secondary text:** 13.5 px `--muted`. Counts inside tabs and headings 14 px `--muted`, normal weight.
- **Radii:** 6 px controls (buttons, inputs, segments), 8 px tab tops and the app switch, 10 px cards, 12 px big panels and the pack bar, 99 px pills/badges.
- **Borders:** always 1 px `--line`. Shadows only on things that float (the sticky pack bar: `0 6px 24px rgba(0,0,0,.18)`).
- **Spacing:** 4 / 6 / 8 / 10 / 12 / 16 / 24; grid gaps 12-16, page padding `24px 16px 48px`, page max width 1080 px, centred.
- **Motion:** almost none; honour `prefers-reduced-motion`.

## 4. Components

### 4.1 Top bar
Panel background, 1 px bottom border, `10px 16px` padding, wraps. Left to right: brand (logo 30 px + condensed title 24 px + small muted tagline), the
**app switch**, then the pages of the work as buttons (here `Buildings`, `Mods`, `Items`, `Textures`; the current one has an accent border, `.current`),
pushed to the right, then two **icon buttons** (34 px square, muted, ink on hover): the **gear** (settings menu) and the **log-out arrow**.
- **Settings menu** (`SettingsMenu.tsx`): opens under the gear, right-aligned, panel fill, 10 px radius, shadow; closes on Esc, a click outside and a page change. Top
  to bottom: the user's name (muted, separated by a line), Language (label + select), the other pages that are not daily work (API, Admin when the user is admin), and
  the version at the foot. New "settings-like" pages go here, not in the bar.
- Icon buttons have `aria-label` and `title` (the words; icons alone are never the only label). Logged out (login pages): language select and version only.
- **App switch:** a pill group (`.appswitch`: 1 px border, 8 px radius, 2 px padding, `--bg` fill); each entry an icon (18 px) + label, label hidden below
  560 px; the current app is highlighted like a selected tab. The map app must use the same markup and CSS so the switch looks identical in both.

### 4.2 Buttons
One shape: `font: inherit`, weight 500, 1 px `--line` border, `--field` fill, 7 px / 12 px padding, 6 px radius, inline-flex with a 6 px gap.
- **Default** hover: border `--muted`.
- **Primary** (`.primary`): `--accent` fill and border, white text, weight 600. One per view.
- **Danger** (`.danger`): normal button with `--accent` text (not filled); the confirm step is a separate, explicit one.
- **Link-like** (`.linklike`) for small in-heading actions (Select all).
- Disabled: 50 % opacity. Buttons on a card are small (4 px / 10 px, 14 px text).

### 4.3 Tabs (the one navigation-within-a-page pattern)
Two levels, same markup (`role="tablist"` > `role="tab"` + `aria-selected`):
- **Primary tabs** (`.starttabs`): text tabs on a 1 px baseline, tab tops rounded 8 px. Selected: panel fill, ink text, weight 600, border on three sides,
  overlapping the baseline. Unselected: muted text. Use for the main split of a page (Buildings | Props). An outgoing link may sit at the far right
  (`margin-left: auto`, same look, no selected state).
- **Secondary tabs** (`.starttabs.sub`): pills, 4 px / 12 px, 14 px text, 1 px `--line` border, 99 px radius. Selected: `--ink` fill with `--panel` text.
  Use for filters below primary tabs (folder, kind) and for choosing a type in "New".
- Each tab shows its count in `<small>` when it filters a list. Tab rows wrap; changing a higher row resets the rows under it to "All".
  A row with only one choice is not shown. Folder names are user text (`translate="no"`).

### 4.4 Cards and grids
`.grid`: `repeat(auto-fill, minmax(240px, 1fr))`, 16 px gap; `.grid.compact` (starting points in "New"): `minmax(170px, 1fr)`, 12 px gap.
**Card** (`.house`, `.preset`): panel fill, 1 px line, 10 px radius, picture first (16:10, `--stage` background, `object-fit: cover`, flush with the
card's top edge), then title (16 px, 600, wraps anywhere), a muted line (edited time / blurb), then actions at the bottom (`margin-top: auto`).
A card that starts something is a button and its border turns `--accent` on hover/focus. A tick box for selection sits over the picture's top-left corner.
No picture yet: a `--stage` placeholder with muted text ("No preview yet").

### 4.5 Page head, groups, empty state
- **Page head:** title at the left (30 px condensed), actions right (`margin-left: auto`), wraps. Select all, then the one primary action.
- **Group heading** (`h3` 20 px + count + optional link-like action) over a grid; collapsible with a small ▶/▼ button when the list is long.
- **Empty state:** centred panel with a dashed 1 px border, a 22 px heading, one sentence, and the primary button. Loading: plain muted text.
- **Hints** (`.hint`) sit under what they explain; **errors** (`.error`, role `alert`) are accent-coloured text under the page head, never a modal.

### 4.6 Forms and inputs
Text inputs: full width, 9 px / 10 px padding, 6 px radius, `--field` fill, 1 px line. Labels above inputs, weight 500 (`label.stack`). Selects match
inputs. A choice of a few mutually exclusive values in a tool panel is a **segmented control** (`.seg`: buttons joined with -1 px margins, the pressed
one filled `--accent`). Sliders pair with an editable number (click the number to type).

### 4.7 Badges, bars, toasts
- **Badge:** 12.5 px, pill, 1 px line, muted; `.ok` is `--ok` text and border.
- **Pack bar** (`.packbar`): sticky 12 px above the bottom edge, panel, 12 px radius, shadow; count, a text field, the primary action, Clear. It appears only
  while something is selected.
- **Toasts** (`.hx-toast`): short, bottom, fade; never block.
- **Dialogs** (`components/dialog.mjs`: `confirmDialog`, `promptDialog`, `formDialog`): a native `<dialog>` opened modally, never the browser's `confirm`/`prompt`/`alert`. Panel fill, 12 px radius, 440 px wide at most, dark backdrop, a 20 px condensed title (optional), the message (line breaks kept), fields as in 4.6, and buttons at the right: Cancel, then the action as the one primary button (red). A question that deletes puts focus on Cancel so Enter does not delete; a form puts the cursor in its first field. Esc and a click outside cancel.

## 5. Layout patterns

- **List pages** (My buildings, Mods, My items, My textures): top bar > page head > tab rows > grid of cards > (sticky bar). Max width 1080 px.
- **Chooser** ("New"): replaces the list while open (list and tab rows hidden), title "What do you want to build?" with Cancel at the right,
  one row of secondary tabs for the type, then the compact grid of starting points for that type.
- **Editor / tool pages** (building editor, modeller): full-height, three columns on a wide screen (left panel with its own tabs + tree, details
  panel, 3D preview), drag handles between panels, stacked below 820 px. The 3D stage uses `--stage`/`--ground`.

## 6. Checklist for the map app

1. Load the same two Google fonts and set the same body/heading rules.
2. Copy the token block (light, dark by media query, and `data-theme` overrides) unchanged; add map-specific tokens only as new names.
3. Same top bar order and the same `.appswitch` markup and CSS; the map app's own pages use the same button, input, card, badge and tab rules.
4. Lists of maps/folders/layers split by **tabs with counts**, not long scrolls or dropdowns; choosing what to create uses the chooser pattern.
5. One red primary button per view; destructive actions as red text with an explicit confirm.
6. Texts: English keys, Swedish file, `t()` on everything; names the user typed are `translate="no"`.
7. Check both themes and a 400 px wide screen before calling a page done.

## 7. Known gaps (to settle together with the map app)

- The kind tabs and folder tabs reset on reload (not remembered); decide whether to keep them in `localStorage`.
- Icons: the app switch has icons, nothing else does. Decide on one small icon set before adding more (e.g. for kinds in the tab rows).
- "My items" and props are still two places; a later step may merge them under one tab.
