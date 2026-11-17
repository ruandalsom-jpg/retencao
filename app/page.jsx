'use client'

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const db = url && key ? createClient(url, key) : null
const etapas = { novo:'Novos casos', em_contato:'Em contato', aguardando:'Aguardando retorno', recuperado:'Recuperados', encerrado:'Encerrados' }
const selecaoCampos = 'id,praca,semana_entrada,motivo,prioridade,responsavel_id,aberto,etapa,proximo_contato'
const limite = 20

export default function Home() {
  const [sessao,setSessao] = useState(undefined)
  const [erro,setErro] = useState('')
  const [ocupado,setOcupado] = useState(false)
  useEffect(()=>{
    if (!db) return
    const {data:{subscription}}=db.auth.onAuthStateChange((_evento,s)=>setSessao(s))
    return ()=>subscription.unsubscribe()
  },[])
  async function entrar(evento) {
    evento.preventDefault()
    const form=new FormData(evento.currentTarget)
    setOcupado(true);setErro('')
    try {
      const {error}=await db.auth.signInWithPassword({email:String(form.get('email')).trim(),password:form.get('senha')})
      if (error) setErro('Não foi possível entrar. Confira o e-mail e a senha ou fale com o supervisor.')
    } catch { setErro('Conexão indisponível. Tente novamente.') }
    finally { setOcupado(false) }
  }
  if (sessao) return <CRM key={sessao.user.id} usuario={sessao.user.id}/>
  return <main className="login-shell"><section className="panel login">
    <span className="brand">Operações</span><h1>Retenção de Frota</h1><p>Acesse sua carteira de entregadores.</p>
    {!db ? <p className="aviso">Conexão com o Supabase pendente neste ambiente.</p> :
      sessao===undefined ? <p role="status">Verificando sessão…</p> :
      <form onSubmit={entrar}>
        <label>E-mail<input type="email" name="email" autoComplete="username" required/></label>
        <label>Senha<input type="password" name="senha" autoComplete="current-password" required/></label>
        <button className="primary" disabled={ocupado}>{ocupado?'Entrando…':'Entrar'}</button>
      </form>}
    {erro && <p className="erro" role="alert">{erro}</p>}
    <p><Link href="/demo">Abrir demonstração com dados fictícios</Link></p>
  </section></main>
}

function CRM({usuario}) {
  const [perfil,setPerfil]=useState(null)
  const [equipe,setEquipe]=useState([])
  const [aba,setAba]=useState('Carteira')
  const [versao,reler]=useState(0)
  const [erro,setErro]=useState('')
  const [aviso,setAviso]=useState('')
  const [carregando,setCarregando]=useState(true)
  const [ocupado,setOcupado]=useState(false)
  const [colunas,setColunas]=useState([])
  const [paginas,setPaginas]=useState({})
  const [semana,setSemana]=useState('')
  const [filtro,setFiltro]=useState('')
  const [ids,setIds]=useState([])
  const [dono,setDono]=useState('')
  const [detalhe,setDetalhe]=useState(null)
  const supervisor=perfil?.papel==='supervisor'
  useEffect(()=>{
    let ativo=true
    db.from('colaboradores').select('id,nome,papel').eq('id',usuario).maybeSingle().then(({data,error})=>{
      if (!ativo) return
      setPerfil(data)
      if (error || !data) {setErro('Cadastro de colaborador indisponível. Fale com o supervisor.');setCarregando(false)}
    })
    return ()=>{ativo=false}
  },[usuario])
  useEffect(()=>{
    if (!perfil) return
    let ativo=true
    if (supervisor) db.from('colaboradores').select('id,nome').eq('papel','colaborador').order('nome').then(({data,error})=>{
      if (!ativo) return
      if (error) setErro(error.message)
      else setEquipe(data)
    })
    return ()=>{ativo=false}
  },[perfil,supervisor])
  useEffect(()=>{
    if (!perfil) return
    let ativo=true
    setCarregando(true)
    const chaves=aba==='Distribuição'?['lote']:Object.keys(etapas)
    Promise.all(chaves.map(async etapa=>{
      const pagina=paginas[etapa]||0
      let consulta=db.from('casos').select(selecaoCampos,{count:'exact'}).order('semana_entrada',{ascending:false}).order('id')
      if (etapa==='lote') consulta=consulta.eq('aberto',true)
      else consulta=consulta.eq('etapa',etapa)
      if (semana) consulta=consulta.eq('semana_entrada',semana)
      if (supervisor && filtro) consulta=filtro==='livre'?consulta.is('responsavel_id',null):consulta.eq('responsavel_id',filtro)
      const {data,count,error}=await consulta.range(pagina*limite,pagina*limite+limite-1)
      if (error) throw error
      return {etapa,pagina,total:count,casos:data}
    })).then(dados=>{if(ativo)setColunas(dados)})
      .catch(e=>{if(ativo){setColunas([]);setErro(e.message)}})
      .finally(()=>{if(ativo)setCarregando(false)})
    return ()=>{ativo=false}
  },[perfil,aba,paginas,semana,filtro,versao,supervisor])

  function recorte() { setPaginas({});setIds([]);setErro('');setAviso('');setDetalhe(null) }
  async function salvar(funcao, parametros, mensagem) {
    if (ocupado) return
    setOcupado(true);setErro('');setAviso('')
    try {
      const {error}=await db.rpc(funcao,parametros)
      if (error) throw error
      setDetalhe(null);setIds([]);setPaginas({});reler(v=>v+1);setAviso(mensagem)
    } catch(e) {setErro(e.message)}
    finally {setOcupado(false)}
  }
  async function abrir(caso) {
    setOcupado(true);setErro('')
    try {
      const [e,c]=await Promise.all([
        db.from('evolucao_semanal').select('semana,prioridade,indicadores').eq('caso_id',caso.id).order('semana',{ascending:false}).limit(52),
        db.from('contatos').select('id,canal,resultado,observacao,criado_em,retorno').eq('caso_id',caso.id).order('id',{ascending:false}).limit(100),
      ])
      if (e.error || c.error) throw e.error || c.error
      setDetalhe({caso,evolucao:e.data,contatos:c.data})
    } catch(e) {setErro(e.message)}
    finally {setOcupado(false)}
  }

  return <main>
    <header><div><span className="brand">Operações</span><h1>Retenção de Frota</h1></div><div className="toolbar"><span>{perfil?.nome}</span><button onClick={()=>db.auth.signOut()}>Sair</button></div></header>
    {erro && <p className="erro" role="alert">{erro}</p>}{aviso && <p className="aviso" role="status">{aviso}</p>}
    {perfil && <>
      <nav className="toolbar">{['Carteira',...(supervisor?['Distribuição','Dashboard']:[])].map(t=><button key={t} aria-current={t===aba?'page':undefined} onClick={()=>{setAba(t);recorte()}}>{t}</button>)}</nav>
      {!detalhe && <section className="panel toolbar" aria-label="Filtros">
        <label>Semana de entrada<input value={semana} placeholder="Todas · AAAA-W00" onChange={e=>{setSemana(e.target.value);recorte()}}/></label>
        {supervisor && <label>Responsável<select value={filtro} onChange={e=>{setFiltro(e.target.value);recorte()}}><option value="">Todos</option><option value="livre">Sem responsável</option>{equipe.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}
      </section>}
      {detalhe ? <Detalhe {...detalhe} ocupado={ocupado} fechar={()=>setDetalhe(null)} salvar={salvar}/> :
        carregando ? <p role="status">Carregando carteira…</p> :
        aba==='Dashboard' ? <section className="panel"><h2>Casos por etapa</h2><div className="cards">{colunas.map(c=><article key={c.etapa}>
          <small>{etapas[c.etapa]}</small><strong>{c.total}</strong>
          <progress value={c.total} max={Math.max(1,colunas.reduce((n,l)=>n+l.total,0))} aria-label={etapas[c.etapa]}/>
        </article>)}</div></section> :
        aba==='Distribuição' ? <section className="panel"><h2>Distribuição de lotes</h2>
          <div className="toolbar batch">
            <button onClick={()=>setIds(colunas[0]?.casos.filter(c=>c.responsavel_id!==dono).map(c=>c.id)||[])}>Selecionar página</button>
            <span>{ids.length} selecionados</span>
            <label>Colaborador<select value={dono} onChange={e=>setDono(e.target.value)}><option value="">Escolher</option>{equipe.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            <button className="primary" disabled={ocupado||!dono||!ids.length} onClick={()=>{
              if (confirm('Atribuir '+ids.length+' casos ao colaborador selecionado?')) salvar('atribuir_lote',{p_ids:ids,p_responsavel:dono},'Lote atribuído.')
            }}>Atribuir lote</button>
          </div>
          {colunas.map(c=><div key={c.etapa} className="table"><table><thead><tr><th>Seleção</th><th>Caso</th><th>Praça</th><th>Motivo</th><th>Responsável</th></tr></thead>
            <tbody>{c.casos.map(item=><tr key={item.id}><td><input type="checkbox" aria-label={'Selecionar caso '+item.id} checked={ids.includes(item.id)} onChange={e=>setIds(e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/></td>
              <td><button disabled={ocupado} onClick={()=>abrir(item)}>{item.id.slice(0,12)}</button></td><td>{item.praca}</td><td>{item.motivo}</td><td>{equipe.find(p=>p.id===item.responsavel_id)?.nome || (item.responsavel_id?'Atribuído':'Sem responsável')}</td></tr>)}</tbody>
            </table><Paginacao coluna={c} mudar={p=>{setIds([]);setPaginas({lote:p})}}/></div>)}
        </section> :
        <section aria-label="Carteira em Kanban" className="kanban">{colunas.map(c=><section className="kanban-col" key={c.etapa}>
          <h2>{etapas[c.etapa]} <small>{c.total}</small></h2>
          {c.casos.map(item=><article key={item.id}>
            <small>{item.semana_entrada} · {item.prioridade}</small>
            <h3>{item.motivo}</h3><p>{item.praca}</p>
            {item.proximo_contato && <p>Retorno em {item.proximo_contato}</p>}
            <button disabled={ocupado} onClick={()=>abrir(item)}>Abrir caso</button>
            {item.aberto && <label>Mover para<select disabled={ocupado} value={item.etapa} onChange={e=>salvar('mover_caso',{p_id:item.id,p_etapa:e.target.value},'Etapa atualizada.')}>
              {Object.entries(etapas).slice(0,3).map(([id,t])=><option key={id} value={id}>{t}</option>)}
            </select></label>}
          </article>)}
          <Paginacao coluna={c} mudar={p=>setPaginas({...paginas,[c.etapa]:p})}/>
        </section>)}</section>}
    </>}
  </main>
}

function Paginacao({coluna,mudar}) {
  if (!coluna.total) return <p>Nenhum caso.</p>
  return <div className="toolbar">
    <button disabled={!coluna.pagina} onClick={()=>mudar(coluna.pagina-1)}>Anterior</button>
    <small>{coluna.pagina+1} de {Math.ceil(coluna.total/limite)}</small>
    <button disabled={(coluna.pagina+1)*limite>=coluna.total} onClick={()=>mudar(coluna.pagina+1)}>Próxima</button>
  </div>
}

function Detalhe({caso,contatos,evolucao,ocupado,fechar,salvar}) {
  const [acao,setAcao]=useState('manter')
  return <section className="panel"><button onClick={fechar}>Voltar</button>
    <h2>{caso.motivo} · {caso.praca}</h2><p>{caso.id} · {etapas[caso.etapa]}</p>
    <h3>Evolução semanal</h3>
    <div className="table"><table><thead><tr><th>Semana</th><th>Prioridade</th><th>Horas online</th><th>Pedidos</th></tr></thead>
      <tbody>{evolucao.map(e=><tr key={e.semana}><td>{e.semana}</td><td>{e.prioridade}</td><td>{e.indicadores?.horas_online||'—'}</td><td>{e.indicadores?.pedidos||'—'}</td></tr>)}</tbody></table></div>
    <h3>Histórico de contatos</h3>
    {contatos.length?contatos.map(c=><p key={c.id}><b>{c.resultado}</b> · {c.canal} · {new Date(c.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}<br/>{c.observacao}</p>):<p>Nenhum contato registrado.</p>}
    {caso.aberto && <form onSubmit={e=>{
      e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget))
      salvar('registrar_contato',{p_id:caso.id,p_canal:d.canal,p_resultado:d.resultado,p_observacao:d.obs,p_acao:acao,p_data:d.data||null,p_etapa:d.etapa},'Contato registrado.')
    }}>
      <h3>Registrar atendimento</h3>
      <div className="toolbar">
        <label>Canal<select name="canal"><option>WhatsApp</option><option>Ligação</option><option>Outro</option></select></label>
        <label>Resultado<select name="resultado"><option>Respondeu</option><option>Sem resposta</option><option>Número inválido</option><option>Solicitou retorno</option><option>Retornou à operação</option><option>Recusou</option></select></label>
        <label>Etapa<select name="etapa" defaultValue={caso.etapa==='novo'?'em_contato':caso.etapa}>{Object.entries(etapas).slice(1).map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</select></label>
        <label>Retorno<select value={acao} onChange={e=>setAcao(e.target.value)}><option value="manter">Manter</option><option value="agendar">Agendar ou reagendar</option><option value="concluir">Concluir</option></select></label>
        {acao==='agendar' && <label>Data<input name="data" type="date" required/></label>}
      </div><label>Observação<textarea name="obs" maxLength={3000}/></label>
      <button className="primary" disabled={ocupado}>Salvar atendimento</button>
    </form>}
  </section>
}
