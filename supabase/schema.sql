-- TOEIC 준비: 단어/문법 저장용 테이블.
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행하세요.
-- (obmipvrmbxohcxhnpgmp 프로젝트 재사용, guestbook과 동일하게 로그인 없이 공개 접근)

create table if not exists toeic_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('words', 'grammar')),
  term text not null,
  meaning_ko text not null default '',
  meaning text not null default '',
  example text not null default '',
  example_ko text not null default '',
  status text not null default 'none' check (status in ('none', 'learning', 'done')),
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table toeic_entries enable row level security;

-- 방명록과 동일하게 로그인 없이 누구나 읽기/쓰기 가능 (anon 키로 접근).
create policy "public can read toeic_entries"
  on toeic_entries for select
  using (true);

create policy "public can insert toeic_entries"
  on toeic_entries for insert
  with check (true);

create policy "public can update toeic_entries"
  on toeic_entries for update
  using (true);

create policy "public can delete toeic_entries"
  on toeic_entries for delete
  using (true);
