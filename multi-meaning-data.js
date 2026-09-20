// 같은 품사 안에 서로 완전히 다른 뜻이 있는 단어들 (예: complimentary = "무료의" 또는
// "칭찬하는"). Datamuse의 정의 개수만으로는 이런 진짜 다의어와, 뜻은 하나인데 기술적/문법적
// 정의만 여러 개인 단어(예: competent, negotiate)를 구분할 수 없어서 자동 판별 대신 직접
// 정리해 둔다. 여기 없는 단어는 기존 사전/번역 API 로직을 그대로 쓴다.
const TOEIC_MULTI_MEANINGS = [
  {
    term: "complimentary",
    meanings: [
      { pos: "adjective", en: "Free; provided at no charge.", ko: "무료의, 공짜의" },
      { pos: "adjective", en: "Expressing a compliment; praising.", ko: "칭찬하는, 찬사의" },
    ],
  },
  {
    term: "present",
    meanings: [
      { pos: "adjective", en: "Being in a specified place, or in attendance.", ko: "참석한, 출석한" },
      { pos: "noun", en: "A gift.", ko: "선물" },
      { pos: "verb", en: "To give or show something formally.", ko: "제시하다, 발표하다" },
    ],
  },
  {
    term: "object",
    meanings: [
      { pos: "noun", en: "A physical thing that can be seen or touched.", ko: "물건, 사물" },
      { pos: "verb", en: "To disagree with or oppose something.", ko: "반대하다, 이의를 제기하다" },
    ],
  },
  {
    term: "content",
    meanings: [
      { pos: "noun", en: "The material or information contained in something (a document, book, etc.).", ko: "내용, 콘텐츠" },
      { pos: "adjective", en: "Satisfied with one's situation; not wanting more.", ko: "만족하는" },
    ],
  },
  {
    term: "record",
    meanings: [
      { pos: "noun", en: "Information kept in written or other permanent form.", ko: "기록" },
      { pos: "verb", en: "To set down in writing or store information for later use.", ko: "기록하다, 녹음하다" },
    ],
  },
  {
    term: "conduct",
    meanings: [
      { pos: "noun", en: "A person's behavior.", ko: "행동, 품행" },
      { pos: "verb", en: "To organize and carry out (a task, activity, etc.).", ko: "수행하다, 실시하다" },
    ],
  },
  {
    term: "permit",
    meanings: [
      { pos: "noun", en: "An official document giving someone authorization to do something.", ko: "허가증" },
      { pos: "verb", en: "To allow something to happen.", ko: "허용하다" },
    ],
  },
  {
    term: "refuse",
    meanings: [
      { pos: "verb", en: "To indicate unwillingness to do something.", ko: "거절하다, 거부하다" },
      { pos: "noun", en: "Waste material; trash.", ko: "쓰레기, 폐기물" },
    ],
  },
];
