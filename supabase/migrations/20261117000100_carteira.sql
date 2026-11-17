create table public.colaboradores (
  id uuid primary key references auth.users(id),
  nome text not null check (length(trim(nome)) > 0),
  papel text not null check (papel in ('supervisor', 'colaborador'))
);

create table public.casos (
  id text primary key,
  entregador_id text not null,
  semana_entrada text not null check (semana_entrada ~ '^[0-9]{4}-W[0-9]{2}$'),
  praca text not null,
  motivo text not null,
  prioridade text not null,
  responsavel_id uuid references public.colaboradores(id),
  aberto boolean not null default true,
  proximo_contato date,
  unique (entregador_id, semana_entrada)
);

create unique index casos_um_aberto_por_entregador
  on public.casos (entregador_id) where aberto;
create index casos_responsavel on public.casos (responsavel_id, aberto, proximo_contato);

create table public.evolucao_semanal (
  caso_id text not null references public.casos(id),
  semana text not null check (semana ~ '^[0-9]{4}-W[0-9]{2}$'),
  prioridade text not null,
  indicadores jsonb not null,
  primary key (caso_id, semana)
);

create table public.contatos (
  id bigint generated always as identity primary key,
  caso_id text not null references public.casos(id),
  autor_id uuid not null references public.colaboradores(id),
  resultado text not null,
  observacao text,
  criado_em timestamptz not null default now()
);

create table public.atribuicoes (
  id bigint generated always as identity primary key,
  caso_id text not null references public.casos(id),
  supervisor_id uuid not null references public.colaboradores(id),
  responsavel_id uuid not null references public.colaboradores(id),
  criado_em timestamptz not null default now()
);

alter table public.colaboradores enable row level security;
alter table public.casos enable row level security;
alter table public.evolucao_semanal enable row level security;
alter table public.contatos enable row level security;
alter table public.atribuicoes enable row level security;

create policy colaborador_le_proprio_perfil on public.colaboradores
  for select to authenticated using (id = (select auth.uid()));

create policy acesso_carteira on public.casos
  for select to authenticated using (
    responsavel_id = (select auth.uid()) or exists (
      select 1 from public.colaboradores
      where id = (select auth.uid()) and papel = 'supervisor'
    )
  );

create policy acesso_evolucao on public.evolucao_semanal
  for select to authenticated using (exists (
    select 1 from public.casos where casos.id = caso_id
  ));

create policy acesso_contatos on public.contatos
  for select to authenticated using (exists (
    select 1 from public.casos where casos.id = caso_id
  ));

create policy acesso_atribuicoes on public.atribuicoes
  for select to authenticated using (exists (
    select 1 from public.colaboradores
    where id = (select auth.uid()) and papel = 'supervisor'
  ));
