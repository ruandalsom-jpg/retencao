import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;`)
const repo=new URL('../supabase/migrations/',import.meta.url)
for(const file of ['20261117000100_carteira.sql','20261117000200_importacoes.sql','20261117000300_crm.sql','20261117000400_permissoes.sql','20261117000500_processamento.sql','20261118000800_lotes_novidades.sql']) await db.exec(readFileSync(new URL(file,repo),'utf8'))
const supervisor='00000000-0000-4000-8000-000000000001',samuel='00000000-0000-4000-8000-000000000002',outro='00000000-0000-4000-8000-000000000003'
await db.exec(`insert into auth.users values('${supervisor}'),('${samuel}'),('${outro}');insert into public.colaboradores values('${supervisor}','Gestor','supervisor'),('${samuel}','Samuel','colaborador'),('${outro}','Outro','colaborador');
insert into casos(id,entregador_id,semana_entrada,praca,motivo,prioridade) values('C1','driver1','2026-W45','SP','Inatividade','Alta'),('C2','driver2','2026-W46','SP','Queda','Média');
insert into evolucao_semanal values('C1','2026-W46','Reativação','{}'),('C2','2026-W46','Alta','{}');`)
async function as(id){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`)}
async function query(sql,params=[]){return (await db.query(sql,params)).rows}
const casos=[{id:'C1',responsavel_id:null},{id:'C2',responsavel_id:null}]
await as(supervisor)
assert.equal((await query("select prioridade_atual from casos where id='C1'"))[0].prioridade_atual,'Reativação')
const lote=(await query('select distribuir_lote($1::jsonb,$2::uuid,$3) id',[JSON.stringify(casos),samuel,'W46 Alta']))[0].id
assert.equal((await query('select count(*)::int n from lote_itens'))[0].n,2)
await assert.rejects(query('select distribuir_lote($1::jsonb,$2::uuid,$3)',[JSON.stringify(casos),outro,'Seleção desatualizada']),/mudou/)
assert.equal((await query('select count(*)::int n from lotes_distribuicao'))[0].n,1)
await as(samuel)
assert.equal((await query('select count(*)::int n from casos'))[0].n,2)
assert.equal((await query('select count(*)::int n from novidades'))[0].n,1)
assert.equal((await query('select resumo_operacao() resumo'))[0].resumo.novos,2)
await query("select marcar_caso_visto('C1')")
assert.equal((await query('select resumo_operacao() resumo'))[0].resumo.novos,1)
await assert.rejects(query('select distribuir_lote($1::jsonb,$2::uuid,$3)',[JSON.stringify(casos),outro,'Proibido']),/supervisores/)
await assert.rejects(query("update casos set responsavel_id=$1",[outro]),/permission denied/)
await as(outro)
assert.equal((await query('select count(*)::int n from casos'))[0].n,0)
assert.equal((await query('select count(*)::int n from novidades'))[0].n,0)
assert.equal((await query('select count(*)::int n from lote_itens'))[0].n,0)
await db.exec(`reset role;insert into evolucao_semanal values('C1','2026-W47','Alta','{"pedidos":2}'),('C2','2026-W47','Média','{"pedidos":3}');`)
await as(samuel)
let aviso=(await query("select * from novidades where tipo='semana'"))[0]
assert.equal((await query('select count(*)::int n from novidade_itens where novidade_id=$1',[aviso.id]))[0].n,2)
await query('select marcar_novidade_lida($1,$2)',[aviso.id,aviso.atualizado_em.toISOString()])
await db.exec(`reset role;update evolucao_semanal set indicadores=indicadores where semana='2026-W47';`)
await as(samuel)
assert.ok((await query('select lida_em from novidades where id=$1',[aviso.id]))[0].lida_em)
await db.exec(`reset role;update evolucao_semanal set indicadores='{"pedidos":4}' where semana='2026-W47' and caso_id='C1';`)
await as(samuel)
await query('select marcar_novidade_lida($1,$2)',[aviso.id,aviso.atualizado_em.toISOString()])
assert.equal((await query('select lida_em from novidades where id=$1',[aviso.id]))[0].lida_em,null)
await db.exec(`reset role;update evolucao_semanal set prioridade='Monitoramento' where semana='2026-W46' and caso_id='C1';`)
await as(samuel)
assert.equal((await query("select prioridade_atual from casos where id='C1'"))[0].prioridade_atual,'Alta')
await as(supervisor)
await query('select distribuir_lote($1::jsonb,$2::uuid,$3)',[JSON.stringify([{id:'C1',responsavel_id:samuel}]),outro,'Transferência'])
await as(samuel)
assert.equal((await query('select count(*)::int n from casos'))[0].n,1)
await as(outro)
assert.equal((await query('select resumo_operacao() resumo'))[0].resumo.novos,1)
console.log('PASS: migração, prioridade atual, lote auditado, conflito sem gravação parcial, RLS, leitura individual, importação idempotente, aviso consolidado, leitura concorrente e transferência.')

await db.exec('reset role')
await db.exec(readFileSync(new URL('20261118001200_painel_atendimentos.sql',repo),'utf8'))
await db.exec(`update casos set proximo_contato=(now() at time zone 'America/Sao_Paulo')::date-1 where id='C2';
insert into contatos(caso_id,autor_id,resultado)
values ('C2','${samuel}','Respondeu'),('C2','${samuel}','Respondeu');`)
await as(samuel)
const fila=(await query('select meu_dia(0) fila'))[0].fila
assert.equal(fila.vencidos,1)
assert.deepEqual(fila.casos.map(c=>c.id),['C2'])
const painel="select painel_atendimentos(date_trunc('week',now() at time zone 'America/Sao_Paulo')::date,$1,null,null) dados"
await assert.rejects(query(painel,[samuel]),/supervisão/)
await as(supervisor)
const relatorio=(await query(painel,[samuel]))[0].dados
assert.equal(relatorio.equipe[0].recebidos,2)
assert.equal(relatorio.equipe[0].atendidos,1)
assert.equal(relatorio.equipe[0].tentativas,2)
assert.equal(relatorio.equipe[0].resultados.Respondeu,2)
assert.equal(relatorio.equipe[0].vencidos,1)
assert.equal(relatorio.equipe[0].sem_tentativa,1)
assert.ok(relatorio.equipe[0].mediana_horas>=0)
assert.deepEqual(relatorio.fila.map(c=>c.id),['C2'])
console.log('PASS: fila pessoal, isolamento, atribuições transferidas, tentativas e casos únicos.')
await db.exec('reset role')
for (const file of ['20261118000900_remover_atribuicoes.sql','20261118001300_atendimentos_carteira_atual.sql']) {
  await db.exec(readFileSync(new URL(file,repo),'utf8'))
}
await as(supervisor)
await query('select remover_atribuicoes($1::jsonb)',[JSON.stringify([{id:'C2',responsavel_id:samuel}])])
const aposRemocao=(await query(painel,[samuel]))[0].dados
assert.equal(aposRemocao.equipe[0].ainda_atribuidos,0)
assert.equal(aposRemocao.equipe[0].pendentes_na_carteira,0)
assert.equal(aposRemocao.equipe[0].recebidos,2)
assert.equal(aposRemocao.equipe[0].tentativas,2)
assert.equal(aposRemocao.fila.length,0)
console.log('PASS: remoção da carteira preserva o histórico semanal.')
await db.close()
