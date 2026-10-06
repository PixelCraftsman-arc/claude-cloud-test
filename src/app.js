// TypoFix UI: wires the textarea, the highlight backdrop and the margin notes
// to the engine in spell.js.
(function () {
  "use strict";

  const SAMPLE = [
    "hey Sam,",
    "",
    "Thanks for sending teh slides over. i went through them last night and they look realy good overall.One small thing on slide 4: the chart is is a bit hard to read , maybe make the labels bigger?",
    "",
    "Also the summary says we recieved 40 new signups but the the table says 42. I dont think we need the apendix at all.",
    "",
    "Can we talk tommorow morning before the meeting  if you have time?",
    "",
    "thanks,",
    "Priya",
  ].join("\n");

  const MARK_LABEL = { spelling: "sp", repeat: "del", case: "cap", spacing: "#" };
  const STORE_WORDS = "typofix.words";
  const STORE_DRAFT = "typofix.draft";

  const $ = (id) => document.getElementById(id);
  const draft = $("draft");
  const backdrop = $("backdrop");
  const notes = $("notes");
  const fixAllBtn = $("fix-all");

  const checker = TypoFix.createChecker(globalThis.TYPOFIX_WORDS || "", globalThis.TYPOFIX_RANKED_COUNT);
  const options = { spelling: true, repeats: true, capitals: true, spacing: true };
  const stets = new Set(); // issues the user chose to leave as they are
  let issues = [];
  let activeIndex = -1;

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
    },
  };

  let myWords = [];
  try { myWords = JSON.parse(store.get(STORE_WORDS) || "[]"); } catch { myWords = []; }
  myWords.forEach((w) => checker.addWord(w));

  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // Make whitespace-only fixes visible in the margin.
  const showSpaces = (s) => (s === "" ? "" : s.replace(/ /g, "␣"));

  const stetKey = (issue, text) =>
    [issue.kind, issue.original, text.slice(Math.max(0, issue.start - 12), issue.start), text.slice(issue.end, issue.end + 12)].join("|");

  function currentIssues(text) {
    return TypoFix.findIssues(text, checker, options).filter((i) => !stets.has(stetKey(i, text)));
  }

  function render() {
    const text = draft.value;
    issues = currentIssues(text);
    if (activeIndex >= issues.length) activeIndex = -1;
    renderBackdrop(text);
    renderNotes(text);
    autosize();

    const words = (text.match(/[A-Za-z0-9’']+/g) || []).length;
    $("stats").textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
    $("count").textContent = `${issues.length} ${issues.length === 1 ? "mark" : "marks"}`;
    const fixable = issues.filter((i) => i.confident).length;
    fixAllBtn.textContent = fixable ? `Fix all (${fixable})` : "Fix all";
    fixAllBtn.disabled = fixable === 0;
    store.set(STORE_DRAFT, text);
  }

  function renderBackdrop(text) {
    let html = "";
    let pos = 0;
    issues.forEach((issue, i) => {
      html += escapeHtml(text.slice(pos, issue.start));
      const cls = `k-${issue.kind}${i === activeIndex ? " active" : ""}`;
      html += `<mark class="${cls}" data-i="${i}">${escapeHtml(text.slice(issue.start, issue.end))}</mark>`;
      pos = issue.end;
    });
    // A trailing newline needs something after it to take up a line.
    backdrop.innerHTML = html + escapeHtml(text.slice(pos)) + " ";
  }

  function contextHtml(text, issue) {
    const reach = 26;
    let from = Math.max(0, issue.start - reach);
    let to = Math.min(text.length, issue.end + reach);
    // Trim to whole words and to the issue's own line.
    if (from > 0) from = text.indexOf(" ", from) + 1 || from;
    const lineStart = text.lastIndexOf("\n", issue.start - 1) + 1;
    from = Math.max(from > issue.start ? lineStart : from, lineStart);
    if (to < text.length) {
      const lastSpace = text.lastIndexOf(" ", to);
      if (lastSpace > issue.end) to = lastSpace;
    }
    const lineEnd = text.indexOf("\n", issue.end);
    if (lineEnd !== -1) to = Math.min(to, lineEnd);
    const before = escapeHtml(text.slice(from, issue.start));
    const after = escapeHtml(text.slice(issue.end, to));
    return (
      (from > lineStart ? '<span class="ell">…</span>' : "") +
      before +
      `<span class="was">${escapeHtml(showSpaces(issue.original))}</span>` +
      after +
      (to < text.length && text[to] !== "\n" ? '<span class="ell">…</span>' : "")
    );
  }

  function renderNotes(text) {
    if (!issues.length) {
      notes.innerHTML = text.trim()
        ? '<li class="empty"><strong>Clean copy</strong>No typos found. Keep typing and new marks appear here.</li>'
        : '<li class="empty"><strong>Nothing to proofread yet</strong>Type or paste text into the draft.</li>';
      return;
    }
    notes.innerHTML = issues
      .map((issue, i) => {
        const fixes = issue.suggestions.slice(0, 4).map((s, j) => {
          const label = s === "" ? "Delete" : showSpaces(s);
          return `<button type="button" class="fix" data-act="fix" data-i="${i}" data-j="${j}">${escapeHtml(label)}</button>`;
        });
        const msg = issue.suggestions.length ? issue.message : "No close match in the dictionary";
        const add = issue.kind === "spelling"
          ? `<button type="button" class="quiet" data-act="learn" data-i="${i}">Add to dictionary</button>`
          : "";
        const cls = `note k-${issue.kind}${issue.confident ? "" : " unsure"}${i === activeIndex ? " active" : ""}`;
        return `<li class="${cls}" data-i="${i}">
          <span class="mark" aria-hidden="true">${MARK_LABEL[issue.kind]}</span>
          <span class="note-msg">${escapeHtml(msg)}</span>
          <span class="context">${contextHtml(text, issue)}</span>
          <span class="actions">${fixes.join("")}<button type="button" class="quiet" data-act="stet" data-i="${i}" title="Leave this as it is"><b>stet</b> Leave it</button>${add}</span>
        </li>`;
      })
      .join("");
  }

  function autosize() {
    draft.style.height = "auto";
    draft.style.height = draft.scrollHeight + "px";
  }

  const coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  // Replace text so the browser's own undo (Ctrl+Z) can take it back.
  function replaceRange(start, end, replacement) {
    const before = draft.value;
    const expected = before.slice(0, start) + replacement + before.slice(end);
    let done = false;
    if (!coarsePointer && document.execCommand) {
      draft.focus({ preventScroll: true });
      draft.setSelectionRange(start, end);
      try { done = document.execCommand("insertText", false, replacement); } catch { done = false; }
    }
    if (!done || draft.value !== expected) {
      draft.value = expected;
      const caret = start + replacement.length;
      if (document.activeElement === draft) draft.setSelectionRange(caret, caret);
    }
    render();
  }

  function fixEverything() {
    const original = draft.value;
    let text = original;
    let count = 0;
    for (let pass = 0; pass < 3; pass++) {
      const found = currentIssues(text).filter((i) => i.confident);
      if (!found.length) break;
      count += found.length;
      text = TypoFix.applyFixes(text, found);
    }
    if (text === original) return;
    replaceRange(0, original.length, text);
    toast(`Fixed ${count} ${count === 1 ? "mark" : "marks"}. Ctrl+Z to undo.`);
  }

  function setActive(i, scrollNote) {
    if (i === activeIndex) return;
    activeIndex = i;
    backdrop.querySelectorAll("mark.active").forEach((m) => m.classList.remove("active"));
    notes.querySelectorAll(".note.active").forEach((n) => n.classList.remove("active"));
    if (i < 0) return;
    backdrop.querySelector(`mark[data-i="${i}"]`)?.classList.add("active");
    const note = notes.querySelector(`.note[data-i="${i}"]`);
    note?.classList.add("active");
    if (scrollNote && note) note.scrollIntoView({ block: "nearest" });
  }

  let toastTimer;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // --- events ---

  let renderTimer;
  draft.addEventListener("input", () => {
    autosize();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 120);
  });

  // When the caret sits inside a marked word, point at its note.
  const followCaret = () => {
    const pos = draft.selectionStart;
    setActive(issues.findIndex((i) => pos >= i.start && pos <= i.end), true);
  };
  draft.addEventListener("keyup", followCaret);
  draft.addEventListener("click", followCaret);

  notes.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    const note = e.target.closest(".note");
    if (!note) return;
    const issue = issues[+note.dataset.i];
    if (!issue) return;
    if (!btn) {
      // Clicking the note itself selects the text it refers to.
      draft.focus({ preventScroll: true });
      draft.setSelectionRange(issue.start, issue.end);
      backdrop.querySelector(`mark[data-i="${note.dataset.i}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (btn.dataset.act === "fix") {
      replaceRange(issue.start, issue.end, issue.suggestions[+btn.dataset.j]);
    } else if (btn.dataset.act === "stet") {
      stets.add(stetKey(issue, draft.value));
      render();
    } else if (btn.dataset.act === "learn") {
      const word = issue.original.toLowerCase();
      checker.addWord(word);
      if (!myWords.includes(word)) myWords.push(word);
      store.set(STORE_WORDS, JSON.stringify(myWords));
      updateDictInfo();
      toast(`Added “${issue.original}” to your dictionary`);
      render();
    }
  });

  notes.addEventListener("mouseover", (e) => {
    const note = e.target.closest(".note");
    setActive(note ? +note.dataset.i : -1, false);
  });
  notes.addEventListener("mouseleave", () => setActive(-1, false));

  document.querySelectorAll("[data-rule]").forEach((box) => {
    box.addEventListener("change", () => {
      options[box.dataset.rule] = box.checked;
      render();
    });
  });

  fixAllBtn.addEventListener("click", fixEverything);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      fixEverything();
    }
  });

  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(draft.value);
      toast("Copied to clipboard");
    } catch {
      draft.focus();
      draft.select();
      toast("Press Ctrl+C to copy the selected text");
    }
  });

  window.addEventListener("resize", autosize);

  function updateDictInfo() {
    const total = checker.rank.size.toLocaleString();
    $("dict-info").textContent = myWords.length
      ? `${total} words in the dictionary, plus ${myWords.length} of your own.`
      : `${total} words in the dictionary.`;
  }

  function start(data) {
    draft.value = data.text ?? store.get(STORE_DRAFT) ?? SAMPLE;
    updateDictInfo();
    render();
    // Webfonts change line wrapping, so measure again once they load.
    document.fonts?.ready.then(autosize);
  }

  window.claude?.hot?.snapshot?.(() => ({ text: draft.value }));
  if (window.claude?.hot?.ready) window.claude.hot.ready(start);
  else start(window.claude?.hot?.data ?? {});
})();
