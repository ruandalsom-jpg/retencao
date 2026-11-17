'use client'

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { hoje, normalize } from './operacao.mjs'
import { Avatar, PerfilUsuario } from './perfil'
import { MeuDia, PainelAtendimentos } from './atendimentos'
import { indicador } from './indicadores.mjs'
import { useCentral, MenuLateral, CentralPendente, Distribuicao, Novidades, HistoricoLotes, PainelEquipe, UsuariosAprovados } from './central'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const db = url && key ? createClient(url, key) : null
const etapas = { novo:'Novos casos', em_contato:'Em contato', aguardando:'Aguardando retorno', recuperado:'Recuperados', encerrado:'Encerrados' }
const selecaoCampos = 'id,entregador_id,praca,semana_entrada,motivo,prioridade,responsavel_id,aberto,etapa,proximo_contato'
const limiteLista = 20
const limiteKanban = 5
const etapasAbertas = Object.keys(etapas).slice(0, 3)

function Badge({valor}) {
  const chave=normalize(valor).replace(/[^a-z0-9]+/g,'-')
  return <span className={'badge badge-'+chave}>{{media:'Média',reativacao:'Reativação'}[chave] || valor || '—'}</span>
}
function dataBR(valor) {
  return valor ? valor.split('-').reverse().join('/') : '—'
}

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
  if (sessao) return <CRM key={sessao.user.id} usuario={sessao.user.id} conta={sessao.user}/>
  return <main className="login-shell"><section className="panel login">
    <header><span className="logo-sistema"><img src="/logo.png" alt="Logo CR"/></span><span className="brand">Operações</span></header>
    <h1>Retenção de Frota</h1><p className="login-descricao">Sua carteira, seus contatos e a evolução de cada entregador em um só lugar.</p>
    <h2>{cadastro?'Crie sua conta':'Acesse sua carteira'}</h2>
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

function CRM({usuario,conta}) {
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
  const [semanasEntrada,setSemanasEntrada]=useState(null)
  const [erroSemanas,setErroSemanas]=useState(false)
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
    if(!perfil || !['Carteira','Dashboard','Retornos'].includes(aba))return
    let ativo=true
    setErroSemanas(false)
    async function carregarSemanas(){
      const semanas=[]
      while(ativo){
        let consulta=db.from('casos').select('semana_entrada').order('semana_entrada',{ascending:false}).limit(1)
        if(semanas.length)consulta=consulta.lt('semana_entrada',semanas.at(-1))
        const {data,error}=await consulta
        if(error)throw error
        if(!data.length)break
        semanas.push(data[0].semana_entrada)
      }
      if(ativo)setSemanasEntrada(semanas)
    }
    carregarSemanas().catch(()=>{if(ativo)setErroSemanas(true)})
    return()=>{ativo=false}
  },[perfil,aba,versao])
  const central=useCentral(db,perfil,versao)
  const [responsavelGestao,setResponsavelGestao]=useState('')
  const [recorteLote,setRecorteLote]=useState(null)
  const [soNovos,setSoNovos]=useState(false)
  const campos=selecaoCampos+(central.pronto?',ultima_semana,prioridade_atual,atribuido_em,visto_em':'')
  const centralAberta=['Distribuição','Novidades','Lotes','Perfil','Meu dia'].includes(aba)
  useEffect(()=>{
    if (!aviso) return
    const timer=setTimeout(()=>setAviso(''),4000)
    return ()=>clearTimeout(timer)
  },[aviso])
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
  },[perfil,supervisor,versao])
  useEffect(()=>{
    if (!perfil) return
    if(['Distribuição','Novidades','Lotes','Perfil','Meu dia'].includes(aba)){setCarregando(false);return}
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
      const limite=aba==='Carteira' && visao==='kanban' ? limiteKanban : limiteLista
      let consulta=db.from('casos').select(campos,{count:'exact'})
      if (etapa==='lote') consulta=consulta.eq('aberto',true)
      else if (etapa==='retornos') {
        consulta=db.from('casos').select(campos,{count:'exact'}).eq('aberto',true)
          .not('proximo_contato','is',null).order('proximo_contato').order('id')
        const dia=hoje()
        if (recorteRetornos==='vencidos') consulta=consulta.lt('proximo_contato',dia)
        if (recorteRetornos==='hoje') consulta=consulta.eq('proximo_contato',dia)
        if (recorteRetornos==='futuros') consulta=consulta.gt('proximo_contato',dia)
      } else if (etapa==='lista') {
        consulta=db.from('casos').select(campos+',subpraca:dados_origem->>Subpraça Principal,evolucao_semanal(semana,prioridade)',{count:'exact'})
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
      if(central.pronto && aba==='Carteira'){
        // Order in the database, before pagination: unseen assignments always lead.
        // Unassigned cases also have visto_em=null, so atribuido_em must put nulls last.
        consulta=consulta.order('visto_em',{ascending:true,nullsFirst:true})
          .order('atribuido_em',{ascending:false,nullsFirst:false})
        if(soNovos)consulta=consulta.eq('aberto',true).eq('responsavel_id',usuario).not('atribuido_em','is',null).is('visto_em',null)
        if(recorteLote){
          const rel=recorteLote.tipo==='lote'?'lote_itens':'novidade_itens'
          const coluna=recorteLote.tipo==='lote'?'lote_id':'novidade_id'
          const selecao=campos+(etapa==='lista'?',subpraca:dados_origem->>Subpraça Principal,evolucao_semanal(semana,prioridade)':'')
          consulta=consulta.select(selecao+','+rel+'!inner('+coluna+')',{count:'exact'}).eq(rel+'.'+coluna,recorteLote.id)
        }
      }
      if(etapa!=='retornos')consulta=consulta.order('semana_entrada',{ascending:false}).order('id')
      const {data,count,error}=await consulta.range(pagina*limite,pagina*limite+limite-1)
      if (error) throw error
      return {etapa,pagina,limite,total:count,casos:data}
    })).then(dados=>{
      if (!ativo) return
      const ajustes=dados.filter(c=>c.pagina>Math.max(0,Math.ceil(c.total/c.limite)-1))
      if (ajustes.length) setPaginas(valor=>({...valor,...Object.fromEntries(
        ajustes.map(c=>[c.etapa,Math.max(0,Math.ceil(c.total/c.limite)-1)])
      )}))
      else setColunas(dados.map(coluna=>({...coluna,aba,visao})))
    })
      .catch(e=>{if(ativo)setErro(e.message)})
      .finally(()=>{if(ativo)setCarregando(false)})
    return ()=>{ativo=false}
  },[perfil,aba,paginas,semana,praca,filtro,versao,supervisor,recorteRetornos,visao,busca,prioridade,etapaFiltro,central.pronto,recorteLote,soNovos,usuario])

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
  function navegar(novaAba){setResponsavelGestao('');setAba(novaAba);setRecorteLote(null);setSoNovos(false);recorte()}
  function abrirRecorte(selecao){setRecorteLote(selecao);setSoNovos(false);setSemana('');setPraca('');setFiltro('');setBusca('');setPrioridade('');setEtapaFiltro('');setVisao('lista');setAba('Carteira');recorte()}
  async function salvar(funcao, parametros, mensagem) {
    if (ocupado) return
    setOcupado(true);setErro('');setAviso('')
    try {
      const {error}=await db.rpc(funcao,parametros)
      if (error) {
        if(funcao==='alterar_papel_colaborador' && error.code==='PGRST202')
          throw Error('Ative a gestão de papéis no Supabase para liberar esta ação.')
        throw error
      }
      setDetalhe(null);setIds([]);reler(v=>v+1);setAviso(mensagem)
    } catch(e) {setErro(e.message)}
    finally {setOcupado(false)}
  }
  async function abrir(caso) {
    if (ocupado) return
    setDetalhe({caso,carregando:true})
    setOcupado(true);setErro('')
    try {
      const [e,c,origem]=await Promise.all([
        lerHistorico(()=>db.from('evolucao_semanal').select('semana,prioridade,indicadores').eq('caso_id',caso.id).order('semana',{ascending:false})),
        lerHistorico(()=>db.from('contatos').select('id,canal,resultado,observacao,criado_em,retorno').eq('caso_id',caso.id).order('id',{ascending:false})),
        db.from('casos').select('dados_origem').eq('id',caso.id).maybeSingle(),
      ])
      if (origem.error) throw origem.error
      if (!origem.data) throw Error('O caso não está mais disponível para sua conta.')
      if(central.pronto && caso.responsavel_id===usuario && !caso.visto_em){
        const {error}=await db.rpc('marcar_caso_visto',{p_id:caso.id})
        if(!error){reler(v=>v+1);central.atualizar()}
      }
      setDetalhe(atual=>atual?.caso.id===caso.id
        ? {caso:{...caso,dados_origem:origem.data.dados_origem},evolucao:e,contatos:c}
        : atual)
    } catch(e) {
      setDetalhe(atual=>atual?.caso.id===caso.id
        ? {caso,erro:e.message || 'Não foi possível carregar o caso.'}
        : atual)
    } finally {setOcupado(false)}
  }

  return <div className={perfil?'crm-shell':'crm-inicial'}>
    {perfil&&<MenuLateral perfil={perfil} aba={aba} navegar={navegar} resumo={central.resumo} foto={conta?.user_metadata?.foto_perfil}/>}
    <main className="crm-conteudo">
    <header><div><span className="brand">Retenção de Frota</span><h1>{aba==='Distribuição'?'Distribuir casos':aba==='Lotes'?'Histórico de lotes':aba}</h1></div><div className="toolbar">{central.resumo?.semana&&<span className="pill">Base · {central.resumo.semana}</span>}<button className="abrir-perfil" onClick={()=>navegar('Perfil')} aria-label="Abrir meu perfil"><Avatar foto={conta?.user_metadata?.foto_perfil} nome={perfil?.nome||conta?.user_metadata?.nome}/><span>Meu perfil</span></button></div></header>
    {erro && <p className="erro" role="alert">{erro}</p>}{aviso && <p className="aviso" role="status">{aviso}</p>}
    {pendente && <section className="panel"><h2>Conta aguardando aprovação</h2>
      <p>Peça ao supervisor para aprovar seu cadastro em Acessos.</p>
      <button onClick={()=>{setErro('');reverPerfil(v=>v+1)}}>Verificar aprovação</button>
    </section>}
    {aba==='Perfil'&&<PerfilUsuario db={db} usuario={conta} perfil={perfil}/>}
    {perfil && <>
      {aba!=='Acessos' && !centralAberta && <section className="panel toolbar" aria-label="Filtros">
        {(aba==='Carteira'||aba==='Distribuição') && <>
          <label>Buscar caso, UUID ou motivo<input value={busca} onChange={e=>{setBusca(e.target.value);recorte()}}/></label>
          <label>Prioridade de entrada<select value={prioridade} onChange={e=>{setPrioridade(e.target.value);recorte()}}>
            <option value="">Todas</option>{['Alta','Média','Reativação','Monitoramento'].map(p=><option key={p}>{p}</option>)}
          </select></label>
          <label>Etapa<select value={etapaFiltro} onChange={e=>{setEtapaFiltro(e.target.value);recorte()}}>
            <option value="">Todas</option>{Object.entries(etapas).map(([id,nome])=><option key={id} value={id}>{nome}</option>)}
          </select></label>
        </>}
        <label>Semana de entrada<select value={semana} disabled={!semanasEntrada} onChange={e=>{setSemana(e.target.value);recorte()}}>
          <option value="">{erroSemanas&&!semanasEntrada?'Semanas indisponíveis':semanasEntrada?'Todas':'Carregando semanas…'}</option>
          {semana&&!semanasEntrada?.includes(semana)&&<option value={semana}>{semana}</option>}
          {semanasEntrada?.map(item=><option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Praça<input value={praca} placeholder="Todas" onChange={e=>{setPraca(e.target.value);recorte()}}/></label>
        {aba==='Retornos' && <label>Prazo<select value={recorteRetornos} onChange={e=>{setRecorteRetornos(e.target.value);recorte()}}>
          <option value="todos">Todos</option><option value="vencidos">Vencidos</option><option value="hoje">Hoje</option><option value="futuros">Futuros</option>
        </select></label>}
        {supervisor && <label>Responsável<select value={filtro} onChange={e=>{setFiltro(e.target.value);recorte()}}><option value="">Todos</option><option value="livre">Sem responsável</option>{equipe.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}
        <button onClick={()=>{setSemana('');setPraca('');setFiltro('');setBusca('');setPrioridade('');setEtapaFiltro('');setRecorteRetornos('todos');recorte()}}>Limpar filtros</button>
      </section>}
      {aba==='Carteira'&&recorteLote&&<div className="panel toolbar"><span>Recorte: <b>{recorteLote.titulo}</b></span><button onClick={()=>{setRecorteLote(null);recorte()}}>Ver toda a carteira</button><small>Exibe os casos que você ainda pode acessar.</small></div>}
      {aba==='Carteira'&&central.pronto&&<label className="filtro-novos"><input type="checkbox" checked={soNovos} onChange={e=>{setSoNovos(e.target.checked);recorte()}}/> Novos para mim · ainda não abertos ({central.resumo?.novos||0})</label>}
      {aba==='Carteira' && <div className="toolbar visualizacao" aria-label="Visualização da carteira">
        {['lista','kanban'].map(v=><button key={v} aria-pressed={visao===v} onClick={()=>{setVisao(v);recorte()}}>{v==='lista'?'Lista':'Kanban'}</button>)}
      </div>}
      {!centralAberta && carregando && exibidas.length>0 && <span className="atualizacao-discreta" role="status">Atualizando dados…</span>}
      {aba==='Perfil'?null:aba==='Meu dia'?<MeuDia db={db} versao={versao} abrir={abrir}/>:centralAberta ? (!central.pronto?<CentralPendente central={central}/>:aba==='Distribuição'?<Distribuicao db={db} responsavelInicial={responsavelGestao} abrir={abrir} concluido={()=>reler(v=>v+1)}/>:aba==='Novidades'?<Novidades db={db} tick={central.tick} atualizar={central.atualizar} abrirRecorte={abrirRecorte}/>:<HistoricoLotes db={db} tick={central.tick} abrirRecorte={abrirRecorte}/>) :
      carregando && exibidas.length===0 ? <p role="status">Carregando carteira…</p> :
        aba==='Acessos' ? <><section className="panel"><h2>Cadastros aguardando aprovação</h2>
          {pedidos.length===0 && <p>Nenhum cadastro com e-mail confirmado aguardando aprovação.</p>}
          {pedidos.map(p=><article className="toolbar" key={p.id}><span><b>{p.nome}</b><small className="block">{p.email}</small></span>
            <button disabled={ocupado} onClick={()=>{
              if (confirm('Liberar o acesso de '+p.email+' como colaborador?')) salvar('aprovar_colaborador',{p_id:p.id},'Acesso liberado.')
            }}>Aprovar colaborador</button>
          </article>)}
        </section><UsuariosAprovados db={db} usuario={usuario} versao={versao} ocupado={ocupado}
          alterar={(p,papel)=>salvar('alterar_papel_colaborador',{p_id:p.id,p_papel:papel,p_papel_atual:p.papel},'Papel atualizado.')}/></> :
        aba==='Retornos' ? <section className="panel"><h2>Retornos programados</h2>
          {exibidas.map(c=><div className="table" key={c.etapa}><table><thead><tr><th>Caso</th><th>Prazo</th><th>Situação</th><th>Praça</th><th>Motivo</th></tr></thead>
          <tbody>{c.casos.map(item=><tr key={item.id}><th scope="row"><button disabled={ocupado} onClick={()=>abrir(item)}>{item.id.slice(0,12)}</button></th>
            <td>{dataBR(item.proximo_contato)}</td><td><Badge valor={item.proximo_contato<hoje()?'Vencido':item.proximo_contato===hoje()?'Hoje':'Agendado'}/></td>
            <td>{item.praca}</td><td>{item.motivo}</td></tr>)}</tbody></table>
          <Paginacao coluna={c} mudar={p=>setPaginas({retornos:p})}/></div>)}
        </section> :
        aba==='Dashboard' ? <><PainelAtendimentos db={db} versao={versao} equipe={equipe} abrir={abrir}/>{central.pronto&&<PainelEquipe db={db} versao={versao}
          verEtapas={id=>{setFiltro(id);recorte()}}
          gerenciar={id=>{navegar('Distribuição');setResponsavelGestao(id)}}/>}<section className="panel"><h2>Casos por etapa{filtro && ' · '+(equipe.find(c=>c.id===filtro)?.nome||'Sem responsável')}</h2><div className="cards">{exibidas.map(c=><article key={c.etapa}>
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
        visao==='lista' ? <section className="panel"><h2>Carteira de acompanhamento</h2>
          {exibidas.map(c=><div className="table" key={c.etapa}><table className="carteira-lista"><thead><tr>
            {['Caso','Entrada','Praça / subpraça','Motivo de entrada','Prioridade de entrada','Etapa','Responsável','Retorno','Última semana','Prioridade atual','Atribuído em'].map(t=><th scope="col" key={t}>{t}</th>)}
          </tr></thead><tbody>{c.casos.map(item=>{
            const atual=item.evolucao_semanal?.[0]
            const nome=equipe.find(p=>p.id===item.responsavel_id)?.nome || (item.responsavel_id===usuario?perfil.nome:item.responsavel_id?'Atribuído':'Sem responsável')
            return <tr key={item.id} className="caso-linha" onClick={()=>abrir(item)}><th scope="row"><button className="caso-link" disabled={ocupado} onClick={e=>{e.stopPropagation();abrir(item)}}>{item.id.slice(0,12)}</button>{central.pronto&&item.atribuido_em&&!item.visto_em&&<span className="badge badge-recuperados">Novo para o responsável</span>}</th>
              <td>{item.semana_entrada}</td><td>{item.praca}{item.subpraca && <small className="block">{item.subpraca}</small>}</td><td>{item.motivo}</td>
              <td><Badge valor={item.prioridade}/></td><td><Badge valor={etapas[item.etapa]}/></td><td>{nome}</td><td>{dataBR(item.proximo_contato)}</td>
              <td>{item.ultima_semana||atual?.semana || '—'}</td><td><Badge valor={item.prioridade_atual||atual?.prioridade}/></td><td>{item.atribuido_em?new Date(item.atribuido_em).toLocaleDateString('pt-BR'):'—'}</td>
            </tr>
          })}</tbody></table><Paginacao coluna={c} mudar={p=>setPaginas({lista:p})}/></div>)}
        </section> :
        <Kanban colunas={exibidas} ocupado={ocupado||carregando} abrir={abrir}
          nomeResponsavel={id=>equipe.find(p=>p.id===id)?.nome || (id===usuario?perfil.nome:id?'Atribuído':'Sem responsável')}
          mover={(id,etapa)=>salvar('mover_caso',{p_id:id,p_etapa:etapa},'Etapa atualizada.')}
          mudarPagina={(etapa,pagina)=>setPaginas(anterior=>({...anterior,[etapa]:pagina}))}/>}
      {detalhe && <PainelCaso fechar={()=>setDetalhe(null)}>
        {erro && <p className="erro" role="alert">{erro}</p>}
        {detalhe.carregando || detalhe.erro
          ? <section className="panel" aria-busy={!!detalhe.carregando}>
              <h2>Caso {detalhe.caso.id}</h2>
              {detalhe.carregando ? <p role="status">Carregando dados e histórico…</p> :
                <><p role="alert">{detalhe.erro}</p><button onClick={()=>abrir(detalhe.caso)}>Tentar novamente</button></>}
            </section>
          : <Detalhe {...detalhe} ocupado={ocupado} salvar={salvar}/>}
      </PainelCaso>}
    </>}
  </main></div>
}

function PainelCaso({fechar,children}) {
  const ref=useRef(null)
  useEffect(()=>{
    const dialog=ref.current
    dialog.showModal()
    return ()=>dialog.close()
  },[])
  return <dialog ref={ref} className="painel-caso" aria-labelledby="painel-caso-titulo"
    onCancel={e=>{e.preventDefault();fechar()}}
    onClick={e=>{if(e.target===e.currentTarget)fechar()}}>
    <div className="painel-caso-conteudo">
      <header><h2 id="painel-caso-titulo">Atendimento do entregador</h2>
        <div className="toolbar"><button onClick={fechar} aria-label="Fechar atendimento">Fechar</button></div>
      </header>
      {children}
    </div>
  </dialog>
}

function Kanban({colunas,ocupado,abrir,nomeResponsavel,mover,mudarPagina}) {
  const [arrastado,setArrastado]=useState(null)
  const [alvo,setAlvo]=useState('')
  function limpar() { setArrastado(null);setAlvo('') }
  return <section aria-label="Carteira em Kanban" className="kanban">{colunas.map(c=>{
    const podeReceber=!ocupado && arrastado && etapasAbertas.includes(c.etapa) && arrastado.etapa!==c.etapa
    return <section key={c.etapa} className={'kanban-col coluna-'+c.etapa+(alvo===c.etapa?' recebendo':'')}
      onDragOver={e=>{if(podeReceber){e.preventDefault();e.dataTransfer.dropEffect='move';setAlvo(c.etapa)}}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setAlvo('')}}
      onDrop={e=>{
        if(!podeReceber)return
        e.preventDefault()
        mover(arrastado.id,c.etapa)
        limpar()
      }}>
      <h2>{etapas[c.etapa]} <small>{c.total}</small></h2>
      {c.casos.map(item=><article key={item.id} className="kanban-card"
        data-arrastando={arrastado?.id===item.id}
        draggable={item.aberto&&!ocupado}
        onDragStart={e=>{
          e.dataTransfer.effectAllowed='move'
          e.dataTransfer.setData('text/plain',item.id)
          setArrastado({id:item.id,etapa:item.etapa})
        }} onDragEnd={limpar}>
        <button className="kanban-abrir kanban-caso-id" disabled={ocupado} onClick={()=>abrir(item)} aria-label={'Abrir caso '+item.id}>{item.id}</button>
        <div className="kanban-meta"><small>Entrada {item.semana_entrada}</small><Badge valor={item.prioridade_atual||item.prioridade}/></div>
        {item.atribuido_em&&!item.visto_em&&<span className="badge badge-recuperados">Novo para o responsável</span>}
        <small className="block">Atualização {item.ultima_semana||item.semana_entrada}</small>
        <h3><button className="kanban-abrir" disabled={ocupado} onClick={()=>abrir(item)}>{item.motivo || item.id}</button></h3>
        <p>{item.praca}</p>
        {item.proximo_contato && <Badge valor={item.proximo_contato<hoje()?'Vencido':item.proximo_contato===hoje()?'Hoje':'Agendado'}/>}
        {item.proximo_contato && <small> {dataBR(item.proximo_contato)}</small>}
        <div className="kanban-responsavel">{nomeResponsavel(item.responsavel_id)}</div>
        {item.aberto && <label>Mover para<select disabled={ocupado} value={item.etapa} onChange={e=>mover(item.id,e.target.value)}>
          {etapasAbertas.map(id=><option key={id} value={id}>{etapas[id]}</option>)}
        </select></label>}
      </article>)}
      <Paginacao coluna={c} mudar={p=>mudarPagina(c.etapa,p)}/>
    </section>
  })}</section>
}

function Paginacao({coluna,mudar}) {
  if (!coluna.total) return <p>Nenhum caso.</p>
  const limite=coluna.limite
  if (coluna.total<=limite) return null
  return <div className="toolbar">
    <button disabled={!coluna.pagina} onClick={()=>mudar(coluna.pagina-1)}>Anterior</button>
    <small>{coluna.pagina+1} de {Math.ceil(coluna.total/limite)}</small>
    <button disabled={(coluna.pagina+1)*limite>=coluna.total} onClick={()=>mudar(coluna.pagina+1)}>Próxima</button>
  </div>
}

function Detalhe({caso,contatos,evolucao,ocupado,salvar}) {
  const [acao,setAcao]=useState('manter')
  const ultima=evolucao[0]
  const ind=ultima?.indicadores
  const origem=caso.dados_origem || {}
  const bruto=String(ind?.dados_origem?.Celular || origem.Celular || '').replace(/[^0-9]/g,'')
  const telefone=/^[0-9]{10,11}$/.test(bruto)?'55'+bruto:/^55[0-9]{10,11}$/.test(bruto)?bruto:''
  const recente=normalize(ind?.motivo || caso.motivo)
  const pergunta=recente.includes('inativ')?'O que impediu você de operar e quando conseguiria voltar?':
    recente.includes('queda')?'O que mudou na sua disponibilidade ou na região onde você opera?':'O que ajudaria você a retomar ou manter a operação?'
  return <section className="panel">
    <div className="caso-diagnostico"><small>{caso.id} · Entrada {caso.semana_entrada}</small>
    <h2>{ind?.motivo || caso.motivo}</h2><Badge valor={ultima?.prioridade || caso.prioridade}/> <Badge valor={etapas[caso.etapa]}/>
    {Number(ind?.semanas_inativo)>0 && <p>{indicador(ind.semanas_inativo,'semanas_inativo')} semana(s) sem produção</p>}</div>
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
      <div className="cards">{[['Horas online','horas_online'],['Pedidos','pedidos'],['Ofertas','ofertas'],['Rejeição','rejeicao_pct']].map(([nome,tipo])=><article key={tipo}><small>{nome}</small><strong>{indicador(ind?.[tipo],tipo)}</strong></article>)}</div></>}
    <h3>Evolução semanal</h3>
    <div className="table"><table><thead><tr><th>Semana</th><th>Prioridade</th><th>Horas online</th><th>Pedidos</th><th>Ofertas</th><th>Rejeição (%)</th><th>Semanas sem produção</th></tr></thead>
      <tbody>{evolucao.map(e=><tr key={e.semana}><td>{e.semana}</td><td><Badge valor={e.prioridade}/></td>
        {['horas_online','pedidos','ofertas','rejeicao_pct','semanas_inativo'].map(k=><td key={k}>{indicador(e.indicadores?.[k],k)}</td>)}
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
