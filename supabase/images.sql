-- Private images: authors can upload; readers can access only images referenced
-- in the current published body. Unsaved edits to a published post stay private.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('blog-images','blog-images',false,5242880,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists blog_image_upload on storage.objects;
create policy blog_image_upload on storage.objects for insert to authenticated
with check(bucket_id='blog-images' and exists(select 1 from public.blog_authors where user_id=auth.uid()));
drop policy if exists blog_image_read on storage.objects;
create policy blog_image_read on storage.objects for select to anon,authenticated
using(bucket_id='blog-images' and (
  exists(select 1 from public.blog_posts p where p.published
    and position('(media:'||name||')' in p.body)>0)
));
drop policy if exists blog_image_author_read on storage.objects;
create policy blog_image_author_read on storage.objects for select to authenticated
using(bucket_id='blog-images' and exists(select 1 from public.blog_authors where user_id=auth.uid()));
commit;
