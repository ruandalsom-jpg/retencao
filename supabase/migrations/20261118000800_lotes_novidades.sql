begin;

alter table public.casos add column ultima_semana text;
alter table public.casos add column prioridade_atual text;
alter table public.casos add column atribuido_em timestamptz;
alter table public.casos add column visto_em timestamptz;
update public.casos c set ultima_semana=coalesce(e.semana,c.semana_entrada),
  prioridade_atual=coalesce(e.prioridade,c.prioridade)
from (select distinct on (caso_id) caso_id, semana, prioridade
  from public.evolucao_semanal order by caso_id, semana desc) e where e.caso_id=c.id;
update public.casos set ultima_semana=semana_entrada, prioridade_atual=prioridade where ultima_semana is null;
-- Existing assignments are not presented as new notifications.
update public.casos c set atribuido_em=a.criado_em, visto_em=now()
from (select caso_id,max(criado_em) criado_em from public.atribuicoes group by caso_id) a
where a.caso_id=c.id and c.responsavel_id is not null;

create table public.lotes_distribuicao (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) between 1 and 120),
  supervisor_id uuid not null references public.colaboradores(id),
  responsavel_id uuid not null references public.colaboradores(id),
  quantidade integer not null check (quantidade between 1 and 50),
  criado_em timestamptz not null default now()
);
create table public.lote_itens (
  lote_id uuid not null references public.lotes_distribuicao(id),
  caso_id text not null references public.casos(id),
  anterior_id uuid references public.colaboradores(id),
  semana_entrada text not null,
  ultima_semana text not null,
  prioridade text not null,
  primary key(lote_id,caso_id)
);
create table public.novidades (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.colaboradores(id),
  tipo text not null check(tipo in ('lote','semana')),
  lote_id uuid references public.lotes_distribuicao(id),
  semana text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  lida_em timestamptz,
  unique(destinatario_id,lote_id),
  unique(destinatario_id,semana),
  check ((tipo='lote' and lote_id is not null and semana is null) or
         (tipo='semana' and semana is not null and lote_id is null))
);
create table public.novidade_itens (
  novidade_id uuid not null references public.novidades(id),
  caso_id text not null references public.casos(id),
  primary key(novidade_id,caso_id)
);
create index novidades_destinatario on public.novidades(destinatario_id,atualizado_em desc);
create index lotes_criados on public.lotes_distribuicao(criado_em desc);
create index lote_itens_caso on public.lote_itens(caso_id);
create index casos_distribuicao on public.casos(aberto,prioridade_atual,ultima_semana,responsavel_id);

alter table public.lotes_distribuicao enable row level security;
alter table public.lote_itens enable row level security;
alter table public.novidades enable row level security;
alter table public.novidade_itens enable row level security;
create policy ler_lotes on public.lotes_distribuicao for select to authenticated
  using (responsavel_id=(select auth.uid()) or (select public.e_supervisor()));
create policy ler_lote_itens on public.lote_itens for select to authenticated
  using (exists(select 1 from public.lotes_distribuicao l where l.id=lote_id));
create policy ler_novidades on public.novidades for select to authenticated
  using (destinatario_id=(select auth.uid()));
create policy ler_novidade_itens on public.novidade_itens for select to authenticated
  using (exists(select 1 from public.novidades n where n.id=novidade_id));
revoke all on public.lotes_distribuicao,public.lote_itens,public.novidades,public.novidade_itens from anon,authenticated;
grant select on public.lotes_distribuicao,public.lote_itens,public.novidades,public.novidade_itens to authenticated;

-- The expected owner is checked while holding row locks. A transfer must be explicit.
create function public.distribuir_lote(p_casos jsonb,p_responsavel uuid,p_titulo text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_lote uuid; v_aviso uuid; v_total integer; v_caso record; v_item jsonb;
begin
  if not public.e_supervisor() then raise exception 'Atribuição reservada a supervisores'; end if;
  if jsonb_typeof(p_casos) is distinct from 'array' then raise exception 'Seleção inválida'; end if;
  v_total=jsonb_array_length(p_casos);
  if v_total not between 1 and 50 or nullif(trim(p_titulo),'') is null or length(trim(p_titulo))>120
    or not exists(select 1 from public.colaboradores where id=p_responsavel and papel='colaborador')
    or (select count(distinct x->>'id') from jsonb_array_elements(p_casos) x)<>v_total
  then raise exception 'Selecione até 50 casos, um título e um colaborador'; end if;
  -- Stable ordering prevents deadlocks between overlapping batches.
  perform 1 from public.casos where id in (select x->>'id' from jsonb_array_elements(p_casos) x) order by id for update;
  for v_item in select value from jsonb_array_elements(p_casos) loop
    select * into v_caso from public.casos where id=v_item->>'id';
    if not found or not v_caso.aberto or v_caso.responsavel_id=p_responsavel
      or not (v_item ? 'responsavel_id')
      or v_caso.responsavel_id is distinct from (v_item->>'responsavel_id')::uuid
    then raise exception 'Um caso mudou de responsável ou foi encerrado. Atualize a seleção e revise novamente.'; end if;
  end loop;
  insert into public.lotes_distribuicao(titulo,supervisor_id,responsavel_id,quantidade)
    values(trim(p_titulo),auth.uid(),p_responsavel,v_total) returning id into v_lote;
  insert into public.lote_itens(lote_id,caso_id,anterior_id,semana_entrada,ultima_semana,prioridade)
    select v_lote,id,responsavel_id,semana_entrada,coalesce(ultima_semana,semana_entrada),coalesce(prioridade_atual,prioridade)
    from public.casos where id in(select x->>'id' from jsonb_array_elements(p_casos) x);
  update public.casos set responsavel_id=p_responsavel,atribuido_em=now(),visto_em=null
    where id in(select caso_id from public.lote_itens where lote_id=v_lote);
  insert into public.atribuicoes(caso_id,supervisor_id,responsavel_id)
    select caso_id,auth.uid(),p_responsavel from public.lote_itens where lote_id=v_lote;
  insert into public.novidades(destinatario_id,tipo,lote_id) values(p_responsavel,'lote',v_lote) returning id into v_aviso;
  insert into public.novidade_itens select v_aviso,caso_id from public.lote_itens where lote_id=v_lote;
  return v_lote;
end $$;

create function public.marcar_novidade_lida(p_id uuid,p_versao timestamptz)
returns void language sql security definer set search_path='' as $$
  update public.novidades set lida_em=now() where id=p_id and destinatario_id=auth.uid() and atualizado_em=p_versao;
$$;
create function public.marcar_caso_visto(p_id text)
returns void language sql security definer set search_path='' as $$
  update public.casos set visto_em=now() where id=p_id and responsavel_id=auth.uid() and visto_em is null;
$$;
create function public.resumo_operacao()
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('versao',8,
    'novidades',(select count(*) from public.novidades where lida_em is null),
    'novos',(select count(*) from public.casos where aberto and responsavel_id=auth.uid() and atribuido_em is not null and visto_em is null),
    'retornos',(select count(*) from public.casos where aberto and proximo_contato<=(now() at time zone 'America/Sao_Paulo')::date),
    'semana',(select max(ultima_semana) from public.casos));
$$;
create function public.carga_colaboradores()
returns table(id uuid,nome text,ativos bigint,retornos bigint,novos bigint)
language sql stable security invoker set search_path='' as $$
  select c.id,c.nome,count(k.id) filter(where k.aberto),
    count(k.id) filter(where k.aberto and k.proximo_contato<=(now() at time zone 'America/Sao_Paulo')::date),
    count(k.id) filter(where k.aberto and k.atribuido_em is not null and k.visto_em is null)
  from public.colaboradores c left join public.casos k on k.responsavel_id=c.id
  where c.papel='colaborador' and public.e_supervisor() group by c.id,c.nome order by c.nome;
$$;

create function public.evolucao_notificar()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_dono uuid; v_aviso uuid;
begin
  if TG_OP='UPDATE' and NEW.prioridade is not distinct from OLD.prioridade
    and NEW.indicadores is not distinct from OLD.indicadores then return NEW; end if;
  update public.casos set ultima_semana=NEW.semana,prioridade_atual=NEW.prioridade
    where id=NEW.caso_id and coalesce(ultima_semana,semana_entrada)<=NEW.semana;
  select responsavel_id into v_dono from public.casos where id=NEW.caso_id and aberto;
  if v_dono is not null then
    insert into public.novidades(destinatario_id,tipo,semana) values(v_dono,'semana',NEW.semana)
      on conflict(destinatario_id,semana) do update set atualizado_em=clock_timestamp(),lida_em=null returning id into v_aviso;
    insert into public.novidade_itens values(v_aviso,NEW.caso_id) on conflict do nothing;
  end if;
  return NEW;
end $$;
create trigger evolucao_avisos after insert or update on public.evolucao_semanal for each row execute function public.evolucao_notificar();

revoke all on function public.distribuir_lote(jsonb,uuid,text),public.marcar_novidade_lida(uuid,timestamptz),
  public.marcar_caso_visto(text),public.resumo_operacao(),public.carga_colaboradores(),public.evolucao_notificar() from public,anon;
grant execute on function public.distribuir_lote(jsonb,uuid,text),public.marcar_novidade_lida(uuid,timestamptz),
  public.marcar_caso_visto(text),public.resumo_operacao(),public.carga_colaboradores() to authenticated;
-- Supersede the old unchecked assignment endpoint, including already-open clients.
revoke execute on function public.atribuir_lote(text[],uuid) from authenticated;
notify pgrst,'reload schema';
commit;
