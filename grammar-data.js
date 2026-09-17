// TOEIC Part 5/6에 자주 나오는 문법 포인트 모음.
// keywords에 있는 표현(한글/영문 모두)과 입력값이 일치하거나 포함 관계면 매칭된다.
const TOEIC_GRAMMAR = [
  {
    keywords: ["조동사 + 동사원형", "조동사", "modal verb", "can will must"],
    explanation:
      "조동사(can, will, must, should, may, might 등) 뒤에는 반드시 동사원형이 옵니다. 주어가 3인칭 단수여도 동사에 -s를 붙이지 않습니다.",
    example: "She must submit the report by Friday.",
  },
  {
    keywords: ["수동태", "be + p.p.", "passive voice", "능동태 수동태"],
    explanation:
      "수동태는 'be동사 + 과거분사(p.p.)' 형태이며, 동작을 받는 대상이 주어일 때 씁니다. 목적어가 없는 자동사는 수동태로 쓸 수 없습니다.",
    example: "The report was submitted by the manager yesterday.",
  },
  {
    keywords: ["시제 일치", "현재완료", "과거완료", "present perfect", "tense agreement"],
    explanation:
      "현재완료(have/has + p.p.)는 과거에 시작돼 현재까지 이어지는 일, 과거완료(had + p.p.)는 특정 과거 시점보다 더 이전에 일어난 일을 나타냅니다. yesterday, ago처럼 명확한 과거 시점 부사와는 함께 쓰지 않습니다.",
    example: "By the time the client arrived, the team had already finished the presentation.",
  },
  {
    keywords: ["가정법", "if절", "conditional", "가정법 과거"],
    explanation:
      "가정법 과거(If + 주어 + 과거동사, 주어 + would/could + 동사원형)는 현재 사실과 반대되는 상황을, 가정법 과거완료(If + had p.p., would have p.p.)는 과거 사실과 반대되는 상황을 나타냅니다.",
    example: "If the budget were approved, we would launch the campaign next month.",
  },
  {
    keywords: ["관계대명사", "who which that whose", "relative pronoun"],
    explanation:
      "관계대명사는 앞의 명사(선행사)를 뒤에서 수식하는 절을 이끕니다. 선행사가 사람이면 who/whom/whose, 사물이면 which, 사람·사물 모두 that을 쓸 수 있습니다.",
    example: "The employee who won the award works in the marketing department.",
  },
  {
    keywords: ["관계부사", "where when why how", "relative adverb"],
    explanation:
      "관계부사(where, when, why, how)는 '전치사 + 관계대명사'를 대신하며, 뒤에는 완전한 문장(주어+동사+목적어 등)이 옵니다.",
    example: "This is the building where the conference will be held.",
  },
  {
    keywords: ["접속사 전치사 구별", "although despite", "because because of", "conjunction preposition"],
    explanation:
      "접속사(although, because, while) 뒤에는 '주어 + 동사'가 있는 절이, 전치사(despite, because of, during) 뒤에는 명사(구)가 옵니다.",
    example: "Despite the heavy rain, the outdoor event proceeded as scheduled.",
  },
  {
    keywords: ["부정사와 동명사", "to부정사 동명사", "to부정사", "동명사", "infinitive gerund"],
    explanation:
      "동사에 따라 목적어로 to부정사만(want, decide, plan), 동명사만(enjoy, avoid, consider), 또는 둘 다 취하는 경우가 다릅니다. 전치사 뒤에는 반드시 동명사가 옵니다.",
    example: "The company plans to expand its operations overseas.",
  },
  {
    keywords: ["분사구문", "현재분사 과거분사", "-ing -ed", "participle"],
    explanation:
      "명사를 수식하는 분사는 능동·진행의 의미면 현재분사(-ing), 수동·완료의 의미면 과거분사(-ed/p.p.)를 씁니다. 감정을 유발하면 -ing, 감정을 느끼면 -ed를 씁니다.",
    example: "Employees attending the seminar should register in advance.",
  },
  {
    keywords: ["비교급 최상급", "comparative superlative", "more than", "the most"],
    explanation:
      "비교급은 'more/-er + than'으로 둘을 비교하고, 최상급은 'the most/-est'로 셋 이상 중 하나를 나타냅니다. 최상급 앞에는 보통 the를 붙입니다.",
    example: "This model is more efficient than the previous version.",
  },
  {
    keywords: ["상관접속사", "both and either or neither nor", "not only but also", "correlative conjunction"],
    explanation:
      "상관접속사는 짝을 이루어 쓰이며 두 요소는 문법적으로 같은 형태(병렬)여야 합니다: both A and B, either A or B, neither A nor B, not only A but also B.",
    example: "The proposal was not only cost-effective but also easy to implement.",
  },
  {
    keywords: ["명사절 접속사", "that whether if", "noun clause"],
    explanation:
      "명사절 접속사(that, whether, if)는 문장 전체를 명사처럼 만들어 주어, 목적어, 보어 자리에 넣을 수 있게 합니다. that절은 주로 확실한 사실, whether/if절은 불확실한 사실에 씁니다.",
    example: "We are not sure whether the meeting will be rescheduled.",
  },
  {
    keywords: ["부사 자리", "adverb placement", "부사"],
    explanation:
      "부사는 동사를 수식할 때 보통 동사 앞/뒤, be동사나 조동사 뒤에 위치하며, 문장 전체를 수식할 때는 문두에도 올 수 있습니다. 명사는 수식할 수 없습니다.",
    example: "The team carefully reviewed the contract before signing it.",
  },
  {
    keywords: ["형용사 자리", "adjective placement", "형용사"],
    explanation:
      "형용사는 명사 앞에서 직접 수식하거나, be/become/seem 같은 연결동사 뒤에서 주어를 보충 설명합니다. 부사와 달리 동사를 수식하지 않습니다.",
    example: "The new policy seems reasonable to most employees.",
  },
  {
    keywords: ["도치", "inversion", "부정어 도치", "only not only never"],
    explanation:
      "부정어(Not only, Never, Rarely 등)나 Only가 이끄는 부사구가 문두에 오면 주어와 동사(또는 조동사)의 순서가 바뀝니다.",
    example: "Not only did sales increase, but customer satisfaction also improved.",
  },
  {
    keywords: ["수량 표현", "many much few little", "a number of the number of", "quantifier"],
    explanation:
      "many/few는 셀 수 있는 명사, much/little은 셀 수 없는 명사와 함께 씁니다. 'a number of + 복수명사'는 '많은 ~'(복수 취급), 'the number of + 복수명사'는 '~의 수'(단수 취급)라는 뜻입니다.",
    example: "A number of employees have requested flexible working hours.",
  },
  {
    keywords: ["재귀대명사", "reflexive pronoun", "myself yourself himself"],
    explanation:
      "재귀대명사(myself, yourself, himself 등)는 주어와 목적어가 같을 때, 또는 '직접, 스스로'라는 의미를 강조할 때 씁니다.",
    example: "The manager reviewed the proposal himself before the meeting.",
  },
  {
    keywords: ["to부정사의 용법", "to부정사 용법", "infinitive usage"],
    explanation:
      "to부정사는 문장에서 명사(주어/목적어/보어), 형용사(명사 수식), 부사(목적/이유 등) 역할을 할 수 있습니다.",
    example: "To meet the deadline, the team worked through the weekend.",
  },
  {
    keywords: ["유사관계대명사", "as but than", "quasi relative pronoun"],
    explanation:
      "as, but, than은 특정 조건에서 관계대명사처럼 쓰입니다. such/the same와 함께 쓰이면 as, 부정문 뒤에는 but, 비교급 뒤에는 than이 관계대명사 역할을 합니다.",
    example: "We need the same equipment as was used last year.",
  },
  {
    keywords: ["병렬구조", "parallelism", "parallel structure"],
    explanation:
      "and, or, but로 연결되는 요소들은 문법적으로 같은 형태(명사-명사, 동사-동사, to부정사-to부정사 등)여야 합니다.",
    example: "The workshop covers planning, budgeting, and reporting.",
  },
  {
    keywords: ["관사", "a an the", "article"],
    explanation:
      "부정관사 a/an은 처음 언급되는 셀 수 있는 명사 단수형 앞에, 정관사 the는 이미 언급됐거나 특정하게 정해진 명사 앞에 씁니다.",
    example: "The company announced a new product last week; the product will launch in June.",
  },
  {
    keywords: ["접속부사", "however therefore moreover", "conjunctive adverb", "transition word"],
    explanation:
      "however(그러나), therefore(그러므로), moreover(게다가) 같은 접속부사는 문장과 문장을 의미상 연결하며, 보통 문두에 오고 뒤에 콤마를 씁니다. Part 6 빈칸 문제에 자주 출제됩니다.",
    example: "The flight was delayed; therefore, the meeting was rescheduled.",
  },
  {
    keywords: ["원급 비교", "as as", "as ~ as"],
    explanation:
      "'as + 형용사/부사 원급 + as'는 두 대상이 같은 정도임을 나타냅니다. 부정형은 'not as/so ~ as'입니다.",
    example: "This year's revenue is as high as last year's.",
  },
  {
    keywords: ["사역동사 지각동사", "make have let", "causative verb"],
    explanation:
      "사역동사(make, have, let)와 지각동사(see, hear, feel)는 목적어 뒤에 동사원형을 씁니다(목적어가 능동으로 행동할 때). 목적어가 수동적으로 당하는 경우엔 과거분사를 씁니다.",
    example: "The supervisor had the team submit the report early.",
  },
  {
    keywords: ["능동태 수동태 구별", "능동 수동"],
    explanation:
      "빈칸 뒤에 목적어가 있으면 능동태, 목적어가 없으면 수동태일 가능성이 높습니다. 타동사인지 자동사인지도 함께 확인해야 합니다.",
    example: "The new guidelines were distributed to all staff members.",
  },
];
