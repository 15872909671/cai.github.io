begin;
create table if not exists public.blog_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null check(username ~ '^[A-Za-z0-9_]{3,24}$'),
 created_at timestamptz not null default now()
);
create unique index if not exists blog_profiles_username on public.blog_profiles(lower(username));
alter table public.blog_profiles enable row level security;
revoke all on public.blog_profiles from anon,authenticated;
grant select on public.blog_profiles to anon,authenticated;
drop policy if exists public_names on public.blog_profiles;
create policy public_names on public.blog_profiles for select using(true);
-- Only a boolean is exposed; never return emails or auth.users records.
create or replace function public.blog_registration_status(email_address text, public_name text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'registered',exists(select 1 from auth.users where lower(email)=lower(trim(email_address)) and email_confirmed_at is not null),
 'nameTaken',exists(select 1 from public.blog_profiles where lower(username)=lower(trim(public_name)))
 );
$$;
revoke all on function public.blog_registration_status(text,text) from public;
grant execute on function public.blog_registration_status(text,text) to anon,authenticated;
create or replace function public.blog_claim_username(public_name text)
returns text language plpgsql security definer set search_path='' as $$
declare existing text;
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Verify email first' using errcode='42501';
 end if;
 select username into existing from public.blog_profiles where user_id=auth.uid();
 if found then return existing;end if;
 insert into public.blog_profiles(user_id,username) values(auth.uid(),trim(public_name))
 on conflict(user_id) do nothing;
 select username into existing from public.blog_profiles where user_id=auth.uid();
 return existing;
end;$$;
revoke all on function public.blog_claim_username(text) from public,anon;
grant execute on function public.blog_claim_username(text) to authenticated;
commit;
