const test = require("node:test");
const assert = require("node:assert/strict");
require("../data/words.js");
const { createChecker, findIssues, fixAll, applyFixes, typoDistance, matchCase } = require("../src/spell.js");

const checker = createChecker(globalThis.TYPOFIX_WORDS, globalThis.TYPOFIX_RANKED_COUNT);

test("suggests the intended word for common typing slips", () => {
  const cases = {
    teh: "the", hte: "the", tje: "the", thsi: "this", wnat: "want", knwo: "know",
    speling: "spelling", helo: "hello", helllo: "hello", wrold: "world",
    becasue: "because", somethign: "something", keybaord: "keyboard",
    seperate: "separate", goverment: "government", freind: "friend",
    beleive: "believe", recieve: "receive", untill: "until", occured: "occurred",
    neccessary: "necessary", begining: "beginning", happend: "happened",
    adress: "address", writen: "written", refered: "referred", wprd: "word",
    fo: "of", ti: "it",
  };
  for (const [typo, want] of Object.entries(cases)) {
    assert.equal(checker.suggest(typo)[0], want, `${typo} -> ${checker.suggest(typo)}`);
  }
});

test("restores missing apostrophes in contractions", () => {
  assert.equal(checker.suggest("dont")[0], "don't");
  assert.equal(checker.suggest("im")[0], "I'm");
  assert.equal(checker.suggest("theyre")[0], "they're");
});

test("accepts real words, possessives and user-added words", () => {
  for (const w of ["the", "receive", "Dog's", "dogs'", "don't", "I"]) assert.ok(checker.isKnown(w), w);
  assert.ok(!checker.isKnown("zorbleflax"));
  checker.addWord("zorbleflax");
  assert.ok(checker.isKnown("Zorbleflax"));
  checker.removeWord("zorbleflax");
  assert.ok(!checker.isKnown("zorbleflax"));
});

test("typoDistance prices finger slips below other edits", () => {
  assert.ok(typoDistance("teh", "the") < typoDistance("tah", "the"));
  assert.ok(typoDistance("wprd", "word") < typoDistance("wzrd", "word"));
  assert.ok(typoDistance("untill", "until") < typoDistance("untilk", "until"));
  assert.equal(typoDistance("same", "same"), 0);
});

test("matchCase copies the typed capitalisation", () => {
  assert.equal(matchCase("Teh", "the"), "The");
  assert.equal(matchCase("TEH", "the"), "THE");
  assert.equal(matchCase("teh", "the"), "the");
  assert.equal(matchCase("Im", "I'm"), "I'm");
});

test("finds each kind of issue", () => {
  const kinds = (text) => findIssues(text, checker).map((i) => [i.kind, i.original]);
  assert.deepEqual(kinds("Teh cat sat."), [["spelling", "Teh"]]);
  assert.deepEqual(kinds("It was the the best."), [["repeat", " the"]]);
  assert.deepEqual(kinds("Then i left."), [["case", "i"]]);
  assert.deepEqual(kinds("Done. next one."), [["case", "n"]]);
  assert.deepEqual(kinds("Too  many spaces."), [["spacing", "  "]]);
  assert.deepEqual(kinds("Hello , world."), [["spacing", " "]]);
  assert.deepEqual(kinds("Yes,please."), [["spacing", ","]]);
  assert.deepEqual(kinds("The end.Then more."), [["spacing", "."]]);
});

test("leaves alone things that aren't typos", () => {
  const clean = [
    "I had had enough.",
    "See https://exmaple.com/pth or mail bob@exmaple.org today.",
    "Ping @jdoe about #frontnd and `cnst x`.",
    "Use myVariable and snake_cse and abc123 and NASA.",
    "We met Kubernetes and Zelphyra yesterday.",
    "Open readme.md and visit google.com now.",
    "Bring snacks, e.g. chips. Also drinks, i.e. water.",
    "Dr. Smith arrived. J. R. R. Tolkien wrote it.",
    "Wait... what?",
    "    Indented line.",
  ];
  for (const text of clean) assert.deepEqual(findIssues(text, checker), [], text);
});

test("rule groups can be switched off", () => {
  const text = "i saw teh the the cat  here.";
  const off = { spelling: false, repeats: false, capitals: false, spacing: false };
  assert.deepEqual(findIssues(text, checker, off), []);
  assert.deepEqual(findIssues(text, checker, { ...off, spelling: true }).map((i) => i.original), ["teh"]);
});

test("applyFixes uses chosen replacements and skips overlaps", () => {
  const text = "teh cat";
  const issues = [
    { start: 0, end: 3, suggestions: ["the"], replacement: "ten" },
    { start: 1, end: 2, suggestions: ["x"] },
  ];
  assert.equal(applyFixes(text, issues), "ten cat");
});

test("fixAll cleans up a messy paragraph", () => {
  const text = "i think teh quick brown fox jumpd over the the lazy dog.this is   a tset ,ok? what do you thnik";
  assert.equal(
    fixAll(text, checker),
    "I think the quick brown fox jumped over the lazy dog. This is a test, ok? What do you think",
  );
});

test("a capitalised name on its own line is not a typo", () => {
  assert.deepEqual(findIssues("Thanks,\nPriya", checker), []);
  assert.deepEqual(findIssues("Thanks.\nPriya", checker).map((i) => i.original), ["Priya"]);
  assert.deepEqual(findIssues("Teh\ncat", checker).map((i) => i.original), ["Teh", "c"]);
});

test("fixAll leaves unsure guesses for the user to decide", () => {
  const [issue] = findIssues("We got 40 signups.", checker);
  assert.equal(issue.original, "signups");
  assert.equal(issue.confident, false);
  assert.equal(fixAll("We got 40 signups.", checker), "We got 40 signups.");
  assert.equal(findIssues("Teh end.", checker)[0].confident, true);
});
