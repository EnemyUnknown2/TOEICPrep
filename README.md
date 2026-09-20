# TOEIC 준비

TOEIC 시험 대비용 단어/숙어/문법 정리 및 이해도 진행 상황 확인 페이지.

## 실행 방법

`D:\Claude Data\.claude\serve.ps1` 을 실행해 로컬 서버를 띄운 뒤, 브라우저에서
`http://127.0.0.1:8080/Dashboard0/toeic-prep/index.html` 로 접속하세요.

또는 `index.html` 파일을 브라우저로 직접 열어도 됩니다.

## 기능

- **단어 및 숙어** / **문법** 두 카테고리로 항목 등록
- **단어 및 숙어**: 추가 시 자동으로 뜻을 검색해 저장 (찾지 못하면 직접 메모에 입력)
  - 영어 정의 + 품사: [Datamuse API](https://www.datamuse.com/api/)
  - 한국어 뜻: [MyMemory Translation API](https://mymemory.translated.net/) — 품사를 알면 ("to be eligible", "to negotiate"처럼) 품사에 맞는 짧은 문형으로 다시 물어봐서 더 정확한 번역을 시도합니다. (예: "eligible" 단독 번역은 명사형 "자격"이 나오지만, 품사를 반영하면 "자격을 갖추다"로 정확해짐)
  - **여러 뜻 (품사가 다른 경우)**: 단어에 서로 다른 품사의 뜻이 여러 개 있으면(예: eligible = 형용사/명사, garner = 동사/명사) TOEIC 수준에서 헷갈리지 않게 최대 2개까지 품사 배지와 함께 나란히 보여줍니다. 사람 이름/지명 뜻이 섞여 있거나 번역이 실패해 다른 뜻과 겹치는 경우는 제외합니다.
  - **여러 뜻 (품사가 같은 진짜 다의어)**: "complimentary"(무료의/칭찬하는)처럼 같은 품사 안에 뜻이 여러 개인 단어는 [multi-meaning-data.js](multi-meaning-data.js)에 직접 정리해서 정확한 품사별 뜻을 보여줍니다. Datamuse의 정의 개수만으로는 이런 진짜 다의어와 "competent"·"negotiate"처럼 뜻은 하나인데 기술적/문법적 정의만 여러 개인 단어를 구분할 수 없어서, 자동 판별 대신 아는 단어를 하나씩 추가하는 방식을 택했습니다.
  - 예문: MyMemory 응답에 포함된 실제 번역 메모리(사람이 번역한 문장 쌍)에서 품질이 좋은 것을 발견하면 영어 예문 + 한국어 번역을 함께 표시합니다. 못 찾으면 생략됩니다.
  - **숙어/구동사**: "manage to", "in charge of"처럼 Datamuse에 정의가 없거나 번역 API가 단어 그대로 직역해서 실패하는 표현은 [idioms-data.js](idioms-data.js)에 내장된 TOEIC 빈출 숙어 목록에서 먼저 찾습니다. 목록에 없으면 기존 사전/번역 API로 넘어갑니다.
- **문법**: [grammar-data.js](grammar-data.js)에 내장된 TOEIC Part 5/6 빈출 문법 포인트(조동사, 수동태, 가정법, 관계대명사 등 약 25개)에서 키워드 매칭으로 한국어 설명과 예문을 가져옵니다. 외부 API 호출 없이 즉시 동작하며, 목록에 없는 패턴은 영어 단일 용어(gerund 등)로 간주해 Datamuse API로 보조 검색합니다.
- 항목별 이해도 상태(미숙지/학습중/이해함) 표시 및 메모 작성
- **자가 테스트**: 단어 또는 문법 중 하나를 골라 카드 형태로 한 개씩 보여줍니다. 단어(또는 패턴)만 보고 뜻을 떠올려본 뒤 "정답 보기"로 확인하고, 스스로 "모르겠음/애매함/알고 있음"으로 평가하면 그 결과가 바로 이해도 상태에 반영됩니다. 기본적으로 "이해함" 항목은 제외하고 미숙지·학습중 항목만 순서를 섞어서 테스트합니다.
- **진행 상황** 탭에서 카테고리별 등록 개수와 이해도 비율 확인
- 데이터는 [Supabase](https://supabase.com/)(`toeic_entries` 테이블)에 저장되어, 로그인 없이 같은 URL로 접속하면 어느 기기/브라우저에서든 같은 데이터를 보고 수정할 수 있습니다. CSV 내보내기/불러오기도 계속 지원합니다.

## 문법 데이터 추가/수정하기

[grammar-data.js](grammar-data.js)의 `TOEIC_GRAMMAR` 배열에 항목을 추가하면 됩니다. `keywords`에는 사용자가 입력할 만한 한글/영문 표현을 여러 개 넣어두면 매칭률이 올라갑니다.

```js
{
  keywords: ["패턴 이름", "관련 표현", "related english term"],
  explanation: "TOEIC 수준의 간략한 한국어 설명",
  example: "An example sentence.",
}
```

## 숙어/다의어 데이터 추가/수정하기

- [idioms-data.js](idioms-data.js)의 `TOEIC_IDIOMS` 배열에 `{ keywords: [...], ko, en, example, exampleKo }` 형태로 추가합니다. `keywords`는 사용자가 입력할 표현들이고, 입력값이 keyword 전체를 포함할 때만 매칭됩니다(반대로 keyword가 입력값을 포함하는 건 매칭 안 함 — 예를 들어 "eligible"만 입력했는데 "be eligible for" 숙어가 잘못 걸리지 않도록).
- [multi-meaning-data.js](multi-meaning-data.js)의 `TOEIC_MULTI_MEANINGS` 배열에 `{ term, meanings: [{ pos, en, ko }, ...] }` 형태로 추가합니다. `term`은 정확히 일치해야 매칭됩니다(부분 일치 없음).

## Supabase 설정

기환스 사이트 방명록과 같은 Supabase 프로젝트(`obmipvrmbxohcxhnpgmp`)를 재사용합니다. 새로 이 프로젝트를 세팅하는 경우:

1. Supabase 대시보드 > SQL Editor에서 [supabase/schema.sql](supabase/schema.sql)을 실행해 `toeic_entries` 테이블과 RLS 정책을 만듭니다.
2. 이어서 [supabase/migration_002_multi_meaning.sql](supabase/migration_002_multi_meaning.sql)을 실행해 여러 뜻 저장용 `meanings` 컬럼을 추가합니다.
3. `script.js`의 `SUPABASE_URL` / `SUPABASE_ANON_KEY`를 프로젝트에 맞게 수정합니다.

**로그인 없이 공개 테이블**이라, URL과 anon key를 아는 사람은 누구나 데이터를 읽고 쓸 수 있습니다 (방명록과 동일한 트레이드오프이며, 의도적으로 선택한 방식입니다). 개인정보 보호가 중요해지면 Supabase Auth로 로그인을 추가하고 RLS를 `auth.uid()` 기준으로 좁히는 방향으로 전환할 수 있습니다.

브라우저에 예전 localStorage 데이터가 남아있으면, 앱이 처음 로드될 때 자동으로 한 번만 Supabase로 옮깁니다 (`toeic_migrated_to_supabase` 플래그로 중복 방지).

## 알려진 제한 사항

- 문법 설명은 미리 등록된 데이터셋 기준이라, 목록에 없는 패턴을 입력하면 못 찾을 수 있습니다 (직접 입력 필요). `grammar-data.js`에 계속 추가해 나가면 됩니다.
- MyMemory는 기계 번역 기반이라 뜻이 부정확하거나 문맥에 안 맞을 수 있습니다. `idioms-data.js`/`multi-meaning-data.js`에 없는 숙어나 다의어는 여전히 직역되어 나올 수 있어 직접 확인이 필요합니다.
- MyMemory 무료 사용량은 익명 기준 일일 약 5,000단어로 제한되어 있어, 사용량이 많으면 한국어 뜻이 비어 있을 수 있습니다. (단어 하나당 품사 보정 번역까지 최대 2회 호출)
- Datamuse, MyMemory 모두 API 요청은 5초 후 자동으로 포기하고 넘어갑니다 (외부 API가 느리거나 응답이 없어도 화면이 멈추지 않도록).
- Datamuse도 영어 사전 기반이라 숙어나 전문 문법 용어는 검색이 안 될 수 있습니다.
- 예문은 MyMemory 번역 메모리에 마침 좋은 문장이 있을 때만 나옵니다. 항상 나오는 건 아닙니다.
- 로그인이 없어 여러 탭/기기에서 동시에 편집하면 마지막에 저장한 내용이 이길 수 있습니다 (실시간 동기화 아님, 새로고침해야 최신 데이터가 보임).
- GitHub Pages는 정적 파일을 최대 10분(`max-age=600`) 브라우저 캐시하므로, 배포 직후에는 새로고침(또는 강력 새로고침 Ctrl+Shift+R)해도 잠시 이전 버전이 보일 수 있습니다. `index.html`의 `script.js?v=N` 쿼리 값을 배포할 때마다 올리면 캐시를 즉시 무효화할 수 있습니다.
- 실제 TOEIC 기출문제는 ETS 저작권 때문에 재현하거나 비슷하게 생성해 제공하지 않습니다. 대신 등록한 단어/문법으로 직접 복습할 수 있는 카드형 자가 테스트를 제공합니다.
