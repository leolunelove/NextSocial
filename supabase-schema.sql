-- Isolated storage for Social Hub. No access to other applications' tables.
create table public.social_hub_review_objects (
  key text primary key check (key = 'capacity' or key ~ '^reviews/[a-f0-9]{64}$'),
  body text not null check (octet_length(body) <= 786432),
  etag text not null
);
alter table public.social_hub_review_objects enable row level security;
revoke all on public.social_hub_review_objects from public, anon, authenticated;
grant select, insert, update, delete on public.social_hub_review_objects to service_role;

-- Atomic compare-and-swap preserves first-response wins and the storage ceiling.
create function public.social_hub_review_put(p_key text, p_body text, p_etag text, p_expected text, p_create boolean)
returns text language plpgsql security invoker set search_path = '' as $$
declare saved text;
begin
  if p_create then
    insert into public.social_hub_review_objects(key, body, etag)
    values (p_key, p_body, p_etag) on conflict (key) do nothing returning etag into saved;
  elsif p_expected is not null then
    update public.social_hub_review_objects set body = p_body, etag = p_etag
    where key = p_key and etag = p_expected returning etag into saved;
  else
    insert into public.social_hub_review_objects(key, body, etag) values (p_key, p_body, p_etag)
    on conflict (key) do update set body = excluded.body, etag = excluded.etag returning etag into saved;
  end if;
  return saved;
end;
$$;
revoke all on function public.social_hub_review_put(text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.social_hub_review_put(text,text,text,text,boolean) to service_role;
