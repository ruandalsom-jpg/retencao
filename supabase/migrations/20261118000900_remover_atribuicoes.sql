begin;
create table public.remocoes_atribuicao (
  id bigint generated always as identity primary key,
  caso_id text not null references public.casos(id),
  responsavel_anterior_id uuid not null references public.colaboradores(id),
  supervisor_id uuid not null references public.colaboradores(id),
  removido_em timestamptz not null default now()
);
alter table public.remocoes_atribuicao enable row level security;
revoke all on public.remocoes_atribuicao from public, anon, authenticated;
grant select on public.remocoes_atribuicao to authenticated;
create policy supervisor_le_remocoes on public.remocoes_atribuicao for select to authenticated
  using ((select public.e_supervisor()));

create function public.remover_atribuicoes(p_casos jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if not public.e_supervisor() then raise exception 'Operação reservada a supervisores'; end if;
  if jsonb_typeof(p_casos) is distinct from 'array' then raise exception 'Seleção inválida'; end if;
  if jsonb_array_length(p_casos) not between 1 and 50 then raise exception 'Selecione de 1 a 50 casos'; end if;

  perform 1 from public.casos
    where id in (select item->>'id' from jsonb_array_elements(p_casos) item)
    order by id for update;

  with removidos as (
    update public.casos c set responsavel_id=null, atribuido_em=null, visto_em=null
    from jsonb_array_elements(p_casos) item
    where c.id=item->>'id' and c.aberto and c.responsavel_id=(item->>'responsavel_id')::uuid
    returning c.id, (item->>'responsavel_id')::uuid as anterior
  )
  insert into public.remocoes_atribuicao(caso_id,responsavel_anterior_id,supervisor_id)
    select id,anterior,auth.uid() from removidos;
  get diagnostics total = row_count;
  if total <> jsonb_array_length(p_casos) then
    raise exception 'A seleção mudou. Atualize a fila e revise os responsáveis.';
  end if;
  return total;
end $$;
revoke all on function public.remover_atribuicoes(jsonb) from public, anon;
grant execute on function public.remover_atribuicoes(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
