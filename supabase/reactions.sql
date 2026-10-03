-- Public-post interactions. Safe to run again; existing posts and comments are preserved.
begin;
create table if not exists public.blog_reactions (
 post_id text not null references public.blog_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 value smallint not null check(value in (-1,1)),
 primary key(post_id,user_id)
);
alter table public.blog_reactions enable row level security;
revoke all on public.blog_reactions from public,anon,authenticated;

create or replace function public.blog_post_interactions(post_ids text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(cardinality(post_ids),0)>100 then raise exception 'Too many posts';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'post_id',p.id,
  'likes',(select count(*) from public.blog_reactions r where r.post_id=p.id and r.value=1),
  'dislikes',(select count(*) from public.blog_reactions r where r.post_id=p.id and r.value=-1),
  'mine',coalesce((select r.value from public.blog_reactions r where r.post_id=p.id and r.user_id=auth.uid()),0),
  'comments',(select count(*) from public.blog_comments c where c.post_id=p.id and not c.deleted)
 )), '[]'::jsonb) into result from public.blog_posts p where p.id=any(post_ids) and p.published;
 return result;
end $$;
revoke all on function public.blog_post_interactions(text[]) from public;
grant execute on function public.blog_post_interactions(text[]) to anon,authenticated;

create or replace function public.blog_react(target text,reaction smallint)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.blog_verified() then raise exception 'Verified sign-in required' using errcode='42501';end if;
 if reaction is null or reaction not in (-1,0,1) then raise exception 'Invalid reaction';end if;
 -- Serializes publication changes with the vote, and rejects drafts even for their owner.
 perform 1 from public.blog_posts where id=target and published for share;
 if not found then raise exception 'Post is not public' using errcode='42501';end if;
 if reaction=0 then
  delete from public.blog_reactions where post_id=target and user_id=auth.uid();
 else
  insert into public.blog_reactions(post_id,user_id,value) values(target,auth.uid(),reaction)
  on conflict(post_id,user_id) do update set value=excluded.value;
 end if;
 return public.blog_post_interactions(array[target])->0;
end $$;
revoke all on function public.blog_react(text,smallint) from public,anon;
grant execute on function public.blog_react(text,smallint) to authenticated;
notify pgrst,'reload schema';
commit;
