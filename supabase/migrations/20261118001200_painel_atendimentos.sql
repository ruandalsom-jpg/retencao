begin;

create function public.meu_dia(p_pagina integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  with dia as (select (now() at time zone 'America/Sao_Paulo')::date as hoje),
  fila as (
    select c.*, case when c.proximo_contato<dia.hoje then 1
      when c.proximo_contato=dia.hoje then 2 else 3 end as ordem
    from public.casos c cross join dia
    where c.aberto and c.responsavel_id=auth.uid()
      and (c.proximo_contato<=dia.hoje or
        (c.proximo_contato is null and not exists (
          select 1 from public.contatos t where t.caso_id=c.id and t.autor_id=auth.uid()
            and (c.atribuido_em is null or t.criado_em>=c.atribuido_em)
        )))
  ), pagina as (
    select id,motivo,praca,prioridade,prioridade_atual,semana_entrada,proximo_contato,
      responsavel_id,atribuido_em,visto_em,aberto,etapa,ordem
    from fila order by ordem,proximo_contato,atribuido_em nulls first,id
    limit 10 offset (greatest(0,least(p_pagina,100000))*10)
  )
  select jsonb_build_object(
    'vencidos',(select count(*) from fila where ordem=1),
    'hoje',(select count(*) from fila where ordem=2),
    'primeiros',(select count(*) from fila where ordem=3),
    'casos',coalesce((select jsonb_agg(p order by p.ordem,p.proximo_contato,p.atribuido_em nulls first,p.id) from pagina p),'[]'::jsonb));
$$;

create function public.painel_atendimentos(p_semana date,p_autor uuid default null,p_praca text default null,p_prioridade text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare inicio timestamptz; fim timestamptz;
begin
  if not public.e_supervisor() then raise exception 'Acesso reservado à supervisão'; end if;
  if p_semana is null or extract(isodow from p_semana)<>1 then
    raise exception 'Selecione a segunda-feira da semana';
  end if;
  inicio=p_semana::timestamp at time zone 'America/Sao_Paulo';
  fim=(p_semana+7)::timestamp at time zone 'America/Sao_Paulo';

  return (with equipe as (
    select id,nome from public.colaboradores where p_autor is null or id=p_autor
  ), recorte as (
    select id,responsavel_id,aberto,proximo_contato,atribuido_em,motivo,praca,etapa,
      semana_entrada,prioridade,prioridade_atual,visto_em
    from public.casos where (p_praca is null or praca ilike '%'||p_praca||'%')
      and (p_prioridade is null or translate(lower(coalesce(prioridade_atual,prioridade)),'éãç','eac')=p_prioridade)
  ), contatos as (
    select t.autor_id,t.caso_id,t.resultado from public.contatos t join recorte c on c.id=t.caso_id
    where t.criado_em>=inicio and t.criado_em<fim
  ), recebidos as (
    select a.responsavel_id,a.caso_id,a.criado_em, primeiro.criado_em as primeiro_em
    from public.atribuicoes a join recorte c on c.id=a.caso_id
    left join lateral (
      select t.criado_em from public.contatos t
      where t.caso_id=a.caso_id and t.autor_id=a.responsavel_id and t.criado_em>=a.criado_em and t.criado_em<fim
        and not exists(select 1 from public.atribuicoes posterior
          where posterior.caso_id=a.caso_id and posterior.id>a.id and posterior.criado_em<=t.criado_em)
      order by t.criado_em limit 1
    ) primeiro on true
    where a.criado_em>=inicio and a.criado_em<fim
  ), fila as (
    select c.*, case when c.proximo_contato<(now() at time zone 'America/Sao_Paulo')::date then 'Vencido'
      when c.proximo_contato=(now() at time zone 'America/Sao_Paulo')::date then 'Hoje'
      else 'Sem tentativa' end as situacao
    from recorte c where c.aberto and c.responsavel_id is not null
      and (c.proximo_contato<=(now() at time zone 'America/Sao_Paulo')::date
        or not exists(select 1 from public.contatos t
          where t.caso_id=c.id and t.autor_id=c.responsavel_id
            and (c.atribuido_em is null or t.criado_em>=c.atribuido_em)))
  )
  select jsonb_build_object('equipe',coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'nome',e.nome,
    'recebidos',(select count(distinct caso_id) from recebidos where responsavel_id=e.id),
    'sem_tentativa',(select count(*) from (select caso_id from recebidos where responsavel_id=e.id group by caso_id having count(primeiro_em)=0) pendentes),
    'atendidos',(select count(distinct caso_id) from contatos where autor_id=e.id),
    'tentativas',(select count(*) from contatos where autor_id=e.id),
    'mediana_horas',(select percentile_cont(0.5) within group(order by extract(epoch from primeiro_em-criado_em)/3600) from recebidos where responsavel_id=e.id and primeiro_em is not null),
    'vencidos',(select count(*) from fila where responsavel_id=e.id and situacao='Vencido'),
    'hoje',(select count(*) from fila where responsavel_id=e.id and situacao='Hoje'),
    'resultados',coalesce((select jsonb_object_agg(resultado,total) from
      (select resultado,count(*) total from contatos where autor_id=e.id group by resultado) r),'{}'::jsonb)
  ) order by e.nome,e.id),'[]'::jsonb),
  'fila',coalesce((select jsonb_agg(f order by f.proximo_contato nulls last,f.atribuido_em nulls first,f.id)
    from (select fila.*,equipe.nome as responsavel from fila join equipe on equipe.id=fila.responsavel_id
    order by proximo_contato nulls last,atribuido_em nulls first,fila.id limit 20) f),'[]'::jsonb))
  from equipe e);
end $$;

create index if not exists contatos_autor_data on public.contatos(autor_id,criado_em,caso_id);
create index if not exists contatos_caso_autor_data on public.contatos(caso_id,autor_id,criado_em);
create index if not exists atribuicoes_data_caso on public.atribuicoes(criado_em,caso_id);
create index if not exists atribuicoes_caso_ordem on public.atribuicoes(caso_id,id);

revoke all on function public.meu_dia(integer),public.painel_atendimentos(date,uuid,text,text) from public,anon;
grant execute on function public.meu_dia(integer),public.painel_atendimentos(date,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

