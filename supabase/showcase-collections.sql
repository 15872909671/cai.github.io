-- Showcase groups contain references only. Removing a group never deletes posts.
begin;
alter table public.blog_profiles add column if not exists showcase_collections jsonb;
-- NULL means not migrated; an explicit empty array must stay empty on reruns.
update public.blog_profiles set showcase_collections=case when cardinality(featured_posts)>0
 then jsonb_build_array(jsonb_build_object('id','legacy','name','精选帖子','posts',to_jsonb(featured_posts))) else '[]'::jsonb end
where showcase_collections is null;
alter table public.blog_profiles alter column showcase_collections set default '[]', alter column showcase_collections set not null;
create or replace function public.blog_guard_showcase() returns trigger
language plpgsql security definer set search_path='' as $$
declare g jsonb; pid text; ids text[] := '{}';
begin
 if new.showcase_collections is not distinct from old.showcase_collections then return new; end if;
 if jsonb_typeof(new.showcase_collections) <> 'array' or octet_length(new.showcase_collections::text)>64000 then raise exception 'Invalid collections';end if;
 if jsonb_array_length(new.showcase_collections)>20 then raise exception 'At most 20 collections';end if;
 for g in select value from jsonb_array_elements(new.showcase_collections) loop
  if jsonb_typeof(g)<>'object' or jsonb_typeof(g->'id') is distinct from 'string' or length(g->>'id') not between 1 and 80
   or jsonb_typeof(g->'name') is distinct from 'string' or length(trim(g->>'name')) not between 1 and 60
   or jsonb_typeof(g->'posts') is distinct from 'array' then raise exception 'Invalid collection';end if;
  if (g->>'id')=any(ids) then raise exception 'Duplicate collection';end if;
  ids:=array_append(ids,g->>'id');
  if jsonb_array_length(g->'posts')>100 then raise exception 'At most 100 references';end if;
  if exists(select 1 from jsonb_array_elements(g->'posts') x where jsonb_typeof(x)<>'string') then raise exception 'Invalid reference';end if;
  if jsonb_array_length(g->'posts')<>(select count(distinct value) from jsonb_array_elements_text(g->'posts')) then raise exception 'Duplicate reference';end if;
  for pid in select value from jsonb_array_elements_text(g->'posts') loop
   if not exists(select 1 from public.blog_posts p where p.id=pid and p.owner_id=new.user_id and p.published) then raise exception 'Only your public posts can be included';end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.blog_guard_showcase() from public;
drop trigger if exists blog_showcase_guard on public.blog_profiles;
create trigger blog_showcase_guard before update of showcase_collections on public.blog_profiles for each row execute function public.blog_guard_showcase();
grant update(showcase_collections) on public.blog_profiles to authenticated;
notify pgrst,'reload schema';
commit;
