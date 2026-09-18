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
const API_TIMEOUT_MS = 5000;

// API가 응답이 없을 때 무한 대기하지 않도록 시간 제한을 둔다.
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const POS_LABELS = { n: "noun", v: "verb", adj: "adjective", adv: "adverb" };

// Datamuse API: 무료, API 키 불필요, 정의와 품사 태그를 함께 제공 (dictionaryapi.dev보다 응답이 안정적)
async function fetchEnglishDefinition(term) {
  try {
    const res = await fetchWithTimeout(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=d&max=1`,
      API_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    const defRaw = data?.[0]?.defs?.[0];
    if (!defRaw) return null;
    const tabIndex = defRaw.indexOf("\t");
    const posCode = tabIndex === -1 ? "" : defRaw.slice(0, tabIndex);
    const definition = (tabIndex === -1 ? defRaw : defRaw.slice(tabIndex + 1)).trim();
    const posLabel = POS_LABELS[posCode] || posCode;
    return {
      partOfSpeech: posLabel,
      meaning: posLabel ? `(${posLabel}) ${definition}` : definition,
      example: "",
    };
  } catch {
    return null;
  }
}

// 품사에 맞는 짧은 문형으로 물어봐야 MyMemory가 올바른 품사로 번역해준다.
// (예: "eligible" 단독 -> "자격"(명사), "to be eligible" -> "자격을 갖추다"(형용사 의미))
function buildTranslationQuery(term, partOfSpeech) {
  if (partOfSpeech === "adjective") return `to be ${term}`;
  if (partOfSpeech === "verb") return `to ${term}`;
  return term;
}

// MyMemory 번역 API로 한국어 뜻 조회 (무료, API 키 불필요).
//
// responseData.translatedText는 MyMemory가 크라우드소싱 번역 메모리 중 "가장 유사한 문장"을
// 골라 반환하는데, 특히 짧은 단어는 우연히 글자 수만 비슷한 완전히 무관한 문장이 최고 매치로
// 뽑히는 경우가 있다 (예: "among" -> 전혀 다른 뜻의 등록된 문장). id:0/"MT!"로 표시된 항목은
// 매번 그 자리에서 새로 계산되는 순수 기계번역이라 이런 오염이 없으므로 이쪽을 뜻으로 우선
// 사용하고, 실제 번역 메모리(사람이 번역한 문장 쌍) 중 품질 좋은 것은 예문으로만 활용한다.
async function fetchKoreanMeaning(term) {
  try {
    const res = await fetchWithTimeout(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en|ko`,
      API_TIMEOUT_MS
    );
    if (!res.ok) return { text: "", example: "", exampleKo: "" };
    const data = await res.json();
    if (data?.responseStatus !== 200) return { text: "", example: "", exampleKo: "" };

    const matches = data?.matches || [];
    const mtEntry = matches.find((m) => m.id === 0 || m["created-by"] === "MT!");
    const text = (mtEntry?.translation || data?.responseData?.translatedText || "").trim();

    const goodMatch = matches.find((m) => {
      const quality = Number(m.quality) || 0;
      const isRealTM = m.id !== 0 && m["created-by"] !== "MT!";
      const looksLikeSentence = (m.segment || "").trim().length > term.length + 3;
      return isRealTM && quality >= 60 && looksLikeSentence && m.segment && m.translation;
    });

    return {
      text,
      example: goodMatch?.segment?.trim() || "",
      exampleKo: goodMatch?.translation?.trim() || "",
    };
  } catch {
    return { text: "", example: "", exampleKo: "" };
  }
}

async function fetchDefinition(term) {
  // 품사를 알아낸 "다음에" 보정 번역을 요청하면 두 단계가 순차로 더해져 최악의 경우
  // 대기 시간이 두 배(최대 10초)가 된다. 그래서 품사를 모르는 상태에서도 형용사/동사용
  // 문형 번역을 미리 함께 요청해 두고, 나중에 필요한 것만 골라 쓴다 (전부 병렬 실행).
  const [dict, bareKo, adjKo, verbKo] = await Promise.all([
    fetchEnglishDefinition(term),
    fetchKoreanMeaning(term),
    fetchKoreanMeaning(buildTranslationQuery(term, "adjective")),
    fetchKoreanMeaning(buildTranslationQuery(term, "verb")),
  ]);

  let picked = bareKo;
  if (dict?.partOfSpeech === "adjective" && adjKo.text) picked = adjKo;
  else if (dict?.partOfSpeech === "verb" && verbKo.text) picked = verbKo;

  if (!dict && !picked.text) return null;
  return {
    meaningKo: picked.text,
    meaning: dict?.meaning || "",
    example: picked.example || "",
    exampleKo: picked.exampleKo || "",
  };
}

// ---------- 문법: 내장 TOEIC 문법 데이터셋에서 검색 ----------
function normalizeGrammarTerm(str) {
  return str.trim().replace(/\s+/g, " ").toLowerCase();
}

function findLocalGrammar(term) {
  const target = normalizeGrammarTerm(term);
  if (!target) return null;

  for (const entry of TOEIC_GRAMMAR) {
    if (entry.keywords.some((k) => normalizeGrammarTerm(k) === target)) return entry;
  }
  for (const entry of TOEIC_GRAMMAR) {
    if (entry.keywords.some((k) => {
      const nk = normalizeGrammarTerm(k);
      return nk.includes(target) || target.includes(nk);
    })) return entry;
  }
  return null;
}

async function fetchGrammarInfo(term) {
  const local = typeof TOEIC_GRAMMAR !== "undefined" ? findLocalGrammar(term) : null;
  if (local) {
    return { meaningKo: local.explanation, meaning: "", example: local.example || "" };
  }
  // 데이터셋에 없으면 영어 단일 용어(gerund 등)로 간주하고 사전 API로 보조 검색
  return await fetchDefinition(term);
}

// ---------- 항목 추가 ----------
async function addEntry(kind, term) {
  const entries = state[kind];
  const info = kind === "grammar" ? await fetchGrammarInfo(term) : await fetchDefinition(term);
  entries.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    term,
    meaningKo: info?.meaningKo || "",
    meaning: info?.meaning || "",
    example: info?.example || "",
    exampleKo: info?.exampleKo || "",
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
        ${entry.meaningKo ? `<p class="entry-meaning-ko">${escapeHtml(entry.meaningKo)}</p>` : ""}
        ${entry.meaning ? `<p class="entry-meaning">${escapeHtml(entry.meaning)}</p>` : ""}
        ${!entry.meaningKo && !entry.meaning ? `<p class="entry-meaning" style="color:var(--muted)">뜻을 찾지 못했습니다. 메모에 직접 입력해 주세요.</p>` : ""}
        ${entry.example ? `
        <div class="entry-example-block">
          <p class="entry-example">${escapeHtml(entry.example)}</p>
          ${entry.exampleKo ? `<p class="entry-example-ko">${escapeHtml(entry.exampleKo)}</p>` : ""}
        </div>` : ""}
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
  const header = ["term", "meaningKo", "meaning", "example", "exampleKo", "status", "note", "addedAt"];
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
  const form = document.getElementById(formId);
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById(inputId);
    const term = input.value.trim();
    if (!term) return;
    const submitBtn = form.querySelector("button[type='submit']");
    const originalLabel = submitBtn.textContent;
    input.value = "";
    input.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "검색 중...";
    try {
      await addEntry(kind, term);
    } finally {
      input.disabled = false;
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
      input.focus();
    }
  });
}

// ---------- 자가 테스트 ----------
const testState = { kind: null, queue: [], index: 0, results: {} };

function buildTestQueue(kind, onlyUnfinished) {
  let entries = state[kind].slice();
  if (onlyUnfinished) entries = entries.filter((e) => e.status !== "done");
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries;
}

function startTest() {
  const kind = document.querySelector('input[name="test-kind"]:checked')?.value || "words";
  const onlyUnfinished = document.getElementById("test-only-unfinished")?.checked ?? true;
  const queue = buildTestQueue(kind, onlyUnfinished);
  const emptyMsg = document.getElementById("test-empty-msg");

  if (queue.length === 0) {
    if (emptyMsg) emptyMsg.style.display = "block";
    return;
  }
  if (emptyMsg) emptyMsg.style.display = "none";

  testState.kind = kind;
  testState.queue = queue;
  testState.index = 0;
  testState.results = { done: 0, learning: 0, none: 0 };

  document.getElementById("test-setup").style.display = "none";
  document.getElementById("test-done").style.display = "none";
  document.getElementById("test-runner").style.display = "block";
  renderTestCard();
}

function renderTestCard() {
  const entry = testState.queue[testState.index];
  document.getElementById("test-progress").textContent = `${testState.index + 1} / ${testState.queue.length}`;
  document.getElementById("test-card-term").textContent = entry.term;

  const answerEl = document.getElementById("test-card-answer");
  answerEl.style.display = "none";
  answerEl.innerHTML = `
    ${entry.meaningKo ? `<p class="entry-meaning-ko">${escapeHtml(entry.meaningKo)}</p>` : ""}
    ${entry.meaning ? `<p class="entry-meaning">${escapeHtml(entry.meaning)}</p>` : ""}
    ${!entry.meaningKo && !entry.meaning ? `<p class="entry-meaning" style="color:var(--muted)">등록된 뜻이 없습니다.</p>` : ""}
    ${entry.example ? `
    <div class="entry-example-block">
      <p class="entry-example">${escapeHtml(entry.example)}</p>
      ${entry.exampleKo ? `<p class="entry-example-ko">${escapeHtml(entry.exampleKo)}</p>` : ""}
    </div>` : ""}
    ${entry.note ? `<p class="test-card-note">메모: ${escapeHtml(entry.note)}</p>` : ""}
  `;

  document.getElementById("test-reveal").style.display = "inline-block";
  document.getElementById("test-rate-row").style.display = "none";
}

function revealTestAnswer() {
  document.getElementById("test-card-answer").style.display = "block";
  document.getElementById("test-reveal").style.display = "none";
  document.getElementById("test-rate-row").style.display = "flex";
}

function rateTestCard(status) {
  const entry = testState.queue[testState.index];
  updateEntry(testState.kind, entry.id, { status });
  testState.results[status] = (testState.results[status] || 0) + 1;

  testState.index++;
  if (testState.index >= testState.queue.length) {
    finishTest();
  } else {
    renderTestCard();
  }
}

function finishTest() {
  document.getElementById("test-runner").style.display = "none";
  document.getElementById("test-done").style.display = "block";
  const r = testState.results;
  document.getElementById("test-done-summary").textContent =
    `이해함 ${r.done || 0} · 학습중 ${r.learning || 0} · 미숙지 ${r.none || 0}`;
  render(testState.kind);
}

function stopTest() {
  document.getElementById("test-runner").style.display = "none";
  document.getElementById("test-setup").style.display = "block";
  render(testState.kind);
}

function setupTest() {
  document.getElementById("test-start")?.addEventListener("click", startTest);
  document.getElementById("test-reveal")?.addEventListener("click", revealTestAnswer);
  document.getElementById("test-stop")?.addEventListener("click", stopTest);
  document.getElementById("test-restart")?.addEventListener("click", () => {
    document.getElementById("test-done").style.display = "none";
    document.getElementById("test-setup").style.display = "block";
  });
  document.querySelectorAll(".test-rate-btn").forEach((btn) => {
    btn.addEventListener("click", () => rateTestCard(btn.dataset.status));
  });
}

function init() {
  setupTabs();
  setupForm("words", "words-form", "words-input");
  setupForm("grammar", "grammar-form", "grammar-input");
  setupCsvButtons("words");
  setupCsvButtons("grammar");
  setupTest();
  render("words");
  render("grammar");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
