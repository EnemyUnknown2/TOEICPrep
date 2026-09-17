const STATUS = {
  none: { label: "미숙지", color: "var(--status-none)" },
  learning: { label: "학습중", color: "var(--status-learning)" },
  done: { label: "이해함", color: "var(--status-done)" },
};

const STORE_KEYS = { words: "toeic_words", grammar: "toeic_grammar" };

function loadEntries(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function saveEntries(key, entries) {
  localStorage.setItem(key, JSON.stringify(entries));
}

const state = {
  words: loadEntries(STORE_KEYS.words),
  grammar: loadEntries(STORE_KEYS.grammar),
};

// ---------- 사전 API로 자동 정보 조회 ----------
async function fetchDefinition(term) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const meaning = data?.[0]?.meanings?.[0];
    const def = meaning?.definitions?.[0];
    if (!def) return null;
    return {
      meaning: `(${meaning.partOfSpeech}) ${def.definition}`,
      example: def.example || "",
    };
  } catch {
    return null;
  }
}

// ---------- 항목 추가 ----------
async function addEntry(kind, term) {
  const entries = state[kind];
  const info = await fetchDefinition(term);
  entries.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    term,
    meaning: info?.meaning || "",
    example: info?.example || "",
    status: "none",
    note: "",
    addedAt: new Date().toISOString().slice(0, 10),
  });
  saveEntries(STORE_KEYS[kind], entries);
  render(kind);
}

// ---------- 목록 렌더링 ----------
function render(kind) {
  const listEl = document.getElementById(`${kind}-list`);
  if (!listEl) return;
  const entries = state[kind];
  listEl.innerHTML = "";

  if (entries.length === 0) {
    listEl.innerHTML = `<li class="empty-msg">아직 등록된 항목이 없습니다.</li>`;
    return;
  }

  entries
    .slice()
    .reverse()
    .forEach((entry) => {
      const li = document.createElement("li");
      li.className = "entry-card";
      li.innerHTML = `
        <div class="entry-top">
          <span class="entry-term">${escapeHtml(entry.term)}</span>
          <div class="entry-meta">
            <select class="status-select" data-id="${entry.id}">
              ${Object.entries(STATUS)
                .map(([k, v]) => `<option value="${k}" ${entry.status === k ? "selected" : ""}>${v.label}</option>`)
                .join("")}
            </select>
            <button class="delete-btn" data-id="${entry.id}" title="삭제">✕</button>
          </div>
        </div>
        ${entry.meaning ? `<p class="entry-meaning">${escapeHtml(entry.meaning)}</p>` : `<p class="entry-meaning" style="color:var(--muted)">뜻을 찾지 못했습니다. 메모에 직접 입력해 주세요.</p>`}
        ${entry.example ? `<p class="entry-example">${escapeHtml(entry.example)}</p>` : ""}
        <textarea class="entry-note" placeholder="메모 (이해 안 되는 부분 등)" data-id="${entry.id}">${escapeHtml(entry.note)}</textarea>
      `;
      listEl.appendChild(li);
    });

  listEl.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      updateEntry(kind, sel.dataset.id, { status: sel.value });
    });
  });

  listEl.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state[kind] = state[kind].filter((e) => e.id !== btn.dataset.id);
      saveEntries(STORE_KEYS[kind], state[kind]);
      render(kind);
    });
  });

  listEl.querySelectorAll(".entry-note").forEach((ta) => {
    ta.addEventListener("change", () => {
      updateEntry(kind, ta.dataset.id, { note: ta.value });
    });
  });
}

function updateEntry(kind, id, patch) {
  const entries = state[kind];
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  Object.assign(entry, patch);
  saveEntries(STORE_KEYS[kind], entries);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- 진행 상황 대시보드 ----------
function renderDashboard() {
  ["words", "grammar"].forEach((kind) => {
    const entries = state[kind];
    const total = entries.length;
    const doneCount = entries.filter((e) => e.status === "done").length;
    const learningCount = entries.filter((e) => e.status === "learning").length;
    const noneCount = entries.filter((e) => e.status === "none").length;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;

    document.getElementById(`${kind}-total`).textContent = `${total}개 등록됨`;
    document.getElementById(`${kind}-progress`).style.width = `${pct}%`;
    document.getElementById(`${kind}-breakdown`).innerHTML = `
      <span><span class="dot" style="background:${STATUS.done.color}"></span>이해함 ${doneCount}</span>
      <span><span class="dot" style="background:${STATUS.learning.color}"></span>학습중 ${learningCount}</span>
      <span><span class="dot" style="background:${STATUS.none.color}"></span>미숙지 ${noneCount}</span>
    `;
  });
}

// ---------- CSV 내보내기 / 불러오기 ----------
function toCsv(entries) {
  const header = ["term", "meaning", "example", "status", "note", "addedAt"];
  const rows = entries.map((e) => header.map((h) => csvEscape(e[h])).join(","));
  return [header.join(","), ...rows].join("\n");
}

function csvEscape(val) {
  const s = (val ?? "").toString().replace(/"/g, '""');
  return `"${s}"`;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj = {};
    header.forEach((h, i) => (obj[h] = cells[i] || ""));
    obj.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!STATUS[obj.status]) obj.status = "none";
    return obj;
  });
}

function splitCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function setupCsvButtons(kind) {
  const exportBtn = document.getElementById(`${kind}-export`);
  const importInput = document.getElementById(`${kind}-import`);

  exportBtn?.addEventListener("click", () => {
    const csv = toCsv(state[kind]);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind === "words" ? "단어및숙어" : "문법"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = parseCsv(reader.result);
      state[kind] = state[kind].concat(imported);
      saveEntries(STORE_KEYS[kind], state[kind]);
      render(kind);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  });
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab)?.classList.add("active");
      if (btn.dataset.tab === "dashboard") renderDashboard();
    });
  });
}

function setupForm(kind, formId, inputId) {
  document.getElementById(formId)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById(inputId);
    const term = input.value.trim();
    if (!term) return;
    input.value = "";
    await addEntry(kind, term);
  });
}

function init() {
  setupTabs();
  setupForm("words", "words-form", "words-input");
  setupForm("grammar", "grammar-form", "grammar-input");
  setupCsvButtons("words");
  setupCsvButtons("grammar");
  render("words");
  render("grammar");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
