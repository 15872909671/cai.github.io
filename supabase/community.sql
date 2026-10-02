-- Apply after schema.sql, file-operations.sql, registration.sql and images.sql.
-- Additive migration; existing content is assigned to the original sole author.
begin;
alter table public.blog_profiles add column if not exists display_name text not null default '' check(length(display_name)<=30);
alter table public.blog_profiles add column if not exists bio text not null default '' check(length(bio)<=500);
alter table public.blog_profiles add column if not exists website text not null default '' check(website='' or website ~ '^https?://');
alter table public.blog_folders add column if not exists owner_id uuid references auth.users(id);
alter table public.blog_posts add column if not exists owner_id uuid references auth.users(id);
do $$ declare original uuid; begin
 if exists(select 1 from public.blog_posts where owner_id is null) or exists(select 1 from public.blog_folders where owner_id is null) then
  if (select count(*) from public.blog_authors)<>1 then raise exception 'Legacy ownership is ambiguous; assign owner_id before retrying';end if;
  select user_id into original from public.blog_authors;
  update public.blog_folders set owner_id=original where owner_id is null;
  update public.blog_posts set owner_id=original where owner_id is null;
 end if;
end $$;
alter table public.blog_folders alter column owner_id set not null;
alter table public.blog_folders alter column owner_id set default auth.uid();
alter table public.blog_posts alter column owner_id set not null;
alter table public.blog_posts alter column owner_id set default auth.uid();
-- Expand IDs to include collision-free generated addresses.
alter table public.blog_profiles drop constraint if exists blog_profiles_username_check;
alter table public.blog_profiles add constraint blog_profiles_username_check check(username ~ '^[A-Za-z0-9_]{3,36}$');
-- Every confirmed existing account receives an address, even if registration was interrupted.
insert into public.blog_profiles(user_id,username,display_name)
select id,'u_'||replace(id::text,'-',''),left(coalesce(raw_user_meta_data->>'display_name',''),30) from auth.users where email_confirmed_at is not null and not coalesce(is_anonymous,false)
on conflict(user_id) do nothing;
alter table public.blog_folders drop constraint if exists blog_folders_collection_check;
alter table public.blog_folders add constraint blog_folders_collection_check check(collection in ('knowledge','projects','interviews','essays','tools','photos'));
alter table public.blog_posts drop constraint if exists blog_posts_collection_check;
alter table public.blog_posts add constraint blog_posts_collection_check check(collection in ('knowledge','projects','interviews','essays','tools','photos'));
drop index if exists public.blog_folder_siblings;
create unique index blog_folder_siblings on public.blog_folders(owner_id,collection,coalesce(parent_id,''),name);
create unique index if not exists blog_folder_owner_key on public.blog_folders(id,collection,owner_id);
alter table public.blog_folders drop constraint if exists folder_parent_owner;
alter table public.blog_folders add constraint folder_parent_owner foreign key(parent_id,collection,owner_id) references public.blog_folders(id,collection,owner_id);
alter table public.blog_posts drop constraint if exists post_folder_owner;
alter table public.blog_posts add constraint post_folder_owner foreign key(folder_id,collection,owner_id) references public.blog_folders(id,collection,owner_id);
create index if not exists blog_posts_owner_feed on public.blog_posts(owner_id,published,created_at desc,id);
create index if not exists blog_posts_board_feed on public.blog_posts(collection,published,created_at desc,id);
create index if not exists blog_folders_owner on public.blog_folders(owner_id,collection,parent_id);

create or replace function public.blog_verified() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and coalesce(is_anonymous,false)=false);
$$;
revoke all on function public.blog_verified() from public;
grant execute on function public.blog_verified() to anon,authenticated;

create or replace function public.blog_guard_owned() returns trigger language plpgsql security definer set search_path='' as $$
declare total bigint; amount bigint;
begin
 if TG_OP='UPDATE' and new.owner_id<>old.owner_id then raise exception 'Owner cannot be changed';end if;
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
 if TG_TABLE_NAME='blog_posts' then
  select count(*),coalesce(sum(octet_length(body)+octet_length(metadata::text)+octet_length(title)+octet_length(summary)),0)
   into total,amount from public.blog_posts where owner_id=new.owner_id and id<>new.id;
  if total>=100 or amount+octet_length(new.body)+octet_length(new.metadata::text)+octet_length(new.title)+octet_length(new.summary)>2097152 then
   raise exception 'Post quota exceeded (100 posts / 2 MB)';end if;
 else
  if TG_OP='UPDATE' and new.collection<>old.collection then raise exception 'Folder collection cannot be changed';end if;
  select count(*) into total from public.blog_folders where owner_id=new.owner_id and id<>new.id;
  if total>=100 then raise exception 'Folder quota exceeded (100)';end if;
 end if;
 return new;
end $$;
revoke all on function public.blog_guard_owned() from public;
drop trigger if exists blog_owned_post on public.blog_posts;
create trigger blog_owned_post before insert or update on public.blog_posts for each row execute function public.blog_guard_owned();
drop trigger if exists blog_owned_folder on public.blog_folders;
create trigger blog_owned_folder before insert or update on public.blog_folders for each row execute function public.blog_guard_owned();

drop policy if exists author_read on public.blog_posts;
drop policy if exists author_insert on public.blog_posts;
drop policy if exists author_update on public.blog_posts;
drop policy if exists owner_read on public.blog_posts;
drop policy if exists owner_insert on public.blog_posts;
drop policy if exists owner_update on public.blog_posts;
create policy owner_read on public.blog_posts for select to authenticated using(owner_id=auth.uid());
create policy owner_insert on public.blog_posts for insert to authenticated with check(owner_id=auth.uid() and public.blog_verified());
create policy owner_update on public.blog_posts for update to authenticated using(owner_id=auth.uid() and public.blog_verified()) with check(owner_id=auth.uid() and public.blog_verified());
drop policy if exists author_create_folder on public.blog_folders;
drop policy if exists owner_create_folder on public.blog_folders;
create policy owner_create_folder on public.blog_folders for insert to authenticated with check(owner_id=auth.uid() and public.blog_verified());

create or replace function public.blog_folder_visible(target text) returns boolean language sql stable security definer set search_path='' as $$
 with recursive descendants as (
  select id,owner_id from public.blog_folders where id=target
  union select f.id,f.owner_id from public.blog_folders f join descendants d on f.parent_id=d.id
 ) select exists(select 1 from descendants where owner_id=auth.uid())
 or exists(select 1 from public.blog_posts p join descendants d on p.folder_id=d.id where p.published);
$$;
revoke all on function public.blog_folder_visible(text) from public;
grant execute on function public.blog_folder_visible(text) to anon,authenticated;
drop policy if exists read_folders on public.blog_folders;
create policy read_folders on public.blog_folders for select to anon,authenticated using(public.blog_folder_visible(id));

create or replace function public.blog_file_operation(action text,target_id text,expected_version integer,new_name text default null,new_parent text default null)
returns void language plpgsql security definer set search_path='' as $$
declare f public.blog_folders; ancestor text;
begin
 if not public.blog_verified() then raise exception 'Verified sign-in required' using errcode='42501';end if;
 if action='delete_post' then
  delete from public.blog_posts where id=target_id and version=expected_version and owner_id=auth.uid();
  if not found then raise exception 'Post changed or permission denied';end if;return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into f from public.blog_folders where id=target_id and owner_id=auth.uid() for update;
 if not found or f.version<>expected_version then raise exception 'Folder changed or permission denied';end if;
 if action='rename_folder' then update public.blog_folders set name=trim(new_name),version=version+1 where id=target_id;
 elsif action='move_folder' then
  if new_parent is not null and not exists(select 1 from public.blog_folders where id=new_parent and owner_id=f.owner_id and collection=f.collection) then raise exception 'Invalid destination';end if;
  ancestor=new_parent;
  while ancestor is not null loop
   if ancestor=target_id then raise exception 'Cannot move folder into descendant';end if;
   select parent_id into ancestor from public.blog_folders where id=ancestor;
  end loop;
  update public.blog_folders set parent_id=new_parent,version=version+1 where id=target_id;
 elsif action='delete_folder' then delete from public.blog_folders where id=target_id;
 else raise exception 'Unsupported action';end if;
end $$;
revoke all on function public.blog_file_operation(text,text,integer,text,text) from public,anon;
grant execute on function public.blog_file_operation(text,text,integer,text,text) to authenticated;

grant update(display_name,bio,website) on public.blog_profiles to authenticated;
drop policy if exists own_profile_update on public.blog_profiles;
create policy own_profile_update on public.blog_profiles for update to authenticated using(user_id=auth.uid() and public.blog_verified()) with check(user_id=auth.uid() and public.blog_verified());
create or replace function public.blog_claim_username(public_name text) returns text language plpgsql security definer set search_path='' as $$
declare existing text;
begin
 if not public.blog_verified() then raise exception 'Verify email first' using errcode='42501';end if;
 select username into existing from public.blog_profiles where user_id=auth.uid();if found then return existing;end if;
 if trim(public_name)!~'^[A-Za-z0-9_]{3,24}$' then raise exception 'Invalid public ID';end if;
 insert into public.blog_profiles(user_id,username,display_name)
 select id,trim(public_name),left(coalesce(raw_user_meta_data->>'display_name',''),30) from auth.users where id=auth.uid()
 on conflict(user_id) do nothing;
 select username into existing from public.blog_profiles where user_id=auth.uid();return existing;
end $$;

create table if not exists public.blog_comments (
 id uuid primary key default gen_random_uuid(),author_id uuid not null default auth.uid() references auth.users(id),
 post_id text references public.blog_posts(id) on delete cascade,
 space_id uuid references public.blog_profiles(user_id) on delete cascade,
 parent_id uuid references public.blog_comments(id),
 body text not null check(length(trim(body)) between 1 and 3000),
 deleted boolean not null default false,created_at timestamptz not null default now(),
 check(post_id is null or space_id is null)
);
create index if not exists blog_comments_post on public.blog_comments(post_id,created_at,id);
create index if not exists blog_comments_space on public.blog_comments(space_id,created_at,id);
create index if not exists blog_comments_author on public.blog_comments(author_id,created_at);
alter table public.blog_comments enable row level security;
revoke all on public.blog_comments from anon,authenticated;
grant select,insert on public.blog_comments to authenticated;
grant select on public.blog_comments to anon;
drop policy if exists comment_read on public.blog_comments;
create policy comment_read on public.blog_comments for select to anon,authenticated using(post_id is null or exists(select 1 from public.blog_posts where id=post_id and published));
drop policy if exists comment_create on public.blog_comments;
create policy comment_create on public.blog_comments for insert to authenticated with check(author_id=auth.uid() and public.blog_verified() and exists(select 1 from public.blog_profiles where user_id=auth.uid()) and not deleted and (post_id is null or exists(select 1 from public.blog_posts where id=post_id and published)));
create or replace function public.blog_guard_comment() returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.blog_comments;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.author_id::text,1));
 if exists(select 1 from public.blog_comments where author_id=new.author_id and created_at>now()-interval '5 seconds') then raise exception 'Please wait 5 seconds between comments';end if;
 if (select count(*) from public.blog_comments where author_id=new.author_id and created_at>now()-interval '1 day')>=100 then raise exception 'Daily comment limit reached';end if;
 if (select count(*) from public.blog_comments where author_id=new.author_id)>=1000 then raise exception 'Comment quota exceeded (1000)';end if;
 new.created_at=now();new.deleted=false;
 if new.parent_id is not null then
  select * into parent from public.blog_comments where id=new.parent_id;
  if not found or parent.deleted or parent.post_id is distinct from new.post_id or parent.space_id is distinct from new.space_id then raise exception 'Invalid reply target';end if;
 end if;
 return new;
end $$;
revoke all on function public.blog_guard_comment() from public;
drop trigger if exists blog_comment_guard on public.blog_comments;
create trigger blog_comment_guard before insert on public.blog_comments for each row execute function public.blog_guard_comment();
create or replace function public.blog_delete_comment(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.blog_verified() then raise exception 'Verified sign-in required' using errcode='42501';end if;
 update public.blog_comments c set body='此评论已删除',deleted=true where c.id=target and (
  c.author_id=auth.uid() or c.space_id=auth.uid() or exists(select 1 from public.blog_posts where id=c.post_id and owner_id=auth.uid())
  or (c.post_id is null and c.space_id is null and exists(select 1 from public.blog_authors where user_id=auth.uid())));
 if not found then raise exception 'Comment not found or permission denied' using errcode='42501';end if;
end $$;
revoke all on function public.blog_delete_comment(uuid) from public,anon;
grant execute on function public.blog_delete_comment(uuid) to authenticated;

-- Postgres applies RLS to these invoker functions. No body in feed responses.
create or replace function public.blog_feed(who uuid default null,board text default null,folder text default null,search text default '',drafts boolean default false,page_number integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as (
 select p.id,p.owner_id,p.collection,p.folder_id,p.title,p.summary,p.metadata,p.published,p.version,p.created_at,p.updated_at,
  u.username,u.display_name from public.blog_posts p left join public.blog_profiles u on u.user_id=p.owner_id
 where (who is null or p.owner_id=who) and (board is null or p.collection=board) and (folder is null or p.folder_id=folder)
 and (case when drafts then p.owner_id=auth.uid() and not p.published else p.published end)
 and (coalesce(search,'')='' or position(lower(left(search,120)) in lower(p.title||' '||p.summary||' '||p.body))>0)
 ), paged as (select * from filtered order by created_at desc,id limit 20 offset (greatest(1,least(coalesce(page_number,1),10000))-1)*20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from filtered));
$$;
revoke all on function public.blog_feed(uuid,text,text,text,boolean,integer) from public;
grant execute on function public.blog_feed(uuid,text,text,text,boolean,integer) to anon,authenticated;

create table if not exists public.blog_media (
 path text primary key,owner_id uuid not null references auth.users(id),bytes bigint not null check(bytes between 1 and 5242880),
 created_at timestamptz not null default now()
);
-- Import existing uploads conservatively, without rewriting their URLs.
insert into public.blog_media(path,owner_id,bytes)
select o.name,p.owner_id,greatest(1,least(coalesce((o.metadata->>'size')::bigint,5242880),5242880))
from storage.objects o join public.blog_posts p on p.id=split_part(o.name,'/',1) where o.bucket_id='blog-images'
on conflict(path) do nothing;
alter table public.blog_media enable row level security;
revoke all on public.blog_media from anon,authenticated;
grant select on public.blog_media to authenticated;
drop policy if exists media_owner on public.blog_media;
create policy media_owner on public.blog_media for select to authenticated using(owner_id=auth.uid());
create or replace function public.blog_reserve_image(file_bytes bigint) returns text language plpgsql security definer set search_path='' as $$
declare name text;
begin
 if not public.blog_verified() then raise exception 'Verified sign-in required' using errcode='42501';end if;
 if file_bytes<1 or file_bytes>1048576 then raise exception 'Image must be at most 1 MB';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 if (select coalesce(sum(bytes),0) from public.blog_media where owner_id=auth.uid())+file_bytes>10485760 then raise exception 'Image quota exceeded (10 MB)';end if;
 name=auth.uid()::text||'/'||gen_random_uuid()::text||'.webp';
 insert into public.blog_media(path,owner_id,bytes) values(name,auth.uid(),file_bytes);return name;
end $$;
revoke all on function public.blog_reserve_image(bigint) from public,anon;
grant execute on function public.blog_reserve_image(bigint) to authenticated;
create or replace function public.blog_image_used(target text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.blog_posts where position('(media:'||target||')' in body)>0);
$$;
revoke all on function public.blog_image_used(text) from public;
grant execute on function public.blog_image_used(text) to authenticated;
create or replace function public.blog_release_image(target text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.blog_verified() then raise exception 'Verified sign-in required' using errcode='42501';end if;
 if exists(select 1 from storage.objects where bucket_id='blog-images' and name=target) or public.blog_image_used(target) then raise exception 'Image is still stored or referenced';end if;
 delete from public.blog_media where path=target and owner_id=auth.uid();
end $$;
revoke all on function public.blog_release_image(text) from public,anon;
grant execute on function public.blog_release_image(text) to authenticated;
drop policy if exists blog_image_upload on storage.objects;
drop policy if exists blog_image_read on storage.objects;
drop policy if exists blog_image_author_read on storage.objects;
drop policy if exists blog_image_remove on storage.objects;
create policy blog_image_upload on storage.objects for insert to authenticated with check(bucket_id='blog-images' and public.blog_verified() and exists(select 1 from public.blog_media m where m.path=name and m.owner_id=auth.uid() and (metadata->>'size')::bigint<=m.bytes));
create policy blog_image_author_read on storage.objects for select to authenticated using(bucket_id='blog-images' and exists(select 1 from public.blog_media m where m.path=name and m.owner_id=auth.uid()));
create or replace function public.blog_image_public(target text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.blog_posts p join public.blog_media m on m.owner_id=p.owner_id where m.path=target and p.published and position('(media:'||target||')' in p.body)>0);
$$;
revoke all on function public.blog_image_public(text) from public;
grant execute on function public.blog_image_public(text) to anon,authenticated;
create policy blog_image_read on storage.objects for select to anon,authenticated using(bucket_id='blog-images' and public.blog_image_public(name));
create policy blog_image_remove on storage.objects for delete to authenticated using(bucket_id='blog-images' and public.blog_verified() and exists(select 1 from public.blog_media m where m.path=name and m.owner_id=auth.uid()) and not public.blog_image_used(name));

create or replace function public.blog_usage() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('posts',(select count(*) from public.blog_posts where owner_id=auth.uid()),
 'textBytes',(select coalesce(sum(octet_length(body)+octet_length(metadata::text)+octet_length(title)+octet_length(summary)),0) from public.blog_posts where owner_id=auth.uid()),
 'imageBytes',(select coalesce(sum(bytes),0) from public.blog_media where owner_id=auth.uid()),
 'postLimit',100,'textLimit',2097152,'imageLimit',10485760);
$$;
revoke all on function public.blog_usage() from public,anon;
grant execute on function public.blog_usage() to authenticated;
notify pgrst,'reload schema';
commit;
