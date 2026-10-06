# TypoFix

A small web app that finds typing errors and fixes them. It runs entirely in
your browser, with no server, no account and no network calls, so your text
never leaves your machine.

## Use it

Open `index.html` in a browser. That's it; no build step or server needed.

Type or paste into the **Draft**. Problems are underlined in place and listed
in the **Margin** with proofreader's marks:

| Mark  | Meaning                 | Example                       |
| ----- | ----------------------- | ----------------------------- |
| `sp`  | Spelling / typo         | `teh` → `the`, `dont` → `don't` |
| `del` | Repeated word           | `the the` → `the`             |
| `cap` | Capital letter needed   | `i think` → `I think`         |
| `#`   | Spacing                 | `word ,next` → `word, next`   |

- Click a suggestion to apply it, **stet** to leave the text as it is, or
  **Add to dictionary** for names and jargon (saved in your browser).
- **Fix all** (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) applies every confident
  fix in one step. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes it. Guesses the engine
  isn't sure about (dashed marks) are left for you to pick.
- Toggle each kind of check with the chips above the draft.

## How it works

`src/spell.js` is a dependency-free engine:

- **Dictionary:** ~73,500 words from SCOWL, ranked by real-world frequency
  (see `data/README.md`).
- **Candidates:** every dictionary word within one edit of the typo, or two
  when nothing common is one edit away.
- **Ranking:** a weighted Damerau-Levenshtein distance tuned for keyboards.
  Hitting a neighbouring QWERTY key, swapping two letters, and doubling or
  missing a double letter cost less than other edits. Ties go to the more
  common word.
- **Tables** for missing apostrophes (`dont`, `im`, `theyre`) and a few
  stubborn misspellings (`recieve`, `definately`).
- **Skips** URLs, emails, @handles, #tags, `code`, file names, acronyms,
  camelCase, and capitalised names mid-sentence or in a sign-off.

`src/app.js` is the UI, and `index.html` holds the markup and styles.

## Develop

```sh
npm test        # node --test, no dependencies to install
```
