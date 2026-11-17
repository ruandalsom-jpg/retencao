alter table public.casos add column etapa text not null default 'novo'
  check (etapa in ('novo','em_contato','aguardando','recuperado','encerrado'));
alter table public.casos add constraint etapa_abertura
  check (aberto = (etapa in ('novo','em_contato','aguardando')));
alter table public.contatos add column canal text not null default 'WhatsApp';
alter table public.contatos add column retorno date;
