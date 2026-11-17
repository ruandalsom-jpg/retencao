-- Recebe a exportação semanal. A operação inteira é aplicada em uma transação.
create table public.importacoes_semanais (
  semana text not null check (semana ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'),
  entregador_id text not null,
  dados jsonb not null,
  sincronizado_em timestamptz not null default now(),
  primary key (semana, entregador_id)
);
alter table public.importacoes_semanais enable row level security;

create or replace function public.sincronizar_semana(p_semana text, p_linhas jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
  if p_semana is null or p_semana !~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'
     or p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Semana ou lote inválido';
  end if;
  if jsonb_array_length(p_linhas) not between 1 and 20000 or exists (
    select 1 from jsonb_array_elements(p_linhas) as r(dados)
    where jsonb_typeof(dados) is distinct from 'object'
       or (dados->>'semana') is distinct from p_semana
       or coalesce(trim(dados->>'entregador_id'),'') = ''
       or coalesce(trim(dados->>'praca'),'') = ''
  ) then
    raise exception 'Confira os dados da semana';
  end if;
  insert into public.importacoes_semanais (semana, entregador_id, dados)
  select p_semana, lower(trim(dados->>'entregador_id')), dados
  from jsonb_array_elements(p_linhas) as r(dados)
  on conflict (semana, entregador_id) do update
    set dados = excluded.dados, sincronizado_em = now()
    where importacoes_semanais.dados is distinct from excluded.dados;
  get diagnostics total = row_count;
  return total;
end;
$$;
revoke all on function public.sincronizar_semana(text, jsonb) from public, anon, authenticated;
grant execute on function public.sincronizar_semana(text, jsonb) to service_role;
grant select, insert, update on public.importacoes_semanais to service_role;
