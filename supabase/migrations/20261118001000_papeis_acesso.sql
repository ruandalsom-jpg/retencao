begin;

create function public.alterar_papel_colaborador(p_id uuid, p_papel text, p_papel_atual text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_supervisor() then
    raise exception 'Alteração reservada a supervisores';
  end if;
  if p_id is null or p_id = auth.uid() then
    raise exception 'Seu próprio papel deve ser alterado por outro supervisor';
  end if;
  if p_papel is null or p_papel not in ('colaborador','supervisor') then
    raise exception 'Papel inválido';
  end if;

  -- Serialize role changes and recheck authorization after waiting for the lock.
  perform pg_advisory_xact_lock(421704);
  if not public.e_supervisor() then
    raise exception 'Sua permissão de supervisão foi alterada';
  end if;
  update public.colaboradores set papel=p_papel
    where id=p_id and papel=p_papel_atual and papel<>p_papel;
  if not found then
    raise exception 'O papel mudou. Atualize a lista e revise a alteração.';
  end if;
end $$;

revoke all on function public.alterar_papel_colaborador(uuid,text,text) from public,anon;
grant execute on function public.alterar_papel_colaborador(uuid,text,text) to authenticated;
notify pgrst,'reload schema';

commit;
