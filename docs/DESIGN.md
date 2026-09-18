# Design Language

Two sources, each doing one job:

- **Anduril's industrial language** sets the look — near-black ground, white neo-grotesque type,
  olive-tinted greys, hairline rules, square corners, spec-sheet labelling, and a single acid
  accent used almost nowhere. Taken from their live site's computed styles, not guessed.
- **ISA-101 / ISA-18.2 (IEC 62682)**, the control-room standards, set what colour *means* —
  normal is quiet, colour signals abnormal only, and priority is carried by shape as well as hue.

The two agree more than they conflict: both are monochrome by default. Where they do conflict, the
functional rule wins, because a misread alarm costs more than an off-brand pixel.

**Inspired by, not copied from.** No Anduril name, logo, wordmark or licensed font ships in this
project.

---

## 1. Principles

| # | Principle | Consequence |
|---|---|---|
| 1 | **Monochrome by default.** | Black, white, olive greys. A calm screen means a calm fleet. |
| 2 | **Two hues, both meaningful.** | Red is the vehicle telling you. Chartreuse is us telling you — earlier. Nothing else is coloured. |
| 3 | **Never colour alone.** | Every state has a shape and a label treatment, so it reads in greyscale, on a washed-out projector, and for colour-blind operators. |
| 4 | **Engineered, not decorated.** | Hairlines, square corners, labelled values. No shadows, gradients, glows or rounded cards. |
| 5 | **Overview first, detail on demand.** | Four levels (§6). Each answers one question. |
| 6 | **The machine recommends; a person decides.** | Every recommendation shows the rule that fired and `GoA-R · RECOMMEND ONLY`. |
| 7 | **Data is set in a face that can't be misread.** | IDs, values and times use a mono built to separate 0/O and 1/l/I. The UI sans can't be trusted with that. |

---

## 2. Industrial language

| Motif | Rule |
|---|---|
| **Ground** | Near-black `#010101`, not pure black — matches the source. |
| **Corners** | 0 px radius, everywhere. |
| **Structure** | 1 px hairlines divide the screen. Panels are regions between rules, not floating cards. |
| **Labels** | Every value sits under a micro label — 11 px, weight 500, uppercase, +0.04em. Spec-sheet pairs. |
| **Large numerals** | Tight tracking (−0.04em) at display sizes. The lead-time readout is the loudest thing on screen. |
| **Registration marks** | Small L-shaped corner ticks frame the one focal panel per view (the L3 trend). Technical-drawing reference; never on more than one element. |
| **Schematics** | Train cars and bogies are drawn as 1 px orthographic outlines, not filled boxes. |
| **Grid** | A faint line grid appears on charts only. |
| **Imagery** | None. Line drawings and data only. |
| **Motion** | None decorative (§7). |

---

## 3. Neutrals

Olive-tinted greys lifted from the source. **Dark** is the default. **Light** is for projectors,
where dark screens wash out; its ground is warm bone, not white — white is glare.

| Token | Role | Dark | Light |
|---|---|---|---|
| `--bg` | Canvas | `#010101` | `#e6e4da` |
| `--surface-1` | Panels | `#0a0b09` | `#eeece4` |
| `--surface-2` | Raised regions, cells | `#131511` | `#f5f4ef` |
| `--line` | Hairlines | `#23261f` | `#d2cfc3` |
| `--line-strong` | Emphasised rules, schematic strokes | `#474b40` | `#a9a799` |
| `--text` | Primary text, focus ring | `#ffffff` | `#010101` |
| `--text-2` | Secondary text | `#a3a79f` | `#505544` |
| `--text-3` | Tertiary text | `#737670` | `#62645d` |
| `--ink-normal` | Equipment in normal state | `#6c6e6b` | `#7a7c72` |
| `--bone` | Inverse fills | `#f1f0ea` | `#010101` |

Hover, selection and focus use **luminance, not hue** — a lighter surface and a `--text` outline.

---

## 4. State colours — reserved

| State | Meaning | Shape | Label treatment | Fill | Text on fill | Ink (dark / light) |
|---|---|---|---|---|---|---|
| **P1 · Abnormal** | The model calls this a fault: an abnormal-resistance door movement | ■ solid square | reverse video | `#d42a1f` | white | `#ff5a4f` / `#b8241a` |
| **P2 · Early warning** | Held for a detector that warns before a fault | ▲ triangle | thin box | `#dff140` | `#010101` | `#dff140` / `#5a6300` |
| **P3 · Advisory** | Held for an elevated-but-below-threshold score | ▽ hollow inverted triangle | `[ bracketed ]` | — | — | `#a8b83a` / `#5f6a12` |
| **Data quality** | A check that warns without blocking: odd length, unexpected values | ◇ hollow dashed diamond + `?` | dashed box, hatched cell | — | — | `--text` |
| **Action required** | The user must act: a check failed, so the file is not used | ● circle | inverse pill | `--bone` | `--bg` | `--text` |

**Two hues, kept apart.** Red marks what the model calls abnormal. Chartreuse is reserved for a
warning that arrives *before* a fault, which no subsystem produces yet, so today it appears only
on this page. That is why the source's accent colour is spent here and nowhere else.

Every shape is drawn with its fill **and** a 1 px outline in its ink colour. On the dark ground
the fill carries it; on the bone ground a chartreuse fill is nearly invisible, so the olive outline
does — the reason warning signs have a dark border.

Every text pair meets WCAG AA (4.5:1) on `--bg`, `--surface-1` and `--surface-2` in its theme;
every shape meets 3:1. `python scripts/check_contrast.py` reads
`frontend/src/styles/tokens.css` and fails if any pair drops below threshold.

### Decisions worth stating

- **Healthy is not green.** Normal is the absence of signal. Green trains the eye to scan for
  "all green" instead of for the one thing that is wrong.
- **The source accent is spent on the early warning.** Anduril's chartreuse and an ISA amber would
  be indistinguishable at a glance, so they cannot coexist. Chartreuse wins because it makes the
  detector's voice the only branded thing on screen.
- **Data quality and action-required have no hue.** Pattern and inversion carry them. Two hues
  total keeps the source's restraint and keeps each hue unambiguous.
- **MRT line colours are not used.** North–South red would read as P1; East–West green as P2.
  Line identity is a neutral text chip: `NSL`, `EWL`.

---

## 5. Type

| Role | Stack | Why |
|---|---|---|
| UI, headings, readouts | `"Helvetica Now Display", "Helvetica Neue", Helvetica, "Geist", Arial, sans-serif` | The source face is Helvetica Now Display, which is commercial and not bundled. macOS ships Helvetica Neue, the closest free match; Geist (bundled, OFL) covers machines without it. |
| IDs, values, timestamps | `"Atkinson Hyperlegible Mono"` (bundled) | Helvetica cannot separate 1/l/I. Asset codes like `G0` and `GO` must never be ambiguous — the BJTU-RAO archive ships exactly that typo. |

Bundled faces are self-hosted via `@fontsource`; the demo runs offline.

| Token | Size / weight / tracking | Use |
|---|---|---|
| `--t-micro` | 11 / 500 / +0.04em, uppercase | Labels above values, column headers |
| `--t-small` | 12 / 400 | Metadata, units |
| `--t-dense` | 13 / 400 / −0.01em | Tables, checks, nav |
| `--t-body` | 14 / 400 | Default |
| `--t-title` | 20 / 500 / −0.02em | Panel and view titles |
| `--t-id` | 28 / 500 / −0.03em | Subsystem card titles |
| `--t-figure` | 40 / 500 / −0.04em | Tile values, view titles |
| `--t-readout` | 64 / 500 / −0.04em | Page title |

`font-variant-numeric: tabular-nums` on every number that aligns or updates live.

---

## 6. The app
The PS3 brief scores one app: a non-technical user picks a subsystem, uploads a data file, sees the
result and downloads it. The workbench is that app, and it is the home page.

| Route | Question | Main content |
|---|---|---|
| `/` | Where do I start? | Three steps, one card per subsystem with model and result state, submission status |
| `/door`, `/acv`, `/rail`, `/shm` | What does my file say? | 1 Upload · 2 Results · 3 Download, with *How it works* beside the upload |
| `/submission` | What goes in `predictions.zip`? | Newest predictions per subsystem, the package, the hand-in list |

- **The steps are numbered on screen** (`1 · Upload`, `2 · Results`, `3 · Download`) because the
  demo video follows them in that order.
- **Every file is checked before it is used**, and each check is listed. A pass is a quiet tick, a
  warning uses the data-quality mark, and a failure uses the action-required mark. A file meant for
  another subsystem is refused with a pointer to the right one.
- **Only abnormal results carry state colour.** An Abnormal resistance movement is a red square;
  a Normal one has no mark.
- **Every label is explained with the number the model used.** For a door movement, that is the
  current in the model's window against the threshold, drawn over the typical Normal and Abnormal
  profiles from Train.
- **A subsystem without a model says so.** It shows a dashed *Model pending* tag, still checks and
  previews files, and marks every preview *not a prediction*. It is left out of the package.
- **Download buttons name the file they save** (*Download door_predictions.csv*) and stay visible
  but disabled, with the reason, until there is something to save.
- **Runs live in the API's memory.** A restart clears them, and the page says so if it asks for a
  run the server no longer has.

## 7. Space, shape, motion

- **Spacing:** 4 px base — 4, 8, 12, 16, 24, 32, 48, 64. Gaps, not per-element margins.
- **Radius:** 0.
- **Borders:** 1 px. No shadows; depth is surface luminance.
- **Minimum width:** 1280 px. A console, not a phone.
- **Motion:** none, beyond a 120 ms colour fade on hover and the upload progress bar. The
  1 Hz pulse stays in the stylesheet for an alarm that needs acknowledging; nothing uses it yet.

---

## 8. Components

| Component | Shows |
|---|---|
| `Dropzone` | Drag and drop, file or folder picker, accepted types |
| `UploadQueue` | One line per file with its state, and progress for batches |
| `CheckList` | One line per check: mark, name, detail |
| `ModelTag`, `RunTag` | Model ready or pending; predictions ready, checked, failed or empty |
| `Tiles` | Headline counts between hairlines |
| `CycleStrip` | Door: one cell per movement in log order, abnormal cells red |
| `CycleDetail` | Door: the reason sentence, the profile against typical profiles with the model's window, raw current and position |
| `FileResults` | Batch subsystems: file table and the selected file's checks and preview |

Every component renders at `/design` in the running app.

---

## 9. Copy

- Timestamps 24-hour, `2026-09-18 14:03:22`, in the data's own clock.
- Durations `2h 43m`, `47m`, `3d 4h`.
- Codes and values in mono: `T02-C1-APU`, `LPS`, `8.42 bar`.
- Sentence case, except micro labels.
- Buttons say what happens, and name the file where there is one: **Choose a file**,
  **Download door_predictions.csv**, **Start over**.
- A label is always paired with the number behind it: *592 mA over 35–65% of the closing,
  above the 249 mA threshold.*
- No invented confidence. A model shows the value it compared and the threshold it used.
- A preview without a model says so on screen: *not a prediction*.

