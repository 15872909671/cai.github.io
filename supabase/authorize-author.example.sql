-- Replace the email after creating a confirmed user in Authentication > Users.
insert into public.blog_authors(user_id)
select id from auth.users where lower(email)=lower('YOUR_AUTHOR_EMAIL') and email_confirmed_at is not null
on conflict do nothing;
-- Must return exactly the intended account.
select u.id,u.email from public.blog_authors a join auth.users u on u.id=a.user_id;
