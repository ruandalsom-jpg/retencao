begin;

alter table public.lotes_distribuicao
  add column removido_do_historico_em timestamptz,
  add column removido_do_historico_por uuid references public.colaboradores(id);

create function public.remover_lote_do_historico(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.e_supervisor() then
    raise exception 'Ação reservada a supervisores';
  end if;

  update public.lotes_distribuicao
    set removido_do_historico_em=now(), removido_do_historico_por=auth.uid()
    where id=p_id and removido_do_historico_em is null;
end $$;

revoke all on function public.remover_lote_do_historico(uuid) from public,anon;
grant execute on function public.remover_lote_do_historico(uuid) to authenticated;
notify pgrst,'reload schema';

commit;
