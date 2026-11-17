create function public.pedidos_de_acesso()
returns table(id uuid, nome text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.e_supervisor() then raise exception 'Acesso reservado à supervisão'; end if;
  return query
    select u.id, coalesce(nullif(trim(u.raw_user_meta_data->>'nome'),''), u.email)::text, u.email::text
    from auth.users u
    where u.email_confirmed_at is not null
      and not exists (select 1 from public.colaboradores c where c.id=u.id)
    order by u.created_at limit 100;
end
$$;

create function public.aprovar_colaborador(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_supervisor() then raise exception 'Acesso reservado à supervisão'; end if;
  insert into public.colaboradores(id,nome,papel)
  select u.id, left(coalesce(nullif(trim(u.raw_user_meta_data->>'nome'),''), u.email),150), 'colaborador'
  from auth.users u
  where u.id=p_id and u.email_confirmed_at is not null
  on conflict (id) do nothing;
end
$$;

revoke all on function public.pedidos_de_acesso(), public.aprovar_colaborador(uuid) from public, anon;
grant execute on function public.pedidos_de_acesso(), public.aprovar_colaborador(uuid) to authenticated;
