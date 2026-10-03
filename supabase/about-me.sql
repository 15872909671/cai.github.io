-- Add curated public blog links to each author's profile. Safe to run again.
begin;
alter table public.blog_profiles add column if not exists featured_posts text[] not null default '{}';
create or replace function public.blog_guard_featured_posts() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if cardinality(new.featured_posts)>12 then raise exception 'Select at most 12 posts';end if;
 if new.featured_posts is distinct from old.featured_posts then
  if exists(select 1 from unnest(new.featured_posts) as selected(id)
   where id is null or not exists(select 1 from public.blog_posts p where p.id=selected.id and p.owner_id=new.user_id and p.published))
  then raise exception 'Only your public posts can be featured';end if;
  if cardinality(new.featured_posts)<>(select count(distinct id) from unnest(new.featured_posts) as selected(id))
  then raise exception 'Duplicate featured post';end if;
 end if;
 return new;
end $$;
revoke all on function public.blog_guard_featured_posts() from public;
drop trigger if exists blog_featured_posts_guard on public.blog_profiles;
create trigger blog_featured_posts_guard before update of featured_posts on public.blog_profiles
for each row execute function public.blog_guard_featured_posts();
grant update(featured_posts) on public.blog_profiles to authenticated;
notify pgrst,'reload schema';
commit;
