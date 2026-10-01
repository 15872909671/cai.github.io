-- Run once in the project's SQL Editor. This script creates only blog-specific objects.
begin;
create table if not exists public.blog_authors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.blog_authors enable row level security;
revoke all on public.blog_authors from anon, authenticated;
grant select on public.blog_authors to authenticated;
drop policy if exists own_author_membership on public.blog_authors;
create policy own_author_membership on public.blog_authors for select to authenticated using(user_id=(select auth.uid()));

create table if not exists public.blog_folders (
  id text primary key check(length(id) between 1 and 160),
  collection text not null check(collection in ('knowledge','projects','interviews','essays')),
  name text not null check(length(trim(name)) between 1 and 100),
  parent_id text,
  unique(id,collection),
  foreign key(parent_id,collection) references public.blog_folders(id,collection),
  check(parent_id is distinct from id)
);
create unique index if not exists blog_folder_siblings on public.blog_folders(collection,coalesce(parent_id,''),name);
alter table public.blog_folders enable row level security;
revoke all on public.blog_folders from anon, authenticated;
grant select on public.blog_folders to anon, authenticated;
grant insert on public.blog_folders to authenticated;
drop policy if exists read_folders on public.blog_folders;
create policy read_folders on public.blog_folders for select to anon, authenticated using(true);
drop policy if exists author_create_folder on public.blog_folders;
create policy author_create_folder on public.blog_folders for insert to authenticated with check(exists(select 1 from public.blog_authors where user_id=(select auth.uid())));
-- No folder move/delete API: prevents cycles and accidental cascading deletion.

create table if not exists public.blog_posts (
  id text primary key check(length(id) between 1 and 160),
  collection text not null check(collection in ('knowledge','projects','interviews','essays')),
  folder_id text,
  title text not null check(length(trim(title)) between 1 and 200),
  summary text not null default '' check(length(summary)<=500),
  body text not null default '' check(length(body)<=200000),
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=100000),
  published boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(folder_id,collection) references public.blog_folders(id,collection)
);
create index if not exists blog_posts_folder on public.blog_posts(folder_id);
create index if not exists blog_posts_public on public.blog_posts(published);
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant insert,update on public.blog_posts to authenticated;
drop policy if exists read_published on public.blog_posts;
create policy read_published on public.blog_posts for select to anon, authenticated using(published);
drop policy if exists author_read on public.blog_posts;
create policy author_read on public.blog_posts for select to authenticated using(exists(select 1 from public.blog_authors where user_id=(select auth.uid())));
drop policy if exists author_insert on public.blog_posts;
create policy author_insert on public.blog_posts for insert to authenticated with check(exists(select 1 from public.blog_authors where user_id=(select auth.uid())));
drop policy if exists author_update on public.blog_posts;
create policy author_update on public.blog_posts for update to authenticated using(exists(select 1 from public.blog_authors where user_id=(select auth.uid()))) with check(exists(select 1 from public.blog_authors where user_id=(select auth.uid())));

create or replace function public.blog_version() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    new.version=old.version+1;
    new.created_at=old.created_at;
    if new.id<>old.id then raise exception 'Post ID cannot be changed'; end if;
  else new.version=1;
  end if;
  new.updated_at=now();return new;
end;
$$;
revoke all on function public.blog_version() from public;
drop trigger if exists blog_version on public.blog_posts;
create trigger blog_version before insert or update on public.blog_posts for each row execute function public.blog_version();
commit;
