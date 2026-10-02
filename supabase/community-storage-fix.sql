-- Run after community.sql. Keep existing images; cap new uploads at 1 MB.
begin;
update storage.buckets set file_size_limit=1048576 where id='blog-images';
create or replace function public.blog_reserve_image(file_bytes bigint) returns text language plpgsql security definer set search_path='' as $$
declare name text;
begin
 if not public.blog_verified() then raise exception 'Verified sign-in required' using errcode='42501';end if;
 if file_bytes is null or file_bytes<1 or file_bytes>1048576 then raise exception 'Image must be at most 1 MB';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 -- Reserve the bucket maximum, never a client-supplied size. Preflight may lack metadata.
 if (select coalesce(sum(bytes),0) from public.blog_media where owner_id=auth.uid())+1048576>10485760 then raise exception 'Image quota exceeded (10 MB)';end if;
 name=auth.uid()::text||'/'||gen_random_uuid()::text||'.webp';
 insert into public.blog_media(path,owner_id,bytes) values(name,auth.uid(),1048576);return name;
end $$;
revoke all on function public.blog_reserve_image(bigint) from public,anon;
grant execute on function public.blog_reserve_image(bigint) to authenticated;
drop policy if exists blog_image_upload on storage.objects;
create policy blog_image_upload on storage.objects for insert to authenticated with check(
 bucket_id='blog-images' and public.blog_verified() and exists(
 select 1 from public.blog_media m where m.path=name and m.owner_id=auth.uid() and m.bytes=1048576));
create or replace function public.blog_settle_images() returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.blog_verified() then raise exception 'Verified sign-in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 -- Only trusted Storage metadata can reduce a reservation, after the object exists.
 update public.blog_media m set bytes=greatest(1,(o.metadata->>'size')::bigint)
 from storage.objects o where o.bucket_id='blog-images' and o.name=m.path and m.owner_id=auth.uid()
 and (o.metadata->>'size') ~ '^[0-9]+$' and (o.metadata->>'size')::bigint<=m.bytes;
end $$;
revoke all on function public.blog_settle_images() from public,anon;
grant execute on function public.blog_settle_images() to authenticated;
notify pgrst,'reload schema';
commit;
