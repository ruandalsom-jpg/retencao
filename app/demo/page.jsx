'use client'

import { useEffect, useState } from 'react'
import { atribuir, baseDemo, colagemDemo, equipe, hoje, importar, lerColagem, prioridades, proximaAcao, registrar, resultados } from '../operacao.mjs'

const chave = 'retencao-demo-v1'
const fmt = value => value == null ? '—' : Number(value).toLocaleString('pt-BR')
const abas = ['Dashboard','Carteira','Retornos','Importação']

export default function Home() {
  const [base, setBase] = useState(null)
  const [aba, setAba] = useState('Dashboard')
  const [casoId, setCasoId] = useState('')
  const [semana, setSemana] = useState('')
  const [praca, setPraca] = useState('')
  const [filtro, setFiltro] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [selecao, setSelecao] = useState([])
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState(null)
  const [modo, setModo] = useState('evolucao')
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState(false)

  useEffect(() => {
    try { setBase(JSON.parse(localStorage.getItem(chave)) || baseDemo()) }
    catch { setBase(baseDemo()) }
  }, [])

  function executar(fn) {
    setErro(false)
    try { fn() } catch (e) { setErro(true); setAviso(e.message) }
  }
  function salvar(novaBase, mensagem) {
    localStorage.setItem(chave, JSON.stringify(novaBase))
    setBase(novaBase)
    setAviso(mensagem)
  }
  function navegar(destino) {
    setAba(destino)
    setCasoId('')
    setAviso('')
  }

  if (!base) return <main><h1>Retenção de Frota</h1><p>Carregando…</p></main>
  const semanas = [...new Set(base.evolucao.map(e=>e.semana))].sort().reverse()
  const pracas = [...new Set(base.casos.map(c=>c.praca))].sort()
  const historico = new Map()
  for (const c of base.contatos) {
    if (!historico.has(c.caso)) historico.set(c.caso, [])
    historico.get(c.caso).push(c)
  }
  const contatos = id => historico.get(id) || []
  const visiveis = base.casos.filter(c=>(!semana || c.semana===semana) &&
    (!praca || c.praca===praca) && (!filtro || (filtro==='livre' ? !c.responsavel : c.responsavel===filtro)))
  const ativos = visiveis.filter(c=>c.status==='Aberto')
  const semDono = ativos.filter(c=>!c.responsavel)
  const retornos = ativos.filter(c=>c.retorno).sort((a,b)=>a.retorno.localeCompare(b.retorno))
  const caso=base.casos.find(c=>c.id===casoId)
  const selecionados = selecao.filter(id=>semDono.some(c=>c.id===id))
  const idsVisiveis = new Set(visiveis.map(c=>c.id))
  const registros = modo==='entrada' ? visiveis : base.evolucao.filter(e=>idsVisiveis.has(e.caso))
  const totais = new Map()
  for (const r of registros) {
    if (!totais.has(r.semana)) totais.set(r.semana, {})
    const semana = totais.get(r.semana)
    semana[r.prioridade]=(semana[r.prioridade]||0)+1
  }

  function tabela(lista, lote=false) {
    return <div className="table"><table>
      <thead><tr>{[...(lote?['Seleção']:[]),'Caso','Praça','Semana de entrada','Motivo','Prioridade de entrada','Próxima ação','Responsável'].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead>
      <tbody>{lista.map(c=><tr key={c.id}>
        {lote && <td><input type="checkbox" aria-label={'Selecionar '+c.id} disabled={!!c.responsavel || c.status!=='Aberto'}
          checked={selecionados.includes(c.id)} onChange={e=>setSelecao(e.target.checked?[...selecionados,c.id]:selecionados.filter(id=>id!==c.id))}/></td>}
        <th scope="row"><button onClick={()=>{setCasoId(c.id);setAviso('')}}>{c.id}</button></th>
        <td>{c.praca}</td><td>{c.semana}</td><td>{c.motivo}</td><td>{c.prioridade}</td>
        <td>{proximaAcao(c,contatos(c.id))}{c.retorno && <small className="block">{c.retorno}</small>}</td>
        <td>{c.responsavel || 'Sem responsável'}</td>
      </tr>)}</tbody>
    </table>{!lista.length && <p>Nenhum caso neste recorte.</p>}</div>
  }

  return <main>
    <header><div><span className="brand">Operações</span><h1>Retenção de Frota</h1></div><span className="demo">Demonstração · use dados fictícios</span></header>
    <nav className="toolbar" aria-label="Seções">{abas.map(item=><button key={item} aria-current={aba===item?'page':undefined} onClick={()=>navegar(item)}>{item}</button>)}</nav>
    {aviso && <p className={erro?'erro':'aviso'} role={erro?'alert':'status'}>{aviso}</p>}
    {caso ? <>
      <button onClick={()=>setCasoId('')}>Voltar para {aba}</button>
      <section className="panel"><h2>{caso.id} · {caso.praca}</h2>
        <p>{caso.motivo} · {caso.prioridade} na entrada · {caso.responsavel || 'Sem responsável'}</p>
        <p><b>{proximaAcao(caso,contatos(caso.id))}</b>{caso.retorno && ' · '+caso.retorno}</p>
        <h3>Evolução semanal</h3>
        <div className="table"><table><thead><tr>{['Semana','Motivo','Prioridade','Horas online','Pedidos','Ofertas','Rejeição (%)'].map(t=><th key={t}>{t}</th>)}</tr></thead>
          <tbody>{base.evolucao.filter(e=>e.caso===caso.id).sort((a,b)=>b.semana.localeCompare(a.semana)).map(e=><tr key={e.semana}>
            <td>{e.semana}</td><td>{e.motivo}</td><td>{e.prioridade}</td>{['SH Semana','Pedidos','Ofertas','Rejeição (%)'].map(k=><td key={k}>{fmt(e.indicadores[k])}</td>)}
          </tr>)}</tbody></table></div>
      </section>
      {caso.status==='Aberto' && <Atendimento key={caso.id} caso={caso} onSave={(dados,form)=>executar(()=>{
        salvar(registrar(base,caso.id,dados),'Contato registrado.'); form.reset()
      })}/>}
      <section className="panel"><h2>Histórico de contatos</h2>
        {[...contatos(caso.id)].reverse().map((c,i)=><article key={i}><b>{c.resultado}</b> · {c.autor} · {c.registrado}
          {c.retorno && <small className="block">Retorno combinado em {c.retorno}</small>}<p>{c.observacao}</p></article>)}
        {!contatos(caso.id).length && <p>Nenhum contato registrado.</p>}
      </section>
    </> : aba==='Importação' ? <section className="panel">
      <h2>Importação semanal</h2><p>Cole uma única semana fechada do Power BI, na ordem das 26 colunas da aba Colar Power BI.</p>
      <div className="toolbar"><button onClick={()=>{setTexto(colagemDemo);setPrevia(null)}}>Preencher exemplo W47</button>
        <button onClick={()=>{setTexto('');setPrevia(null);setAviso('')}}>Limpar colagem</button></div>
      <label>Dados tabulados<textarea rows="8" value={texto} onChange={e=>{setTexto(e.target.value);setPrevia(null)}}/></label>
      <div className="toolbar"><button onClick={()=>executar(()=>{
        const linhas=lerColagem(texto);setPrevia({linhas,...importar(base,linhas)});setAviso('')
      })}>Conferir semana</button>
      <button className="primary" disabled={!previa} onClick={()=>executar(()=>{
        salvar(importar(base,previa.linhas).base,'Semana processada.');setPrevia(null)
      })}>Processar semana</button></div>
      {previa && <div className="resumo"><strong>{previa.linhas[0].semana}</strong>
        <p>{previa.resumo.novos} novos casos · {previa.resumo.atualizados} atualizações · {previa.resumo.repetidos} já processados · {previa.resumo.fora} fora da fila</p></div>}
    </section> : <>
      <section className="panel toolbar" aria-label="Filtros">
        <label>Semana de entrada<select value={semana} onChange={e=>{setSemana(e.target.value);setSelecao([])}}><option value="">Todas</option>{semanas.map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Praça<select value={praca} onChange={e=>{setPraca(e.target.value);setSelecao([])}}><option value="">Todas</option>{pracas.map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Responsável<select value={filtro} onChange={e=>{setFiltro(e.target.value);setSelecao([])}}><option value="">Todos</option><option value="livre">Sem responsável</option>{equipe.map(p=><option key={p}>{p}</option>)}</select></label>
      </section>
      {aba==='Dashboard' && <>
        <section className="cards" aria-label="Resumo da carteira">
          {[['Casos abertos',ativos.length],['Sem responsável',semDono.length],['Retornos vencidos',retornos.filter(c=>c.retorno<hoje()).length],
            ['Casos com contato',visiveis.filter(c=>contatos(c.id).length).length]].map(([rotulo,n])=><article key={rotulo}><small>{rotulo}</small><strong>{fmt(n)}</strong></article>)}
        </section>
        <section className="panel"><h2>Prioridades por semana</h2>
          <label>Visão<select value={modo} onChange={e=>setModo(e.target.value)}><option value="evolucao">Evolução dos casos</option><option value="entrada">Novos casos</option></select></label>
          <div className="table"><table><thead><tr><th>Semana</th>{prioridades.map(p=><th key={p}>{p}</th>)}</tr></thead><tbody>
            {[...totais].sort(([a],[b])=>b.localeCompare(a)).map(([s,d])=><tr key={s}><th scope="row">{s}</th>{prioridades.map(p=><td key={p}>{fmt(d[p]||0)}</td>)}</tr>)}
          </tbody></table>{!totais.size && <p>Nenhum registro neste recorte.</p>}</div>
        </section>
        <section className="panel"><h2>Fila de acionamento</h2>{tabela([...retornos.filter(c=>c.retorno<=hoje()),...ativos.filter(c=>!c.retorno && !contatos(c.id).length)].slice(0,10))}</section>
      </>}
      {aba==='Carteira' && <section className="panel"><h2>Carteira de acompanhamento</h2>
        <div className="toolbar batch"><button onClick={()=>setSelecao(semDono.slice(0,50).map(c=>c.id))}>Selecionar até 50 disponíveis</button>
          <button onClick={()=>setSelecao([])}>Limpar seleção</button><span>{selecionados.length} selecionados</span>
          <label>Novo responsável<select value={responsavel} onChange={e=>setResponsavel(e.target.value)}>
            <option value="">Escolher</option>{equipe.map(p=><option key={p}>{p}</option>)}</select></label>
          <button className="primary" disabled={!selecionados.length || selecionados.length>50 || !responsavel} onClick={()=>executar(()=>{
            salvar(atribuir(base,selecionados,responsavel),selecionados.length+' casos atribuídos a '+responsavel+'.');setSelecao([])
          })}>Atribuir lote</button></div>{tabela(visiveis,true)}
      </section>}
      {aba==='Retornos' && <section className="panel"><h2>Retornos programados</h2>{tabela(retornos)}</section>}
    </>}
  </main>
}

function Atendimento({caso,onSave}) {
  const [acao,setAcao]=useState('manter')
  return <section className="panel"><h2>Registrar contato</h2>
    <form onSubmit={e=>{e.preventDefault();onSave(Object.fromEntries(new FormData(e.currentTarget)),e.currentTarget)}}>
      <div className="toolbar">
        <label>Colaborador<select name="autor" defaultValue={caso.responsavel} required><option value="">Escolher</option>{equipe.map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Canal<select name="canal"><option>WhatsApp</option><option>Ligação</option><option>Outro</option></select></label>
        <label>Resultado<select name="resultado" required defaultValue=""><option value="">Escolher</option>{resultados.map(r=><option key={r}>{r}</option>)}</select></label>
        <label>Retorno<select name="acao" value={acao} onChange={e=>setAcao(e.target.value)}>
          <option value="manter">Manter como está</option><option value="agendar">Agendar ou reagendar</option><option value="concluir">Concluir retorno</option>
        </select></label>
        {acao==='agendar' && <label>Data do retorno<input name="data" type="date" min={hoje()} required/></label>}
        <label>Situação do caso<select name="status"><option>Aberto</option><option>Recuperado</option><option>Encerrado sem retorno</option></select></label>
      </div>
      <label>Barreira relatada e combinado<textarea name="observacao" rows="3" maxLength="3000"/></label>
      <button className="primary" type="submit">Salvar contato</button>
    </form>
  </section>
}
