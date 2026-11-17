create or replace function public.sincronizar_semana(p_semana text, p_linhas jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
  if p_semana is null or p_semana !~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'
     or jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'Semana ou lote inválido';
  end if;
  if jsonb_array_length(p_linhas) not between 1 and 20000 or exists (
    select 1 from jsonb_array_elements(p_linhas) as r(dados)
    where (dados->>'semana') is distinct from p_semana
      or coalesce(trim(dados->>'entregador_id'),'') = ''
      or coalesce(trim(dados->>'praca'),'') = ''
      or jsonb_typeof(dados->'colunas') is distinct from 'array'
      or lower(coalesce(dados->'colunas'->>5,'')) not in ('alta','média','media','reativação','reativacao','monitoramento')
  ) then raise exception 'Confira os dados da semana'; end if;

  perform pg_advisory_xact_lock(171146);
  with origem as (
    select lower(trim(dados->>'entregador_id')) as entregador_id, dados
    from jsonb_array_elements(p_linhas) as r(dados)
  )
  insert into public.importacoes_semanais(semana, entregador_id, dados)
  select p_semana, entregador_id, dados from origem
  on conflict (semana, entregador_id) do update
    set dados = excluded.dados, sincronizado_em = now()
    where importacoes_semanais.dados is distinct from excluded.dados;
  get diagnostics total = row_count;

  insert into public.casos(id, entregador_id, semana_entrada, praca, motivo, prioridade)
  select 'RET-' || gen_random_uuid()::text, i.entregador_id, p_semana,
    i.dados->>'praca', coalesce(i.dados->'colunas'->>4,''), i.dados->'colunas'->>5
  from public.importacoes_semanais i
  where i.semana=p_semana and lower(i.dados->'colunas'->>5)<>'monitoramento'
    and not exists (
      select 1 from public.casos c where c.entregador_id=i.entregador_id
        and (c.aberto or c.semana_entrada >= p_semana)
    )
  on conflict do nothing;

  insert into public.evolucao_semanal(caso_id, semana, prioridade, indicadores)
  select c.id, p_semana, i.dados->'colunas'->>5,
    jsonb_build_object('motivo', i.dados->'colunas'->>4, 'horas_online', i.dados->'colunas'->>6,
      'semanas_inativo', i.dados->'colunas'->>8, 'pedidos', i.dados->'colunas'->>10,
      'ofertas', i.dados->'colunas'->>11, 'rejeicao_pct', i.dados->'colunas'->>16)
  from public.importacoes_semanais i
  join lateral (
    select id from public.casos where entregador_id=i.entregador_id and semana_entrada<=p_semana
      and (aberto or semana_entrada=p_semana or exists (
        select 1 from public.evolucao_semanal e where e.caso_id=casos.id and e.semana=p_semana
      ))
    order by semana_entrada desc limit 1
  ) c on true
  where i.semana=p_semana
  on conflict (caso_id, semana) do update
    set prioridade=excluded.prioridade, indicadores=excluded.indicadores;
  return total;
end
$$;
grant select, insert on public.casos to service_role;
grant select, insert, update on public.evolucao_semanal to service_role;
