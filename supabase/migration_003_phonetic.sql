-- 발음기호(IPA) 저장용 컬럼 추가.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table toeic_entries
  add column if not exists phonetic text not null default '';
