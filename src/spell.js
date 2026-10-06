// TypoFix correction engine. No dependencies; runs in the browser (as a
// classic script, exposing `TypoFix`) and in Node (via require).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TypoFix = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LETTERS = "abcdefghijklmnopqrstuvwxyz";

  // QWERTY neighbours: hitting one of these instead of the intended key is
  // the most common typing slip, so such substitutions cost less.
  const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const ROW_OFFSET = [0, 0.25, 0.75];
  const KEY_POS = {};
  KEY_ROWS.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) KEY_POS[row[c]] = [r, c + ROW_OFFSET[r]];
  });
  function keysAdjacent(a, b) {
    const pa = KEY_POS[a];
    const pb = KEY_POS[b];
    if (!pa || !pb) return false;
    return Math.abs(pa[0] - pb[0]) <= 1 && Math.abs(pa[1] - pb[1]) <= 1.05;
  }

  // Edit costs for the weighted distance, tuned for slips of the fingers
  // rather than spelling-by-ear. A plain substitution costs 1.
  const COST = {
    adjacentKey: 0.6, // "wprd" -> "word"
    vowelSwap: 0.75, // "seperate" -> "separate"
    transpose: 0.45, // "teh" -> "the"
    doubled: 0.4, // "untill" -> "until", "ocurred" -> "occurred"
    extraNearKey: 0.6, // "worfd" -> "word"
    extra: 0.9, // "wiord" -> "word"
    missedVowel: 0.65, // "happend" -> "happened"
    missed: 0.8, // "wrd" -> "word"
  };
  const VOWELS = new Set("aeiou");

  // Restricted Damerau-Levenshtein distance with typing-aware weights.
  // `typed` is what the user typed, `word` the dictionary candidate.
  function typoDistance(typed, word) {
    const n = typed.length;
    const m = word.length;
    // Cost of typing typed[i] when it isn't wanted.
    const extraCost = (i) => {
      const t = typed[i];
      if (typed[i - 1] === t || typed[i + 1] === t) return COST.doubled;
      if (keysAdjacent(t, typed[i - 1]) || keysAdjacent(t, typed[i + 1])) return COST.extraNearKey;
      return COST.extra;
    };
    // Cost of leaving out word[j].
    const missedCost = (j) => {
      const w = word[j];
      if (word[j - 1] === w || word[j + 1] === w) return COST.doubled;
      return VOWELS.has(w) ? COST.missedVowel : COST.missed;
    };
    let prev2 = null;
    let prev = new Array(m + 1);
    prev[0] = 0;
    for (let j = 1; j <= m; j++) prev[j] = prev[j - 1] + missedCost(j - 1);
    for (let i = 1; i <= n; i++) {
      const cur = new Array(m + 1);
      const ins = extraCost(i - 1);
      cur[0] = prev[0] + ins;
      const t = typed[i - 1];
      for (let j = 1; j <= m; j++) {
        const w = word[j - 1];
        if (t === w) {
          cur[j] = prev[j - 1];
          continue;
        }
        let sub = 1;
        if (keysAdjacent(t, w)) sub = COST.adjacentKey;
        else if (VOWELS.has(t) && VOWELS.has(w)) sub = COST.vowelSwap;
        let best = Math.min(prev[j - 1] + sub, prev[j] + ins, cur[j - 1] + missedCost(j - 1));
        if (i > 1 && j > 1 && t === word[j - 2] && typed[i - 2] === w) {
          best = Math.min(best, prev2[j - 2] + COST.transpose);
        }
        cur[j] = best;
      }
      prev2 = prev;
      prev = cur;
    }
    return prev[m];
  }

  // Every string one plain edit away from `word`.
  function edits1(word) {
    const out = new Set();
    for (let i = 0; i <= word.length; i++) {
      const left = word.slice(0, i);
      const right = word.slice(i);
      if (right) out.add(left + right.slice(1));
      if (right.length > 1) out.add(left + right[1] + right[0] + right.slice(2));
      for (const c of LETTERS) {
        if (right) out.add(left + c + right.slice(1));
        out.add(left + c + right);
      }
    }
    out.delete(word);
    return out;
  }

  // Missing apostrophes are a typo the edit model can't rank well (the
  // frequency list counts "don't" as "don" + "'t"), so they get a table.
  const CONTRACTIONS = {
    dont: "don't", doesnt: "doesn't", didnt: "didn't", isnt: "isn't",
    arent: "aren't", wasnt: "wasn't", werent: "weren't", havent: "haven't",
    hasnt: "hasn't", hadnt: "hadn't", couldnt: "couldn't", wouldnt: "wouldn't",
    shouldnt: "shouldn't", mustnt: "mustn't", neednt: "needn't", aint: "ain't",
    im: "I'm", ive: "I've", youre: "you're", youve: "you've", youll: "you'll",
    youd: "you'd", theyre: "they're", theyve: "they've", theyll: "they'll",
    theyd: "they'd", weve: "we've", hes: "he's", shes: "she's", thats: "that's",
    whats: "what's", wheres: "where's", whos: "who's", theres: "there's",
    heres: "here's", couldve: "could've", wouldve: "would've",
    shouldve: "should've", mightve: "might've",
  };

  // Common misspellings that are too far from the right word (or too close
  // to a different real word) for the edit model to get right reliably.
  const KNOWN_TYPOS = {
    alot: "a lot", tommorow: "tomorrow", tommorrow: "tomorrow",
    recieve: "receive", recieved: "received", wich: "which", thier: "their",
    definately: "definitely", untill: "until", occured: "occurred",
    acommodate: "accommodate", accomodate: "accommodate", wierd: "weird",
    becuase: "because", beacuse: "because", becasue: "because",
    noone: "no one",
    teh: "the", adn: "and", nad: "and", taht: "that", jsut: "just",
    waht: "what", whta: "what", thnak: "thank", thnaks: "thanks", yuo: "you",
  };

  class SpellChecker {
    // `words`: lowercase words, most frequent first. The first `rankedCount`
    // are frequency-ordered; the rest are valid but rare, in no order.
    constructor(words, rankedCount = words.length) {
      this.rank = new Map();
      this.ignored = new Set();
      this.rareRank = Math.max(rankedCount * 2, 1000);
      words.forEach((w, i) => {
        if (w && !this.rank.has(w)) this.rank.set(w, i < rankedCount ? i : this.rareRank);
      });
      this.cache = new Map();
    }

    // Log-probability of a word under a Zipf model of its frequency rank,
    // damped so that very common words don't drown out closer matches.
    logFreq(word) {
      const r = this.rank.get(word);
      return r === undefined ? -Infinity : -0.6 * Math.log(r + 10);
    }

    addWord(word) {
      this.ignored.add(word.toLowerCase());
      this.cache.clear();
    }

    removeWord(word) {
      this.ignored.delete(word.toLowerCase());
      this.cache.clear();
    }

    isKnown(word) {
      const w = word.toLowerCase();
      if (this.rank.has(w) || this.ignored.has(w)) return true;
      // Possessives: "dog's", "James'".
      if (/'s$/.test(w)) return this.isKnown(w.slice(0, -2));
      if (/s'$/.test(w)) return this.isKnown(w.slice(0, -1));
      return false;
    }

    // Is `suggestion` close enough to `word` to apply without asking?
    // A table hit is; otherwise it must be about one finger slip away.
    isConfident(word, suggestion) {
      if ((KNOWN_TYPOS[word] || CONTRACTIONS[word]) === suggestion) return true;
      return typoDistance(word, suggestion) <= 1;
    }

    // Ranked replacement suggestions for a lowercase word.
    suggest(word, limit = 5) {
      const w = word.toLowerCase();
      const key = w + "|" + limit;
      if (this.cache.has(key)) return this.cache.get(key);

      const fixed = KNOWN_TYPOS[w] || CONTRACTIONS[w];
      const scored = new Map();
      const consider = (cand) => {
        if (scored.has(cand) || !this.rank.has(cand)) return;
        const dist = typoDistance(w, cand);
        // Distance dominates; frequency breaks ties between close candidates.
        scored.set(cand, this.logFreq(cand) - 10 * dist);
      };

      const near = edits1(w);
      near.forEach(consider);
      // Two edits away is a big search, so only go there when nothing
      // reasonably common is one edit away.
      const hasCommonNear = [...scored.keys()].some((c) => this.rank.get(c) < this.rareRank);
      if (!hasCommonNear && w.length <= 14) {
        for (const e1 of near) for (const e2 of edits1(e1)) consider(e2);
      }

      let results = [...scored.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cand]) => cand);
      if (fixed) results = [fixed, ...results.filter((r) => r !== fixed.toLowerCase())];
      results = results.slice(0, limit);
      this.cache.set(key, results);
      return results;
    }
  }

  // Copy the capitalisation of what was typed onto the replacement.
  function matchCase(typed, replacement) {
    if (replacement.startsWith("I'") || replacement === "I") return replacement;
    if (typed.length > 1 && typed === typed.toUpperCase()) return replacement.toUpperCase();
    if (typed[0] === typed[0].toUpperCase() && typed[0] !== typed[0].toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  const ABBREVIATIONS = new Set([
    "e.g", "i.e", "etc", "vs", "mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr",
    "approx", "no", "fig", "inc", "ltd", "co",
  ]);
  // Doubled words that are sometimes correct ("I had had enough").
  const OK_REPEATS = new Set(["had", "that", "do", "very", "so", "bye", "ha", "no", "yeah", "really", "many", "far", "long", "more"]);

  // File extensions and domains: "readme.md" and "google.com" aren't
  // two sentences missing a space.
  const NOT_SENTENCE_AFTER_DOT = new Set([
    "com", "org", "net", "io", "dev", "app", "edu", "gov", "co", "uk", "ai",
    "js", "ts", "py", "md", "txt", "html", "css", "json", "csv", "pdf", "png", "jpg",
  ]);

  const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
  // Text we shouldn't spell-check: URLs, emails, @handles, #tags, `code`,
  // paths, and file names or domains.
  const SKIP_RE = new RegExp(
    [
      /(?:https?:\/\/|www\.)\S+/.source,
      /[\w.+-]+@[\w-]+\.[\w.-]+/.source,
      /[@#]\w+/.source,
      /`[^`\n]*`/.source,
      /(?:^|\s)~?\/\S+/.source,
      `[\\w-]+\\.(?:${[...NOT_SENTENCE_AFTER_DOT].join("|")})\\b`,
    ].join("|"),
    "gi",
  );

  // Find problems in `text`. Each issue is
  //   { start, end, original, suggestions: [string], kind, message, confident }
  // where `confident` means the first suggestion is safe to apply unasked.
  // where kind is "spelling" | "repeat" | "case" | "spacing".
  // `options` toggles the rule groups; all default to on.
  function findIssues(text, checker, options = {}) {
    const opt = { spelling: true, repeats: true, capitals: true, spacing: true, ...options };
    const issues = [];

    const skipped = [];
    for (const m of text.matchAll(SKIP_RE)) skipped.push([m.index, m.index + m[0].length]);
    const isSkipped = (pos) => skipped.some(([s, e]) => pos >= s && pos < e);

    const words = [];
    for (const m of text.matchAll(WORD_RE)) {
      if (isSkipped(m.index)) continue;
      // Words glued to digits or underscores ("abc123", "snake_case") are identifiers.
      const before = text[m.index - 1];
      const after = text[m.index + m[0].length];
      if (/[\d_]/.test(before || "") || /[\d_]/.test(after || "")) continue;
      words.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }

    words.forEach((w, i) => {
      const raw = w.text.replace(/’/g, "'");
      const lower = raw.toLowerCase();
      const prevWord = words[i - 1];
      const gap = prevWord ? text.slice(prevWord.end, w.start) : null;
      const startsSentence = isSentenceStart(text, w.start);

      if (opt.repeats && prevWord && /^[ \t]+$/.test(gap) && prevWord.text.toLowerCase() === lower && !OK_REPEATS.has(lower)) {
        issues.push({
          start: prevWord.end, end: w.end, original: text.slice(prevWord.end, w.end),
          suggestions: [""], kind: "repeat", message: `"${w.text}" is repeated`,
        });
        return;
      }

      if (opt.capitals && /^i(['’](m|ve|ll|d))?$/.test(w.text) && text.slice(w.end, w.end + 2) !== ".e") {
        issues.push({
          start: w.start, end: w.start + 1, original: "i", suggestions: ["I"],
          kind: "case", message: '"I" is always capitalised',
        });
        return;
      }

      if (opt.spelling && !checker.isKnown(raw) && shouldSpellCheck(w.text, startsSentence && !isSignOffName(text, w))) {
        const ranked = checker.suggest(lower);
        const suggestions = ranked.map((s) => matchCase(w.text, s));
        const confident = ranked.length > 0 && checker.isConfident(lower, ranked[0]);
        issues.push({
          start: w.start, end: w.end, original: w.text, suggestions, kind: "spelling", confident,
          message: confident ? "Typo" : "Unknown word. Is it one of these?",
        });
        return;
      }

      if (opt.capitals && startsSentence && /^[a-z]/.test(w.text) && !isSkipped(w.start)) {
        issues.push({
          start: w.start, end: w.start + 1, original: w.text[0],
          suggestions: [w.text[0].toUpperCase()], kind: "case",
          message: "Sentences start with a capital letter",
        });
      }
    });

    if (opt.spacing) issues.push(...findSpacingIssues(text, isSkipped, checker));

    for (const issue of issues) if (issue.confident === undefined) issue.confident = true;
    issues.sort((a, b) => a.start - b.start || a.end - b.end);
    // Drop overlaps, keeping the earliest issue.
    const out = [];
    let lastEnd = -1;
    for (const issue of issues) {
      if (issue.start >= lastEnd) {
        out.push(issue);
        lastEnd = Math.max(issue.end, issue.start + 1);
      }
    }
    return out;
  }

  function shouldSpellCheck(word, startsSentence) {
    if (word.length < 2) return false;
    // ACRONYMS and camelCase / mixed-case identifiers are left alone.
    if (word.length <= 5 && word === word.toUpperCase()) return false;
    if (/[a-z][A-Z]/.test(word)) return false;
    // A capitalised unknown word mid-sentence is most likely a name.
    if (/^[A-Z][a-z]/.test(word) && !startsSentence) return false;
    return true;
  }

  // A capitalised word alone on the line after "Thanks," or "Best," is a
  // name in a sign-off, so it gets the same benefit of the doubt.
  function isSignOffName(text, w) {
    const lineStart = text.lastIndexOf("\n", w.start - 1) + 1;
    let lineEnd = text.indexOf("\n", w.end);
    if (lineEnd === -1) lineEnd = text.length;
    if (text.slice(lineStart, lineEnd).trim().replace(/[.!]$/, "") !== w.text) return false;
    return /,[ \t]*\n[ \t]*$/.test(text.slice(0, lineStart));
  }

  function isSentenceStart(text, pos) {
    let i = pos - 1;
    while (i >= 0 && /[ \t"'“‘(]/.test(text[i])) i--;
    if (i < 0) return true;
    if (text[i] === "\n") return true;
    if (!/[.!?]/.test(text[i])) return false;
    if (i + 1 === pos) return false; // "end.next" — no space, likely not a sentence
    if (text[i] === ".") {
      // Ellipses and abbreviations don't end sentences.
      if (text[i - 1] === ".") return false;
      if (isAbbreviation(text.slice(Math.max(0, i - 12), i))) return false;
    }
    return true;
  }

  // Does `before` (the text up to a ".") end in an abbreviation like
  // "e.g", "Dr" or an initial ("J")?
  function isAbbreviation(before) {
    const m = /(?:^|[^A-Za-z.])([A-Za-z.]+)$/.exec(before);
    if (!m) return false;
    const tail = m[1].toLowerCase();
    if (/^[a-z]$/.test(tail) || /(^|\.)[a-z]$/.test(tail)) return true; // "J." or "e.g."
    return ABBREVIATIONS.has(tail) || ABBREVIATIONS.has(tail.split(".").pop());
  }

  function findSpacingIssues(text, isSkipped, checker) {
    const issues = [];
    const add = (start, end, replacement, message) => {
      if (isSkipped(start)) return;
      issues.push({ start, end, original: text.slice(start, end), suggestions: [replacement], kind: "spacing", message });
    };
    // Runs of spaces between words (indentation at line start is fine).
    for (const m of text.matchAll(/(\S)( {2,})(?=\S)/g)) {
      add(m.index + 1, m.index + 1 + m[2].length, " ", "Extra spaces");
    }
    // Space before punctuation: "word ," -> "word,". A "." only counts at
    // the end of a sentence (so ".net" and "..." are left alone).
    for (const m of text.matchAll(/([A-Za-z])( +)([,;:!?]|\.(?=\s|$))/g)) {
      add(m.index + 1, m.index + 1 + m[2].length, "", "No space before punctuation");
    }
    // Missing space after a comma, semicolon, ! or ? between letters.
    for (const m of text.matchAll(/[a-z]([,;!?])([A-Za-z])/g)) {
      const at = m.index + 1;
      add(at, at + 1, m[1] + " ", "Add a space after punctuation");
    }
    // Missing space after a full stop: "dog.the" -> "dog. the", but only
    // when both sides are real words, so domains and file names survive.
    for (const m of text.matchAll(/(?<![\w.@\/])([A-Za-z]{2,})\.([A-Za-z]{2,})(?![\w.@\/])/g)) {
      const [, left, right] = m;
      if (NOT_SENTENCE_AFTER_DOT.has(right.toLowerCase())) continue;
      if (!checker.isKnown(left) || !checker.isKnown(right)) continue;
      const at = m.index + left.length;
      add(at, at + 1, ". ", "Add a space after the full stop");
    }
    return issues;
  }

  // Apply issues (each with a chosen `replacement`, defaulting to the first
  // suggestion) to `text`, returning the new text.
  function applyFixes(text, issues) {
    let out = "";
    let pos = 0;
    for (const issue of [...issues].sort((a, b) => a.start - b.start)) {
      if (issue.start < pos) continue;
      const replacement = issue.replacement ?? issue.suggestions[0];
      if (replacement === undefined) continue;
      out += text.slice(pos, issue.start) + replacement;
      pos = issue.end;
    }
    return out + text.slice(pos);
  }

  // Fix everything with a confident suggestion. Fixing can uncover new
  // issues (e.g. "teh teh" -> "the the"), so repeat until stable.
  function fixAll(text, checker, options) {
    for (let pass = 0; pass < 3; pass++) {
      const issues = findIssues(text, checker, options).filter((i) => i.confident);
      if (!issues.length) break;
      text = applyFixes(text, issues);
    }
    return text;
  }

  function createChecker(wordString, rankedCount) {
    return new SpellChecker(wordString.split("\n"), rankedCount);
  }

  return { SpellChecker, createChecker, findIssues, applyFixes, fixAll, typoDistance, matchCase, edits1 };
});
