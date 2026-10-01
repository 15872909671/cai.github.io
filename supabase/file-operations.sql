-- Additional file-tree operations. Existing data and login accounts are preserved.
begin;
alter table public.blog_folders add column if not exists version integer not null default 1;
create or replace function public.blog_file_operation(action text, target_id text, expected_version integer, new_name text default null, new_parent text default null)
returns void language plpgsql security definer set search_path='' as $$
declare f public.blog_folders; ancestor text;
begin
  if not exists(select 1 from public.blog_authors where user_id=auth.uid()) then
    raise exception 'Author permission required' using errcode='42501';
  end if;
  if action='delete_post' then
    delete from public.blog_posts where id=target_id and version=expected_version;
    if not found then raise exception 'Content changed; reload first'; end if;
    return;
  end if;
  lock table public.blog_folders in share row exclusive mode;
  select * into f from public.blog_folders where id=target_id for update;
  if not found or f.version<>expected_version then raise exception 'Folder changed; reload first'; end if;
  if action='rename_folder' then
    update public.blog_folders set name=trim(new_name),version=version+1 where id=target_id;
  elsif action='move_folder' then
    ancestor=new_parent;
    while ancestor is not null loop
      if ancestor=target_id then raise exception 'Cannot move folder into itself or its descendants'; end if;
      select parent_id into ancestor from public.blog_folders where id=ancestor;
    end loop;
    update public.blog_folders set parent_id=new_parent,version=version+1 where id=target_id;
  elsif action='delete_folder' then
    -- Foreign keys deliberately reject deleting any nonempty folder.
    delete from public.blog_folders where id=target_id;
  else raise exception 'Unsupported action';
  end if;
end;
$$;
revoke all on function public.blog_file_operation(text,text,integer,text,text) from public,anon;
grant execute on function public.blog_file_operation(text,text,integer,text,text) to authenticated;
commit;
