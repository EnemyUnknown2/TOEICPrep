const STATUS = {
  none: { label: "미숙지", color: "var(--status-none)" },
  learning: { label: "학습중", color: "var(--status-learning)" },
  done: { label: "이해함", color: "var(--status-done)" },
};

// 기환스 사이트 방명록과 같은 Supabase 프로젝트를 재사용한다 (로그인 없이 공개 테이블).
const SUPABASE_URL = "https://obmipvrmbxohcxhnpgmp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ibWlwdnJtYnhvaGN4aG5wZ21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MjQxNjcsImV4cCI6MjEwNTIwMDE2N30.tHAKwlSbgMH37_G81U5Q_gE29OL20nILPT8Aoea9lAI";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LEGACY_STORE_KEYS = { words: "toeic_words", grammar: "toeic_grammar" };
const MIGRATION_DONE_KEY = "toeic_migrated_to_supabase";

// DB(snake_case) <-> 화면에서 쓰는 JS 객체(camelCase) 변환
function dbRowToEntry(row) {
  return {
    id: row.id,
    term: row.term,
    meaningKo: row.meaning_ko || "",
    meaning: row.meaning || "",
    meanings: Array.isArray(row.meanings) ? row.meanings : [],
    example: row.example || "",
    exampleKo: row.example_ko || "",
    status: row.status || "none",
    note: row.note || "",
    addedAt: (row.created_at || "").slice(0, 10),
  };
}

function entryToDbRow(kind, entry) {
  return {
    kind,
    term: entry.term,
    meaning_ko: entry.meaningKo || "",
    meaning: entry.meaning || "",
    meanings: entry.meanings || [],
    example: entry.example || "",
    example_ko: entry.exampleKo || "",
    status: entry.status || "none",
    note: entry.note || "",
  };
}

const state = { words: [], grammar: [] };

function loadLegacyLocalEntries(kind) {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_STORE_KEYS[kind])) || [];
  } catch {
    return [];
  }
}

// 이 브라우저에 예전 localStorage 데이터가 남아있으면(마이그레이션 전) Supabase로 한 번만 올린다.
async function migrateLegacyDataIfNeeded() {
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  const legacyWords = loadLegacyLocalEntries("words");
  const legacyGrammar = loadLegacyLocalEntries("grammar");
  const rows = [
    ...legacyWords.map((e) => entryToDbRow("words", e)),
    ...legacyGrammar.map((e) => entryToDbRow("grammar", e)),
  ];

  if (rows.length > 0) {
    const { error } = await sb.from("toeic_entries").insert(rows);
    if (error) throw error;
  }
  localStorage.setItem(MIGRATION_DONE_KEY, "true");
}

async function loadAllEntries() {
  await migrateLegacyDataIfNeeded();
  const { data, error } = await sb
    .from("toeic_entries")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;

  state.words = (data || []).filter((r) => r.kind === "words").map(dbRowToEntry);
  state.grammar = (data || []).filter((r) => r.kind === "grammar").map(dbRowToEntry);
}

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

// 이 단어에 사람 성씨/지명 뜻도 있으면(garner=Garner 성씨, 예: "A surname.", "A town in...")
// "to garner"처럼 문형으로 바꿔 물어봤을 때 번역기가 사람 이름으로 오해하기 쉽다
// (garner -> "가너에게"). 이런 단어는 품사 보정 없이 원래 단어 그대로 번역하는 게 더 안전하다.
const PROPER_NOUN_SENSE = /^(a |an )?(surname|given name|place( name)?|town|city|village|county|country|unincorporated community)\b/i;

function splitDef(d) {
  const tabIndex = d.indexOf("\t");
  const posCode = tabIndex === -1 ? "" : d.slice(0, tabIndex);
  const text = (tabIndex === -1 ? d : d.slice(tabIndex + 1)).trim();
  return { posCode, text };
}

function hasProperNounSense(defs) {
  return (defs || []).some((d) => PROPER_NOUN_SENSE.test(splitDef(d).text));
}

// 단어 하나에 품사가 여러 개 있으면(예: garner=동사/명사) TOEIC 수준에 맞게 최대 2개까지만
// 서로 다른 품사의 뜻을 뽑는다. 사람 이름/지명 뜻(surname 등)은 TOEIC 단어장에 필요 없으니 제외.
const MAX_SENSES = 2;

function extractSenses(defs) {
  const seen = new Set();
  const senses = [];
  for (const d of defs || []) {
    const { posCode, text } = splitDef(d);
    if (PROPER_NOUN_SENSE.test(text)) continue;
    const posLabel = POS_LABELS[posCode] || posCode;
    if (!posLabel || seen.has(posLabel)) continue;
    seen.add(posLabel);
    senses.push({ pos: posLabel, en: text });
    if (senses.length >= MAX_SENSES) break;
  }
  return senses;
}

// Datamuse API: 무료, API 키 불필요, 정의와 품사 태그를 함께 제공 (dictionaryapi.dev보다 응답이 안정적)
async function fetchEnglishDefinition(term) {
  try {
    const res = await fetchWithTimeout(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=d&max=1`,
      API_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    const defs = data?.[0]?.defs;
    if (!defs || defs.length === 0) return null;
    const senses = extractSenses(defs);
    const first = senses[0];
    if (!first) return null;
    return {
      partOfSpeech: first.pos,
      isAmbiguousProperNoun: hasProperNounSense(defs),
      senses,
      meaning: `(${first.pos}) ${first.en}`,
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

  // "to garner" -> "가너에게", "to apple" -> "사과로"처럼, 동사 문형("to X")은 그 단어가 진짜
  // 동사로 잘 안 쓰이면 번역기가 사람 이름/명사+조사로 오해해서 실패하는 경우가 있다. 정상적으로
  // 동사를 옮긴 한국어는 거의 항상 "~다"로 끝나므로(예: 협상하다, 준수하다), 그렇지 않으면 실패로
  // 보고 원래 단어(bare) 번역으로 대체한다.
  const isUsableVerbKo = verbKo.text && verbKo.text.endsWith("다");

  const koForPos = (pos) => {
    if (dict?.isAmbiguousProperNoun) return bareKo.text;
    if (pos === "adjective" && adjKo.text) return adjKo.text;
    if (pos === "verb" && isUsableVerbKo) return verbKo.text;
    return bareKo.text;
  };

  const primaryKo = dict?.isAmbiguousProperNoun ? bareKo
    : dict?.partOfSpeech === "adjective" && adjKo.text ? adjKo
    : dict?.partOfSpeech === "verb" && isUsableVerbKo ? verbKo
    : bareKo;
  const picked = {
    text: koForPos(dict?.partOfSpeech),
    example: primaryKo.example || bareKo.example,
    exampleKo: primaryKo.exampleKo || bareKo.exampleKo,
  };

  // 품사가 여러 개면(예: garner=동사/명사) TOEIC 수준에서 헷갈리지 않게 각 품사별 뜻을 따로 보여준다.
  // 번역이 실패해 다른 품사와 같은 뜻으로 겹치면(예: apple의 동사 뜻이 명사와 같아짐) 정보가
  // 없는 것과 같으니 제외한다.
  const seenKo = new Set();
  const meanings =
    !dict?.isAmbiguousProperNoun && dict?.senses?.length > 1
      ? dict.senses
          .map((s) => ({ pos: s.pos, en: s.en, ko: koForPos(s.pos) }))
          .filter((m) => {
            if (seenKo.has(m.ko)) return false;
            seenKo.add(m.ko);
            return true;
          })
      : [];

  if (!dict && !picked.text) return null;
  return {
    meaningKo: picked.text,
    meaning: dict?.meaning || "",
    meanings,
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
  const info = kind === "grammar" ? await fetchGrammarInfo(term) : await fetchDefinition(term);
  const draft = {
    term,
    meaningKo: info?.meaningKo || "",
    meaning: info?.meaning || "",
    meanings: info?.meanings || [],
    example: info?.example || "",
    exampleKo: info?.exampleKo || "",
    status: "none",
    note: "",
  };

  const { data, error } = await sb
    .from("toeic_entries")
    .insert(entryToDbRow(kind, draft))
    .select()
    .single();

  if (error) {
    alert("저장에 실패했습니다: " + error.message);
    return;
  }

  state[kind].push(dbRowToEntry(data));
  render(kind);
}

// ---------- 목록 렌더링 ----------
let dataLoaded = false;

function render(kind) {
  const listEl = document.getElementById(`${kind}-list`);
  if (!listEl) return;
  const entries = state[kind];
  listEl.innerHTML = "";

  if (entries.length === 0) {
    listEl.innerHTML = `<li class="empty-msg">${dataLoaded ? "아직 등록된 항목이 없습니다." : "불러오는 중..."}</li>`;
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
            <button class="refetch-btn" data-id="${entry.id}" title="뜻 다시 검색">⟳</button>
            <button class="delete-btn" data-id="${entry.id}" title="삭제">✕</button>
          </div>
        </div>
        ${renderMeanings(entry)}
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
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      state[kind] = state[kind].filter((e) => e.id !== id);
      render(kind);
      const { error } = await sb.from("toeic_entries").delete().eq("id", id);
      if (error) alert("삭제에 실패했습니다: " + error.message);
    });
  });

  listEl.querySelectorAll(".refetch-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const entry = state[kind].find((e) => e.id === btn.dataset.id);
      if (!entry) return;
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "…";
      try {
        const info = kind === "grammar" ? await fetchGrammarInfo(entry.term) : await fetchDefinition(entry.term);
        updateEntry(kind, entry.id, {
          meaningKo: info?.meaningKo || "",
          meaning: info?.meaning || "",
          meanings: info?.meanings || [],
          example: info?.example || "",
          exampleKo: info?.exampleKo || "",
        });
      } finally {
        render(kind);
      }
    });
  });

  listEl.querySelectorAll(".entry-note").forEach((ta) => {
    ta.addEventListener("change", () => {
      updateEntry(kind, ta.dataset.id, { note: ta.value });
    });
  });
}

const PATCH_KEY_TO_DB = {
  meaningKo: "meaning_ko",
  meaning: "meaning",
  meanings: "meanings",
  example: "example",
  exampleKo: "example_ko",
  status: "status",
  note: "note",
};

function updateEntry(kind, id, patch) {
  const entries = state[kind];
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  Object.assign(entry, patch);

  const dbPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (PATCH_KEY_TO_DB[key]) dbPatch[PATCH_KEY_TO_DB[key]] = value;
  }
  // 화면은 로컬 상태로 바로 반영하고, 저장은 백그라운드에서 처리한다 (호출부를 async로 바꾸지 않아도 되도록).
  sb
    .from("toeic_entries")
    .update(dbPatch)
    .eq("id", id)
    .then(({ error }) => {
      if (error) alert("저장에 실패했습니다: " + error.message);
    });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

const POS_KO_LABELS = { noun: "명사", verb: "동사", adjective: "형용사", adverb: "부사" };

// 품사가 여러 개인 단어는 각각 따로, 하나뿐이면 기존처럼 한 줄로 보여준다.
function renderMeanings(entry) {
  if (entry.meanings && entry.meanings.length > 1) {
    return `
      <div class="entry-senses">
        ${entry.meanings
          .map(
            (m) => `
          <p class="entry-sense">
            <span class="entry-sense-pos">${escapeHtml(POS_KO_LABELS[m.pos] || m.pos)}</span>
            ${m.ko ? `<span class="entry-meaning-ko">${escapeHtml(m.ko)}</span>` : ""}
            ${m.en ? `<span class="entry-meaning">${escapeHtml(m.en)}</span>` : ""}
          </p>`
          )
          .join("")}
      </div>`;
  }
  if (!entry.meaningKo && !entry.meaning) {
    return `<p class="entry-meaning" style="color:var(--muted)">뜻을 찾지 못했습니다. 메모에 직접 입력해 주세요.</p>`;
  }
  return `
    ${entry.meaningKo ? `<p class="entry-meaning-ko">${escapeHtml(entry.meaningKo)}</p>` : ""}
    ${entry.meaning ? `<p class="entry-meaning">${escapeHtml(entry.meaning)}</p>` : ""}
  `;
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
const CSV_HEADER = ["term", "meaningKo", "meaning", "meanings", "example", "exampleKo", "status", "note", "addedAt"];

function toCsv(entries) {
  const rows = entries.map((e) =>
    CSV_HEADER.map((h) => csvEscape(h === "meanings" ? JSON.stringify(e.meanings || []) : e[h])).join(",")
  );
  return [CSV_HEADER.join(","), ...rows].join("\n");
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
    if (!STATUS[obj.status]) obj.status = "none";
    try {
      obj.meanings = obj.meanings ? JSON.parse(obj.meanings) : [];
    } catch {
      obj.meanings = [];
    }
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
    reader.onload = async () => {
      const imported = parseCsv(reader.result);
      if (imported.length === 0) return;
      const rows = imported.map((e) => entryToDbRow(kind, e));
      const { data, error } = await sb.from("toeic_entries").insert(rows).select();
      if (error) {
        alert("CSV 불러오기에 실패했습니다: " + error.message);
        return;
      }
      state[kind] = state[kind].concat((data || []).map(dbRowToEntry));
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
    ${renderMeanings(entry)}
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

async function loadAndRender() {
  const errorEl = document.getElementById("load-error");
  try {
    await loadAllEntries();
    dataLoaded = true;
    if (errorEl) errorEl.style.display = "none";
  } catch (err) {
    if (errorEl) errorEl.style.display = "block";
    console.error(err);
    return;
  }
  render("words");
  render("grammar");
}

function init() {
  setupTabs();
  setupForm("words", "words-form", "words-input");
  setupForm("grammar", "grammar-form", "grammar-input");
  setupCsvButtons("words");
  setupCsvButtons("grammar");
  setupTest();
  document.getElementById("load-retry")?.addEventListener("click", loadAndRender);
  render("words");
  render("grammar");
  loadAndRender();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
