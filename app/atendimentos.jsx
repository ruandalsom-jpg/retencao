'use client'

import { useEffect, useState } from 'react'
import { hoje } from './operacao.mjs'

function segundaFeira(data) {
  if (!data) return ''
  const dia = new Date(data + 'T12:00:00Z')
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7))
  return dia.toISOString().slice(0, 10)
}

function semanasDisponiveis() {
  const atual = new Date(segundaFeira(hoje()) + 'T12:00:00Z')
  return Array.from({ length: 156 }, (_, indice) => {
    const dia = new Date(atual)
    dia.setUTCDate(dia.getUTCDate() - indice * 7)
    const segunda = dia.toISOString().slice(0,10)
    dia.setUTCDate(dia.getUTCDate() + 3)
    const ano = dia.getUTCFullYear()
    const semana = Math.ceil(((dia - Date.UTC(ano,0,1,12)) / 86400000 + 1) / 7)
    return { segunda, rotulo: ano + '-W' + String(semana).padStart(2,'0') }
  })
}

const numero = valor => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const dataBR = valor => valor?.split('-').reverse().join('/') || '—'

function useConsulta(db, nome, parametros, versao) {
  const chave = JSON.stringify(parametros)
  const [estado, setEstado] = useState(null)
  useEffect(() => {
    let ativo = true
    async function carregar() {
      try {
        const { data, error } = await db.rpc(nome, JSON.parse(chave))
        if (error) throw error
        if (ativo) setEstado({ chave, versao, dados: data })
      } catch (erro) {
        if (ativo) setEstado({ chave, versao, erro: erro.code === 'PGRST202'
          ? 'Ative o painel de atendimentos no Supabase para liberar esta tela.'
          : erro.message || 'Não foi possível consultar os atendimentos.' })
      }
    }
    carregar()
    return () => { ativo = false }
  }, [db, nome, chave, versao])
  return estado?.chave === chave && estado.versao === versao ? estado : null
}

function Fila({ casos, abrir, equipe = false }) {
  return <div className="table"><table>
    <thead><tr><th>Caso</th><th>Situação</th><th>Prazo</th><th>Atraso</th><th>Praça</th>{equipe && <th>Responsável</th>}</tr></thead>
    <tbody>{casos.map(c => {
      const situacao = c.situacao || ({1:'Vencido',2:'Hoje',3:'Sem tentativa'})[c.ordem]
      const atraso = c.proximo_contato && situacao === 'Vencido'
        ? (Date.parse(hoje()) - Date.parse(c.proximo_contato)) / 86400000 : null
      return <tr key={c.id}><th scope="row"><button className="caso-link" onClick={() => abrir(c)}>{c.id}</button><small className="block">{c.motivo}</small></th>
        <td><span className={'badge badge-'+(situacao==='Vencido'?'vencido':situacao==='Hoje'?'hoje':'')}>{situacao}</span></td>
        <td>{dataBR(c.proximo_contato)}</td><td>{atraso === null ? '—' : atraso + (atraso===1?' dia':' dias')}</td>
        <td>{c.praca}</td>{equipe && <td>{c.responsavel}</td>}
      </tr>
    })}</tbody>
  </table></div>
}

export function MeuDia({ db, versao, abrir }) {
  const [pagina, mudarPagina] = useState(0)
  const consulta = useConsulta(db, 'meu_dia', { p_pagina: pagina }, versao)
  const dados = consulta?.dados
  const total = dados ? dados.vencidos + dados.hoje + dados.primeiros : 0
  const ultimaPagina = Math.max(0, Math.ceil(total / 10) - 1)
  useEffect(() => {
    if (dados && pagina > ultimaPagina) mudarPagina(ultimaPagina)
  }, [dados, pagina, ultimaPagina])

  if (consulta?.erro) return <p className="erro" role="alert">{consulta.erro}</p>
  if (!dados) return <p role="status">Carregando sua fila…</p>
  return <section className="panel">
    <h2>Prioridades do dia</h2>
    <div className="cards">{[['Retornos vencidos',dados.vencidos],['Retornos de hoje',dados.hoje],['Primeiras tentativas',dados.primeiros]].map(([titulo,valor]) =>
      <article key={titulo}><small>{titulo}</small><strong>{numero(valor)}</strong></article>)}</div>
    {total ? <><Fila casos={dados.casos} abrir={abrir}/><div className="toolbar paginacao-central">
      <small>Página {pagina+1} de {ultimaPagina+1} · {numero(total)} casos</small>
      <button disabled={!pagina} onClick={()=>mudarPagina(pagina-1)}>Anterior</button>
      <button disabled={pagina>=ultimaPagina} onClick={()=>mudarPagina(pagina+1)}>Próxima</button>
    </div></> : <p>Nenhum retorno ou primeira tentativa pendente na sua fila.</p>}
  </section>
}

export function PainelAtendimentos({ db, versao, equipe, abrir }) {
  const [semana,setSemana] = useState(()=>segundaFeira(hoje()))
  const [autor,setAutor] = useState('')
  const [praca,setPraca] = useState('')
  const [prioridade,setPrioridade] = useState('')
  const consulta = useConsulta(db,'painel_atendimentos',{
    p_semana:semana,p_autor:autor||null,p_praca:praca.trim()||null,p_prioridade:prioridade||null,
  },versao)
  const dados = consulta?.dados
  const semanas = semanasDisponiveis()
  const carteiraAtiva = dados?.equipe.some(p => Object.hasOwn(p,'ainda_atribuidos'))
  const metricas = [...(carteiraAtiva?[['ainda_atribuidos','Ainda na carteira']]:[]),['recebidos','Recebidos no histórico'],['atendidos','Casos atendidos'],['tentativas','Tentativas']]
  return <section className="panel">
    <h2>Atendimentos por semana</h2>
    <div className="toolbar filtros-central">
      <label>Semana<select value={semana} onChange={e=>setSemana(e.target.value)}>
        {semanas.map(({segunda,rotulo})=><option key={segunda} value={segunda}>{rotulo}</option>)}
      </select></label>
      <label>Colaborador<select value={autor} onChange={e=>setAutor(e.target.value)}><option value="">Todos</option>{equipe.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
      <label>Praça<input value={praca} onChange={e=>setPraca(e.target.value)} placeholder="Todas"/></label>
      <label>Prioridade atual<select value={prioridade} onChange={e=>setPrioridade(e.target.value)}><option value="">Todas</option><option value="alta">Alta</option><option value="media">Média</option><option value="reativacao">Reativação</option><option value="monitoramento">Monitoramento</option></select></label>
    </div>
    {consulta?.erro ? <p className="erro" role="alert">{consulta.erro}</p> : !dados ? <p role="status">Carregando indicadores…</p> : <>
      <p>“Ainda na carteira” conta os casos da semana que seguem abertos com o mesmo responsável. O histórico inclui atribuições que foram removidas ou transferidas e preserva os contatos registrados.</p>
      <div className="table"><table><thead><tr>{['Colaborador',...metricas.map(([,rotulo])=>rotulo),carteiraAtiva?'Na carteira sem tentativa':'Recebidos sem tentativa (histórico)','Mediana até a 1ª tentativa','Vencidos agora','Retornos hoje'].map(rotulo=><th scope="col" key={rotulo}>{rotulo}</th>)}</tr></thead>
      <tbody>{dados.equipe.map(p=><tr key={p.id}><th scope="row">{p.nome}</th>
        {metricas.map(([campo,rotulo])=><td key={campo}>{numero(p[campo])}<progress aria-label={rotulo+' de '+p.nome} value={p[campo]} max={Math.max(1,...dados.equipe.map(item=>item[campo]))}/></td>)}
        <td>{numero(carteiraAtiva?p.pendentes_na_carteira:p.sem_tentativa)}</td><td>{p.mediana_horas===null?'—':numero(p.mediana_horas)+' h'}</td><td>{numero(p.vencidos)}</td><td>{numero(p.hoje)}</td>
      </tr>)}</tbody></table></div>
      <h3>Resultados registrados nos contatos</h3>
      {dados.equipe.some(p=>Object.keys(p.resultados).length) ? <div className="table"><table><thead><tr><th>Colaborador</th><th>Resultado</th><th>Tentativas</th></tr></thead><tbody>
        {dados.equipe.flatMap(p=>Object.entries(p.resultados).map(([resultado,qtd])=><tr key={p.id+':'+resultado}><td>{p.nome}</td><td>{resultado}</td><td>{numero(qtd)}<progress aria-label={resultado+' de '+p.nome} value={qtd} max={Math.max(1,p.tentativas)}/></td></tr>))}
      </tbody></table></div> : <p>Nenhum resultado registrado no recorte semanal.</p>}
      <h3>Casos que precisam de ação agora</h3>
      <p>Até 20 casos, começando pelos prazos mais antigos. Este quadro mostra a fila atual.</p>
      {dados.fila.length ? <Fila casos={dados.fila} abrir={abrir} equipe/> : <p>Nenhum caso pendente no recorte.</p>}
    </>}
  </section>
}
