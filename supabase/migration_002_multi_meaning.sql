-- 단어 하나에 여러 뜻(품사별)이 있을 때 함께 저장하기 위한 컬럼 추가.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table toeic_entries
  add column if not exists meanings jsonb not null default '[]'::jsonb;
