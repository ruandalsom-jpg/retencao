create function public.e_supervisor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.colaboradores where id = auth.uid() and papel = 'supervisor')
$$;
revoke all on function public.e_supervisor() from public, anon;
grant execute on function public.e_supervisor() to authenticated;

create policy supervisor_le_equipe on public.colaboradores for select to authenticated
  using ((select public.e_supervisor()));

revoke insert, update, delete on public.colaboradores, public.casos, public.evolucao_semanal,
  public.contatos, public.atribuicoes from anon, authenticated;
grant select on public.colaboradores, public.casos, public.evolucao_semanal,
  public.contatos, public.atribuicoes to authenticated;

create function public.atribuir_lote(p_ids text[], p_responsavel uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if not public.e_supervisor() then raise exception 'Atribuição reservada a supervisores'; end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50 or not exists (
    select 1 from public.colaboradores where id = p_responsavel and papel = 'colaborador'
  ) then raise exception 'Selecione de 1 a 50 casos e um colaborador'; end if;

  with alterados as (
    update public.casos set responsavel_id = p_responsavel
    where id = any(p_ids) and aberto and responsavel_id is distinct from p_responsavel
    returning id
  )
  insert into public.atribuicoes(caso_id, supervisor_id, responsavel_id)
  select id, auth.uid(), p_responsavel from alterados;
  get diagnostics total = row_count;
  if total <> cardinality(p_ids) then raise exception 'O lote mudou ou contém casos fechados. Atualize a carteira'; end if;
  return total;
end
$$;

create function public.mover_caso(p_id text, p_etapa text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_etapa is null or p_etapa not in ('novo','em_contato','aguardando') then
    raise exception 'Registre um contato para encerrar o caso';
  end if;
  update public.casos set etapa = p_etapa
  where id = p_id and aberto and (responsavel_id = auth.uid() or public.e_supervisor());
  if not found then raise exception 'Caso indisponível'; end if;
end
$$;

create function public.registrar_contato(p_id text, p_canal text, p_resultado text,
    p_observacao text, p_acao text, p_data date, p_etapa text)
returns void language plpgsql security definer set search_path = '' as $$
declare novo_retorno date;
begin
  if p_acao is null or p_acao not in ('manter','agendar','concluir')
    or p_etapa is null or p_etapa not in ('em_contato','aguardando','recuperado','encerrado')
    or p_canal is null or p_canal not in ('WhatsApp','Ligação','Outro')
    or nullif(trim(p_resultado),'') is null or length(p_resultado)>100
    or length(coalesce(p_observacao,''))>3000
    or (p_acao='agendar' and (p_data is null or p_data < (now() at time zone 'America/Sao_Paulo')::date))
  then raise exception 'Confira os dados do atendimento'; end if;

  update public.casos set
    etapa = p_etapa, aberto = p_etapa in ('em_contato','aguardando'),
    proximo_contato = case when p_etapa in ('recuperado','encerrado') or p_acao = 'concluir' then null
      when p_acao = 'agendar' then p_data else proximo_contato end
  where id = p_id and aberto and (responsavel_id = auth.uid() or public.e_supervisor())
  returning proximo_contato into novo_retorno;
  if not found then raise exception 'Caso indisponível'; end if;

  insert into public.contatos(caso_id, autor_id, resultado, observacao, canal, retorno)
  values (p_id, auth.uid(), p_resultado, p_observacao, p_canal, novo_retorno);
end
$$;

revoke all on function public.atribuir_lote(text[], uuid), public.mover_caso(text, text),
  public.registrar_contato(text, text, text, text, text, date, text) from public, anon;
grant execute on function public.atribuir_lote(text[], uuid), public.mover_caso(text, text),
  public.registrar_contato(text, text, text, text, text, date, text) to authenticated;
