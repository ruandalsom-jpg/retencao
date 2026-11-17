'use client'

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { hoje, normalize } from './operacao.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const db = url && key ? createClient(url, key) : null
const etapas = { novo:'Novos casos', em_contato:'Em contato', aguardando:'Aguardando retorno', recuperado:'Recuperados', encerrado:'Encerrados' }
const selecaoCampos = 'id,entregador_id,praca,semana_entrada,motivo,prioridade,responsavel_id,aberto,etapa,proximo_contato'
const limite = 20

function Badge({valor}) {
  const chave=normalize(valor).replace(/[^a-z0-9]+/g,'-')
  return <span className={'badge badge-'+chave}>{{media:'Média',reativacao:'Reativação'}[chave] || valor || '—'}</span>
}
function dataBR(valor) {
  return valor ? valor.split('-').reverse().join('/') : '—'
}
function indicador(valor) { return valor==null || valor==='' ? '—' : valor }

async function lerHistorico(consulta) {
  const registros=[]
  const tamanho=200
  for (let inicio=0;;inicio+=tamanho) {
    const {data,error}=await consulta().range(inicio,inicio+tamanho-1)
    if (error) throw error
    registros.push(...data)
    if (data.length<tamanho) return registros
  }
}

export default function Home() {
  const [cadastro,setCadastro] = useState(false)
  const [mensagem,setMensagem] = useState('')
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
    setOcupado(true);setErro('');setMensagem('')
    try {
      const email=String(form.get('email')).trim()
      const password=String(form.get('senha'))
      if (cadastro) {
        const nome=String(form.get('nome')).trim()
        if (!nome) { setErro('Informe seu nome.'); return }
        const {data,error}=await db.auth.signUp({
          email,password,options:{data:{nome},emailRedirectTo:window.location.origin},
        })
        if (error?.code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(error?.message || '')) {
          setErro('O envio do e-mail de confirmação atingiu o limite. Aguarde antes de tentar novamente ou peça ajuda ao supervisor.')
        } else if (error?.code === 'email_address_not_authorized') {
          setErro('O serviço de e-mail ainda não pode enviar a confirmação para este endereço. Fale com o supervisor.')
        } else if (error) setErro(error.message)
        else if (!data.session) {
          setCadastro(false)
          setMensagem('Confira seu e-mail para confirmar o cadastro. Depois, aguarde a aprovação do supervisor.')
        }
      } else {
        const {error}=await db.auth.signInWithPassword({email,password})
        if (error) setErro('Não foi possível entrar. Confira o e-mail e a senha ou fale com o supervisor.')
      }
    } catch { setErro('Conexão indisponível. Tente novamente.') }
    finally { setOcupado(false) }
  }
  if (sessao) return <CRM key={sessao.user.id} usuario={sessao.user.id}/>
  return <main className="login-shell"><section className="panel login">
    <span className="brand">Operações</span><h1>Retenção de Frota</h1><p>Acesse sua carteira de entregadores.</p>
    {!db ? <p className="aviso">Conexão com o Supabase pendente neste ambiente.</p> :
      sessao===undefined ? <p role="status">Verificando sessão…</p> :
      <form key={cadastro?'cadastro':'login'} onSubmit={entrar}>
        {cadastro && <label>Nome<input name="nome" autoComplete="name" maxLength={150} required/></label>}
        <label>E-mail<input type="email" name="email" autoComplete="username" required/></label>
        <label>Senha<input type="password" name="senha" autoComplete={cadastro?"new-password":"current-password"} minLength={cadastro?8:undefined} required/></label>
        <button className="primary" disabled={ocupado}>{ocupado?'Aguarde…':cadastro?'Criar conta':'Entrar'}</button>
        <button type="button" disabled={ocupado} onClick={()=>{setCadastro(!cadastro);setErro('');setMensagem('')}}>{cadastro?'Voltar ao login':'Criar uma conta'}</button>
      </form>}
    {mensagem && <p className="aviso" role="status">{mensagem}</p>}
    {erro && <p className="erro" role="alert">{erro}</p>}
    <p><Link href="/demo">Abrir demonstração com dados fictícios</Link></p>
  </section></main>
}

function CRM({usuario}) {
  const [perfil,setPerfil]=useState(null)
  const [pendente,setPendente]=useState(false)
  const [revisao,reverPerfil]=useState(0)
  const [pedidos,setPedidos]=useState([])
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
  const [visao,setVisao]=useState('lista')
  const [busca,setBusca]=useState('')
  const [prioridade,setPrioridade]=useState('')
  const [etapaFiltro,setEtapaFiltro]=useState('')
  const [praca,setPraca]=useState('')
  const [recorteRetornos,setRecorteRetornos]=useState('todos')
  const [linha,setLinha]=useState(null)
  const [modoLinha,setModoLinha]=useState('evolucao')
  const [erroLinha,setErroLinha]=useState('')
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
      setPendente(!error && !data)
      if (error) setErro('Não foi possível consultar seu perfil. Verifique a configuração do banco.')
      if (error || !data) setCarregando(false)
    })
    return ()=>{ativo=false}
  },[usuario,revisao])
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
    if (aba==='Acessos') {
      db.rpc('pedidos_de_acesso').then(({data,error})=>{
        if (!ativo) return
        if (error) {setPedidos([]);setErro(error.message)}
        else setPedidos(data)
        setCarregando(false)
      })
      return ()=>{ativo=false}
    }
    const chaves=aba==='Distribuição'?['lote']:aba==='Retornos'?['retornos']:aba==='Carteira'&&visao==='lista'?['lista']:Object.keys(etapas)
    Promise.all(chaves.map(async etapa=>{
      const pagina=paginas[etapa]||0
      let consulta=db.from('casos').select(selecaoCampos,{count:'exact'}).order('semana_entrada',{ascending:false}).order('id')
      if (etapa==='lote') consulta=consulta.eq('aberto',true)
      else if (etapa==='retornos') {
        consulta=db.from('casos').select(selecaoCampos,{count:'exact'}).eq('aberto',true)
          .not('proximo_contato','is',null).order('proximo_contato').order('id')
        const dia=hoje()
        if (recorteRetornos==='vencidos') consulta=consulta.lt('proximo_contato',dia)
        if (recorteRetornos==='hoje') consulta=consulta.eq('proximo_contato',dia)
        if (recorteRetornos==='futuros') consulta=consulta.gt('proximo_contato',dia)
      } else if (etapa==='lista') {
        consulta=db.from('casos').select(selecaoCampos+',subpraca:dados_origem->>Subpraça Principal,evolucao_semanal(semana,prioridade)',{count:'exact'})
          .order('semana_entrada',{ascending:false}).order('id')
          .order('semana',{referencedTable:'evolucao_semanal',ascending:false})
          .limit(1,{referencedTable:'evolucao_semanal'})
      } else consulta=consulta.eq('etapa',etapa)
      if (aba==='Carteira' || aba==='Distribuição') {
        const trecho=busca.trim().replace(/[^\p{L}\p{N} ._-]/gu,'').trim()
        if (trecho) consulta=consulta.or('id.ilike.%'+trecho+'%,entregador_id.ilike.%'+trecho+'%,motivo.ilike.%'+trecho+'%')
        if (prioridade) consulta=consulta.in('prioridade',prioridade==='Média'?['Media','Média']:prioridade==='Reativação'?['Reativacao','Reativação']:[prioridade])
        if (etapaFiltro) consulta=consulta.eq('etapa',etapaFiltro)
      }
      if (praca.trim()) consulta=consulta.ilike('praca','%'+praca.trim()+'%')
      if (semana) consulta=consulta.eq('semana_entrada',semana)
      if (supervisor && filtro) consulta=filtro==='livre'?consulta.is('responsavel_id',null):consulta.eq('responsavel_id',filtro)
      const {data,count,error}=await consulta.range(pagina*limite,pagina*limite+limite-1)
      if (error) throw error
      return {etapa,pagina,total:count,casos:data}
    })).then(dados=>{if(ativo)setColunas(dados.map(coluna=>({...coluna,aba,visao})))})
      .catch(e=>{if(ativo){setColunas([]);setErro(e.message)}})
      .finally(()=>{if(ativo)setCarregando(false)})
    return ()=>{ativo=false}
  },[perfil,aba,paginas,semana,praca,filtro,versao,supervisor,recorteRetornos,visao,busca,prioridade,etapaFiltro])

  useEffect(()=>{
    if (!supervisor || aba!=='Dashboard') return
    let ativo=true
    setLinha(null);setErroLinha('')
    async function carregar() {
      const consolidado=new Map()
      const entrada=modoLinha==='entrada'
      const caminho=entrada?'':'casos.'
      const tamanho=500
      for (let inicio=0; ativo; inicio+=tamanho) {
        let consulta=entrada
          ? db.from('casos').select('semana_entrada,prioridade').order('id')
          : db.from('evolucao_semanal').select('semana,prioridade,casos!inner()').order('caso_id').order('semana')
        if (semana) consulta=consulta.eq(caminho+'semana_entrada',semana)
        if (praca.trim()) consulta=consulta.ilike(caminho+'praca','%'+praca.trim()+'%')
        if (filtro) consulta=filtro==='livre'?consulta.is(caminho+'responsavel_id',null):consulta.eq(caminho+'responsavel_id',filtro)
        const {data,error}=await consulta.range(inicio,inicio+tamanho-1)
        if (error) throw error
        for (const row of data) {
          const periodo=row.semana || row.semana_entrada
          const chave=normalize(row.prioridade)
          const grupo=consolidado.get(periodo) || {alta:0,media:0,monitoramento:0,reativacao:0,outros:0}
          grupo[Object.hasOwn(grupo,chave)?chave:'outros']++
          consolidado.set(periodo,grupo)
        }
        if (data.length<tamanho) break
      }
      if (ativo) setLinha([...consolidado].sort(([a],[b])=>b.localeCompare(a)))
    }
    carregar().catch(()=>{if(ativo)setErroLinha('Não foi possível carregar a evolução semanal.')})
    return ()=>{ativo=false}
  },[supervisor,aba,semana,praca,filtro,modoLinha,versao])

  const exibidas=colunas.filter(c=>c.aba===aba && c.visao===visao)
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
      const [e,c,origem]=await Promise.all([
        lerHistorico(()=>db.from('evolucao_semanal').select('semana,prioridade,indicadores').eq('caso_id',caso.id).order('semana',{ascending:false})),
        lerHistorico(()=>db.from('contatos').select('id,canal,resultado,observacao,criado_em,retorno').eq('caso_id',caso.id).order('id',{ascending:false})),
        db.from('casos').select('dados_origem').eq('id',caso.id).maybeSingle(),
      ])
      if (origem.error) throw origem.error
      setDetalhe({caso:{...caso,dados_origem:origem.data?.dados_origem},evolucao:e,contatos:c})
    } catch(e) {setErro(e.message)}
    finally {setOcupado(false)}
  }

  return <main>
    <header><div><span className="brand">Operações</span><h1>Retenção de Frota</h1></div><div className="toolbar"><span>{perfil?.nome}</span><button onClick={()=>db.auth.signOut()}>Sair</button></div></header>
    {erro && <p className="erro" role="alert">{erro}</p>}{aviso && <p className="aviso" role="status">{aviso}</p>}
    {pendente && <section className="panel"><h2>Conta aguardando aprovação</h2>
      <p>Peça ao supervisor para aprovar seu cadastro em Acessos.</p>
      <button onClick={()=>{setErro('');reverPerfil(v=>v+1)}}>Verificar aprovação</button>
    </section>}
    {perfil && <>
      <nav className="toolbar">{['Carteira','Retornos',...(supervisor?['Distribuição','Dashboard','Acessos']:[])].map(t=><button key={t} aria-current={t===aba?'page':undefined} onClick={()=>{setAba(t);recorte()}}>{t}</button>)}</nav>
      {!detalhe && aba!=='Acessos' && <section className="panel toolbar" aria-label="Filtros">
        {(aba==='Carteira'||aba==='Distribuição') && <>
          <label>Buscar caso, UUID ou motivo<input value={busca} onChange={e=>{setBusca(e.target.value);recorte()}}/></label>
          <label>Prioridade de entrada<select value={prioridade} onChange={e=>{setPrioridade(e.target.value);recorte()}}>
            <option value="">Todas</option>{['Alta','Média','Reativação','Monitoramento'].map(p=><option key={p}>{p}</option>)}
          </select></label>
          <label>Etapa<select value={etapaFiltro} onChange={e=>{setEtapaFiltro(e.target.value);recorte()}}>
            <option value="">Todas</option>{Object.entries(etapas).map(([id,nome])=><option key={id} value={id}>{nome}</option>)}
          </select></label>
        </>}
        <label>Semana de entrada<input value={semana} placeholder="Todas · AAAA-W00" onChange={e=>{setSemana(e.target.value);recorte()}}/></label>
        <label>Praça<input value={praca} placeholder="Todas" onChange={e=>{setPraca(e.target.value);recorte()}}/></label>
        {aba==='Retornos' && <label>Prazo<select value={recorteRetornos} onChange={e=>{setRecorteRetornos(e.target.value);recorte()}}>
          <option value="todos">Todos</option><option value="vencidos">Vencidos</option><option value="hoje">Hoje</option><option value="futuros">Futuros</option>
        </select></label>}
        {supervisor && <label>Responsável<select value={filtro} onChange={e=>{setFiltro(e.target.value);recorte()}}><option value="">Todos</option><option value="livre">Sem responsável</option>{equipe.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}
        <button onClick={()=>{setSemana('');setPraca('');setFiltro('');setBusca('');setPrioridade('');setEtapaFiltro('');setRecorteRetornos('todos');recorte()}}>Limpar filtros</button>
      </section>}
      {!detalhe && aba==='Carteira' && <div className="toolbar visualizacao" aria-label="Visualização da carteira">
        {['lista','kanban'].map(v=><button key={v} aria-pressed={visao===v} onClick={()=>{setVisao(v);recorte()}}>{v==='lista'?'Lista':'Kanban'}</button>)}
      </div>}
      {detalhe ? <Detalhe {...detalhe} ocupado={ocupado} fechar={()=>setDetalhe(null)} salvar={salvar}/> :
        carregando ? <p role="status">Carregando carteira…</p> :
        aba==='Acessos' ? <section className="panel"><h2>Cadastros aguardando aprovação</h2>
          {pedidos.length===0 && <p>Nenhum cadastro com e-mail confirmado aguardando aprovação.</p>}
          {pedidos.map(p=><article className="toolbar" key={p.id}><span><b>{p.nome}</b><small className="block">{p.email}</small></span>
            <button disabled={ocupado} onClick={()=>{
              if (confirm('Liberar o acesso de '+p.email+' como colaborador?')) salvar('aprovar_colaborador',{p_id:p.id},'Acesso liberado.')
            }}>Aprovar colaborador</button>
          </article>)}
        </section> :
        aba==='Retornos' ? <section className="panel"><h2>Retornos programados</h2>
          {exibidas.map(c=><div className="table" key={c.etapa}><table><thead><tr><th>Caso</th><th>Prazo</th><th>Situação</th><th>Praça</th><th>Motivo</th></tr></thead>
          <tbody>{c.casos.map(item=><tr key={item.id}><th scope="row"><button disabled={ocupado} onClick={()=>abrir(item)}>{item.id.slice(0,12)}</button></th>
            <td>{dataBR(item.proximo_contato)}</td><td><Badge valor={item.proximo_contato<hoje()?'Vencido':item.proximo_contato===hoje()?'Hoje':'Agendado'}/></td>
            <td>{item.praca}</td><td>{item.motivo}</td></tr>)}</tbody></table>
          <Paginacao coluna={c} mudar={p=>setPaginas({retornos:p})}/></div>)}
        </section> :
        aba==='Dashboard' ? <><section className="panel"><h2>Casos por etapa</h2><div className="cards">{exibidas.map(c=><article key={c.etapa}>
          <small>{etapas[c.etapa]}</small><strong>{c.total}</strong>
          <progress value={c.total} max={Math.max(1,colunas.reduce((n,l)=>n+l.total,0))} aria-label={etapas[c.etapa]}/>
        </article>)}</div></section>
        <section className="panel"><h2>Prioridades por semana</h2>
          <label>Visão<select value={modoLinha} onChange={e=>setModoLinha(e.target.value)}><option value="evolucao">Evolução dos casos</option><option value="entrada">Novos casos</option></select></label>
          <p>O filtro de semana seleciona os casos pela semana de entrada.</p>
          {erroLinha?<p role="alert">{erroLinha}</p>:linha===null?<p role="status">Carregando histórico…</p>:linha.length===0?<p>Sem registros no recorte.</p>:
          <div className="table"><table><thead><tr>{['Semana','Alta','Média','Monitoramento','Reativação',...(linha.some(([,g])=>g.outros)?['Outras']:[])].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead>
            <tbody>{linha.map(([s,g])=><tr key={s}><th scope="row">{s}</th>{['alta','media','monitoramento','reativacao',...(linha.some(([,v])=>v.outros)?['outros']:[])].map(k=><td key={k}>{g[k].toLocaleString('pt-BR')}</td>)}</tr>)}</tbody>
          </table></div>}
        </section></> :
        aba==='Distribuição' ? <section className="panel"><h2>Distribuição de lotes</h2>
          <div className="toolbar batch">
            <button onClick={()=>setIds(colunas[0]?.casos.filter(c=>c.responsavel_id!==dono).map(c=>c.id)||[])}>Selecionar página</button>
            <span>{ids.length} selecionados</span>
            <label>Colaborador<select value={dono} onChange={e=>setDono(e.target.value)}><option value="">Escolher</option>{equipe.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            <button className="primary" disabled={ocupado||!dono||!ids.length} onClick={()=>{
              if (confirm('Atribuir '+ids.length+' casos ao colaborador selecionado?')) salvar('atribuir_lote',{p_ids:ids,p_responsavel:dono},'Lote atribuído.')
            }}>Atribuir lote</button>
          </div>
          {exibidas.map(c=><div key={c.etapa} className="table"><table><thead><tr><th>Seleção</th><th>Caso</th><th>Praça</th><th>Motivo</th><th>Responsável</th></tr></thead>
            <tbody>{c.casos.map(item=><tr key={item.id}><td><input type="checkbox" aria-label={'Selecionar caso '+item.id} checked={ids.includes(item.id)} onChange={e=>setIds(e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/></td>
              <td><button disabled={ocupado} onClick={()=>abrir(item)}>{item.id.slice(0,12)}</button></td><td>{item.praca}</td><td>{item.motivo}</td><td>{equipe.find(p=>p.id===item.responsavel_id)?.nome || (item.responsavel_id?'Atribuído':'Sem responsável')}</td></tr>)}</tbody>
            </table><Paginacao coluna={c} mudar={p=>{setIds([]);setPaginas({lote:p})}}/></div>)}
        </section> :
        visao==='lista' ? <section className="panel"><h2>Carteira de acompanhamento</h2>
          {exibidas.map(c=><div className="table" key={c.etapa}><table className="carteira-lista"><thead><tr>
            {['Caso','Entrada','Praça / subpraça','Motivo de entrada','Prioridade de entrada','Etapa','Responsável','Retorno','Última semana','Prioridade atual'].map(t=><th scope="col" key={t}>{t}</th>)}
          </tr></thead><tbody>{c.casos.map(item=>{
            const atual=item.evolucao_semanal?.[0]
            const nome=equipe.find(p=>p.id===item.responsavel_id)?.nome || (item.responsavel_id===usuario?perfil.nome:item.responsavel_id?'Atribuído':'Sem responsável')
            return <tr key={item.id}><th scope="row"><button className="caso-link" disabled={ocupado} onClick={()=>abrir(item)}>{item.id.slice(0,12)}</button></th>
              <td>{item.semana_entrada}</td><td>{item.praca}{item.subpraca && <small className="block">{item.subpraca}</small>}</td><td>{item.motivo}</td>
              <td><Badge valor={item.prioridade}/></td><td><Badge valor={etapas[item.etapa]}/></td><td>{nome}</td><td>{dataBR(item.proximo_contato)}</td>
              <td>{atual?.semana || '—'}</td><td><Badge valor={atual?.prioridade}/></td>
            </tr>
          })}</tbody></table><Paginacao coluna={c} mudar={p=>setPaginas({lista:p})}/></div>)}
        </section> :
        <section aria-label="Carteira em Kanban" className="kanban">{exibidas.map(c=><section className="kanban-col" key={c.etapa}>
          <h2>{etapas[c.etapa]} <small>{c.total}</small></h2>
          {c.casos.map(item=><article key={item.id}>
            <small>{item.semana_entrada}</small> <Badge valor={item.prioridade}/>
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
  const ultima=evolucao[0]
  const ind=ultima?.indicadores
  const origem=caso.dados_origem || {}
  const bruto=String(ind?.dados_origem?.Celular || origem.Celular || '').replace(/[^0-9]/g,'')
  const telefone=/^[0-9]{10,11}$/.test(bruto)?'55'+bruto:/^55[0-9]{10,11}$/.test(bruto)?bruto:''
  const recente=normalize(ind?.motivo || caso.motivo)
  const pergunta=recente.includes('inativ')?'O que impediu você de operar e quando conseguiria voltar?':
    recente.includes('queda')?'O que mudou na sua disponibilidade ou na região onde você opera?':'O que ajudaria você a retomar ou manter a operação?'
  return <section className="panel"><button onClick={fechar}>Voltar</button>
    <div className="caso-diagnostico"><small>{caso.id} · Entrada {caso.semana_entrada}</small>
    <h2>{ind?.motivo || caso.motivo}</h2><Badge valor={ultima?.prioridade || caso.prioridade}/> <Badge valor={etapas[caso.etapa]}/>
    {Number(ind?.semanas_inativo)>0 && <p>{ind.semanas_inativo} semana(s) sem produção</p>}</div>
    <h3>Identificação e contexto</h3>
    <dl className="dados-driver">
      {[['UUID',caso.entregador_id],['Praça',caso.praca],['Subpraça',origem['Subpraça Principal']],['Próximo contato',dataBR(caso.proximo_contato)]].map(([rotulo,valor])=><div key={rotulo}><dt>{rotulo}</dt><dd>{valor || '—'}</dd></div>)}
    </dl>
    {caso.aberto && <article><h3>Antes da chamada</h3><p>{pergunta}</p>
      {contatos[0] && <p>Último contato · {contatos[0].resultado}</p>}
      {telefone && <a className="whatsapp" href={'https://wa.me/'+telefone} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}
    </article>}
    {ultima && <><h3>Última semana registrada · {ultima.semana}</h3>
      <p>{ind?.motivo || caso.motivo} · {ultima.prioridade}</p>
      <div className="cards">{[['Horas online',ind?.horas_online],['Pedidos',ind?.pedidos],['Ofertas',ind?.ofertas],['Rejeição (%)',ind?.rejeicao_pct]].map(([nome,valor])=><article key={nome}><small>{nome}</small><strong>{valor==null||valor===''?'—':valor}</strong></article>)}</div></>}
    <h3>Evolução semanal</h3>
    <div className="table"><table><thead><tr><th>Semana</th><th>Prioridade</th><th>Horas online</th><th>Pedidos</th><th>Ofertas</th><th>Rejeição (%)</th><th>Semanas sem produção</th></tr></thead>
      <tbody>{evolucao.map(e=><tr key={e.semana}><td>{e.semana}</td><td><Badge valor={e.prioridade}/></td>
        {['horas_online','pedidos','ofertas','rejeicao_pct','semanas_inativo'].map(k=><td key={k}>{indicador(e.indicadores?.[k])}</td>)}
      </tr>)}</tbody></table></div>
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
