'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from './perfil'
import { Columns3, CalendarClock, Bell, UsersRound, Archive, LayoutDashboard, ShieldCheck, PanelLeftClose, PanelLeftOpen, ListTodo } from 'lucide-react'

const campos='id,entregador_id,motivo,prioridade,prioridade_atual,semana_entrada,ultima_semana,praca,responsavel_id,aberto,etapa,proximo_contato,atribuido_em,visto_em,nome_entregador:dados_origem->>NomeDriver'
const motivosPadrao=['Queda critica','Inatividade recente','Inatividade recorrente','Queda moderada','Inatividade prolongada','Em recuperacao','Historico insuficiente','Monitoramento']
const dataHora=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—'
const n=v=>Number(v||0).toLocaleString('pt-BR')
const variantes=p=>p==='Média'?['Média','Media']:p==='Reativação'?['Reativação','Reativacao']:[p]

export function useCentral(db,perfil,versao) {
  const [estado,setEstado]=useState({pronto:null,resumo:null,erro:'',tick:0})
  const [atualizacao,atualizar]=useState(0)
  useEffect(()=>{
    if(!perfil)return
    let ativo=true,pendente=false
    async function consultar(){
      if(pendente)return
      pendente=true
      try{
        const {data,error}=await db.rpc('resumo_operacao')
        if(!ativo)return
        if(error){
          const falta=['PGRST202','42883'].includes(error.code)
          setEstado(s=>({...s,pronto:falta?false:s.pronto,erro:falta?'':error.message}))
        }else setEstado(s=>({pronto:true,resumo:data,erro:'',tick:s.tick+1}))
      }catch{if(ativo)setEstado(s=>({...s,erro:'Não foi possível atualizar os avisos. Tente novamente.'}))}
      finally{pendente=false}
    }
    consultar()
    const timer=setInterval(()=>{if(!document.hidden)consultar()},45000)
    const foco=()=>consultar()
    window.addEventListener('focus',foco)
    return()=>{ativo=false;clearInterval(timer);window.removeEventListener('focus',foco)}
  },[db,perfil,versao,atualizacao])
  return {...estado,atualizar:()=>atualizar(v=>v+1)}
}

export function MenuLateral({perfil,aba,navegar,resumo,foto}) {
  const [recolhido,setRecolhido]=useState(false)
  return <aside className={'menu-lateral'+(recolhido?' recolhido':'')}>
    <div className="menu-marca"><span className="logo-sistema"><img src="/logo.png" alt="Logo CR"/></span><div className="menu-texto"><b>Retenção de Frota</b><small>Operação e relacionamento</small></div></div>
    <button className="recolher-menu" onClick={()=>setRecolhido(!recolhido)} aria-label={recolhido?'Expandir menu':'Recolher menu'} aria-expanded={!recolhido}>{recolhido?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button>
    <nav aria-label="Navegação principal">
      <small className="menu-grupo menu-texto">ACOMPANHAMENTO</small>
      {[['Meu dia',ListTodo,'Meu dia'],['Carteira',Columns3,'Carteira',resumo?.novos],['Retornos',CalendarClock,'Retornos',resumo?.retornos],['Novidades',Bell,'Novidades',resumo?.novidades],
        ...(perfil.papel==='supervisor'?[['Distribuição',UsersRound,'Distribuir casos'],['Lotes',Archive,'Histórico de lotes'],['Dashboard',LayoutDashboard,'Dashboard'],['Acessos',ShieldCheck,'Acessos']]:[])].map(([id,Icone,nome,numero],i)=><div key={id}>
          {i===4 && <small className="menu-grupo menu-texto">GESTÃO</small>}
          <button aria-label={nome+(numero?' · '+numero:'')} title={recolhido?nome:undefined} aria-current={aba===id?'page':undefined} onClick={()=>navegar(id)}><Icone size={18} aria-hidden="true"/><span className="menu-texto">{nome}</span>{numero>0 && <span className="menu-contador">{n(numero)}</span>}</button>
        </div>)}
    </nav>
    <div className="menu-rodape"><button className="abrir-perfil" onClick={()=>navegar('Perfil')} aria-label="Abrir meu perfil" aria-current={aba==='Perfil'?'page':undefined}><Avatar foto={foto} nome={perfil.nome}/><span className="menu-texto"><b>{perfil.nome}</b><small>Meu perfil</small></span></button></div>
  </aside>
}

export function CentralPendente({central}) {
  return <section className="panel"><h2>{central.pronto===false?'Ativação da central de distribuição':'Conectando à central'}</h2>
    <p>{central.pronto===false?'A atualização do banco precisa ser instalada para liberar lotes e novidades. Sua carteira e os atendimentos continuam disponíveis.':central.erro||'Verificando a conexão…'}</p>
    <button onClick={central.atualizar}>Verificar novamente</button></section>
}

function Prioridade({valor}) {return <span className={'badge badge-'+({'Alta':'alta','Media':'media','Média':'media','Reativacao':'reativacao','Reativação':'reativacao','Monitoramento':'monitoramento'}[valor]||'')}>{valor==='Media'?'Média':valor||'—'}</span>}
function Paginas({pagina,total,limite=20,mudar,ocupado}) {return <div className="toolbar paginacao-central"><small>{n(total)} registros · página {pagina+1} de {Math.max(1,Math.ceil(total/limite))}</small><button disabled={ocupado||pagina===0} onClick={()=>mudar(pagina-1)}>Anterior</button><button disabled={ocupado||(pagina+1)*limite>=total} onClick={()=>mudar(pagina+1)}>Próxima</button></div>}

const limiteFilaDistribuicao=5

export function Distribuicao({db,abrir,concluido,responsavelInicial}) {
  const [filtros,setFiltros]=useState({prioridade:'',tipo:'prioridade_atual',motivo:'',busca:'',semana:'',praca:'',responsavel:responsavelInicial||'livre'})
  const [pagina,setPagina]=useState(0),[total,setTotal]=useState(0),[casos,setCasos]=useState([])
  const [equipe,setEquipe]=useState([]),[selecionados,setSelecionados]=useState([]),[destino,setDestino]=useState('')
  const [titulo,setTitulo]=useState(''),[revisao,setRevisao]=useState(null),[erro,setErro]=useState(''),[aviso,setAviso]=useState('')
  const [carregando,setCarregando]=useState(true),[salvando,setSalvando]=useState(false),[versao,setVersao]=useState(0)
  const trava=useRef(false)
  const consulta=useCallback(()=>{
    let q=db.from('casos').select(campos,{count:'exact'}).eq('aberto',true).order('ultima_semana',{ascending:false}).order('id')
    if(filtros.prioridade)q=q.in(filtros.tipo,variantes(filtros.prioridade))
    if(filtros.motivo)q=q.ilike('motivo','%'+filtros.motivo+'%')
    const trecho=filtros.busca.trim().replace(/[^\p{L}\p{N} ._-]/gu,'').trim()
    if(trecho)q=q.or('id.ilike.%'+trecho+'%,entregador_id.ilike.%'+trecho+'%,motivo.ilike.%'+trecho+'%,dados_origem->>NomeDriver.ilike.%'+trecho+'%')
    if(filtros.semana)q=q.eq('ultima_semana',filtros.semana.trim())
    if(filtros.praca.trim())q=q.ilike('praca','%'+filtros.praca.trim()+'%')
    if(filtros.responsavel==='livre')q=q.is('responsavel_id',null)
    else if(filtros.responsavel)q=q.eq('responsavel_id',filtros.responsavel)
    return q
  },[db,filtros])
  useEffect(()=>{
    let ativo=true
    db.rpc('carga_colaboradores').then(({data,error})=>{if(!ativo)return;if(error)setErro(error.message);else setEquipe(data||[])})
    return()=>{ativo=false}
  },[db,versao])
  useEffect(()=>{
    let ativo=true;setCarregando(true);setErro('')
    consulta().range(pagina*limiteFilaDistribuicao,(pagina+1)*limiteFilaDistribuicao-1).then(({data,count,error})=>{
      if(!ativo)return
      if(error){setErro(error.message);setCasos([])}
      else {setCasos(data);setTotal(count);if(pagina>0&&pagina*limiteFilaDistribuicao>=count)setPagina(Math.max(0,Math.ceil(count/limiteFilaDistribuicao)-1))}
    }).catch(()=>{if(ativo)setErro('Falha ao consultar a fila.')}).finally(()=>{if(ativo)setCarregando(false)})
    return()=>{ativo=false}
  },[consulta,pagina,versao])
  function filtrar(chave,valor){setFiltros(f=>({...f,[chave]:valor}));setPagina(0);setSelecionados([]);setRevisao(null);setAviso('')}
  function selecionar(c){setSelecionados(lista=>lista.some(x=>x.id===c.id)?lista.filter(x=>x.id!==c.id):lista.length<50?[...lista,c]:lista)}
  async function primeiros(){
    if(trava.current)return;trava.current=true;setSalvando(true);setErro('')
    try{const {data,error}=await consulta().range(0,49);if(error)throw error;setSelecionados(data);setAviso('Selecionados os primeiros '+data.length+' casos do recorte.')}catch(e){setErro(e.message)}finally{trava.current=false;setSalvando(false)}
  }
  const colaborador=equipe.find(c=>c.id===destino)
  const jaDoDestino=selecionados.filter(c=>c.responsavel_id===destino).length
  async function enviar(){
    if(trava.current)return;trava.current=true;setSalvando(true);setErro('')
    try{
      const casos=revisao.casos.map(({id,responsavel_id})=>({id,responsavel_id}))
      const {error}=revisao.remover
        ? await db.rpc('remover_atribuicoes',{p_casos:casos})
        : await db.rpc('distribuir_lote',{p_casos:casos,p_responsavel:revisao.destino,p_titulo:revisao.titulo})
      if(error){
        if(revisao.remover && error.code==='PGRST202')throw Error('Execute a migração de remoção no Supabase para liberar esta ação.')
        throw error
      }
      setAviso(revisao.remover?'Casos devolvidos à fila sem responsável.':'Lote enviado para '+revisao.nome+'.')
      setSelecionados([]);setRevisao(null);setTitulo('');setVersao(v=>v+1);concluido()
    }catch(e){setErro(e.message);setRevisao(null);setSelecionados([]);setVersao(v=>v+1)}finally{trava.current=false;setSalvando(false)}
  }
  return <section className="distribuicao-central">
    <div className="cards"><article><small>Casos no recorte</small><strong>{carregando?'…':n(total)}</strong></article><article><small>Selecionados neste lote</small><strong>{selecionados.length}<small>de até 50</small></strong></article><article><small>Carteira do destinatário</small><strong>{colaborador?n(colaborador.ativos):'—'}{colaborador&&<small>ativos · {n(colaborador.retornos)} retornos até hoje</small>}</strong></article></div>
    {erro && <p className="erro" role="alert">{erro}</p>}{aviso&&<p className="aviso" role="status">{aviso}</p>}
    <fieldset disabled={salvando||!!revisao} className="central-fieldset">
      <div className="panel toolbar filtros-central">
        <label>Classificação<select value={filtros.tipo} onChange={e=>filtrar('tipo',e.target.value)}><option value="prioridade_atual">Prioridade atual</option><option value="prioridade">Prioridade de entrada</option></select></label>
        <label>Prioridade<select value={filtros.prioridade} onChange={e=>filtrar('prioridade',e.target.value)}><option value="">Todas</option>{['Alta','Média','Monitoramento','Reativação'].map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Motivo / sinalização<select value={filtros.motivo} onChange={e=>filtrar('motivo',e.target.value)}><option value="">Todos</option>{motivosPadrao.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
        <label>Caso, nome, UUID ou motivo<input placeholder="Nome, RET-..., UUID..." value={filtros.busca} onChange={e=>filtrar('busca',e.target.value)}/></label>
        <label>Última semana<input placeholder="AAAA-W00" value={filtros.semana} onChange={e=>filtrar('semana',e.target.value)}/></label>
        <label>Praça<input placeholder="Todas" value={filtros.praca} onChange={e=>filtrar('praca',e.target.value)}/></label>
        <label>Responsável atual<select value={filtros.responsavel} onChange={e=>filtrar('responsavel',e.target.value)}><option value="livre">Sem responsável</option><option value="">Todos · inclui transferências</option>{equipe.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <button type="button" onClick={()=>{setFiltros({prioridade:'',tipo:'prioridade_atual',motivo:'',busca:'',semana:'',praca:'',responsavel:'livre'});setPagina(0);setSelecionados([]);setRevisao(null);setAviso('')}}>Limpar filtros</button>
      </div>
      <section className="panel lote-compositor"><h2>Preparar lote</h2><div className="toolbar"><button disabled={carregando} onClick={primeiros}>Selecionar até 50 do recorte</button><button disabled={!selecionados.length} onClick={()=>{setSelecionados([]);setAviso('')}}>Limpar seleção</button><small>A seleção é mantida ao trocar de página.</small></div><div className="toolbar campos-lote">
        <label>Título do lote<input value={titulo} maxLength={120} placeholder="Ex.: W46 · Alta · São Paulo" onChange={e=>setTitulo(e.target.value)}/></label>
        <label>Enviar para<select value={destino} onChange={e=>setDestino(e.target.value)}><option value="">Escolha um colaborador</option>{equipe.map(c=><option key={c.id} value={c.id}>{c.nome} · {n(c.ativos)} ativos</option>)}</select></label>
        <button className="primary" disabled={!selecionados.length||!colaborador||jaDoDestino>0||carregando} onClick={()=>setRevisao({casos:[...selecionados],destino,nome:colaborador.nome,titulo:titulo.trim()||'Lote '+[...new Set(selecionados.map(c=>c.ultima_semana||c.semana_entrada))].sort().join(' / ')})}>Revisar lote</button>
      </div>{colaborador&&<p>Carteira de {colaborador.nome}: {n(colaborador.ativos)} → {n(Number(colaborador.ativos)+selecionados.length-jaDoDestino)} casos ativos.</p>}
      <button disabled={carregando||!selecionados.length||selecionados.some(c=>!c.responsavel_id)}
        onClick={()=>setRevisao({remover:true,casos:[...selecionados],titulo:'Remover responsável'})}>Remover responsável</button>
      {jaDoDestino>0&&<p className="erro">Remova {jaDoDestino} caso(s) que já pertencem ao destinatário.</p>}</section>
    </fieldset>
    {revisao&&<section className="panel revisao-lote" aria-labelledby="revisao-lote-titulo"><h2 id="revisao-lote-titulo">Revisar envio · {revisao.titulo}</h2>
      {revisao.remover?<p><b>{revisao.casos.length} casos voltarão para a fila sem responsável.</b> A etapa e o histórico de atendimento serão preservados.</p>:<><p><b>{revisao.casos.length} casos → {revisao.nome}</b></p><p>Últimas semanas: {[...new Set(revisao.casos.map(c=>c.ultima_semana||c.semana_entrada))].sort().join(', ')}.</p>
      <p>{revisao.casos.filter(c=>c.responsavel_id).length} transferências de outros responsáveis. Os demais casos estão sem responsável.</p>
      <p>O colaborador receberá um aviso com acesso direto ao lote. A etapa e o histórico dos casos serão preservados.</p></>}
      <div className="toolbar"><button disabled={salvando} onClick={()=>setRevisao(null)}>Voltar à seleção</button><button className="primary" disabled={salvando} onClick={enviar}>{salvando?'Salvando…':revisao.remover?'Confirmar remoção':'Confirmar envio'}</button></div>
    </section>}
    <fieldset disabled={salvando||!!revisao} className="central-fieldset">
      <section className="panel fila-distribuicao" aria-label="Fila de casos">
        <div className="table"><table><thead><tr>{['Seleção','Caso / entregador · motivo','Entrada','Última semana','Prioridade atual','Praça','Responsável'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{casos.map(c=><tr key={c.id}>
          <td><input type="checkbox" aria-label={'Selecionar '+c.id} disabled={carregando||(!selecionados.some(x=>x.id===c.id)&&selecionados.length>=50)} checked={selecionados.some(x=>x.id===c.id)} onChange={()=>selecionar(c)}/></td>
          <td><button className="caso-link" onClick={()=>abrir(c)}>{c.id.slice(0,16)}</button><small className="block">{c.nome_entregador?c.nome_entregador+' · '+c.motivo:c.motivo}</small></td><td>{c.semana_entrada}</td><td>{c.ultima_semana||c.semana_entrada}</td><td><Prioridade valor={c.prioridade_atual||c.prioridade}/></td><td>{c.praca}</td><td>{equipe.find(e=>e.id===c.responsavel_id)?.nome||(c.responsavel_id?'Atribuído':'Sem responsável')}</td>
        </tr>)}</tbody></table></div>
        {carregando?<p role="status">Atualizando fila…</p>:!casos.length&&<p>Nenhum caso no recorte.</p>}
        <Paginas pagina={pagina} total={total} limite={limiteFilaDistribuicao} ocupado={carregando} mudar={setPagina}/>
      </section>
    </fieldset>
  </section>
}

export function Novidades({db,tick,atualizar,abrirRecorte}) {
  const [dados,setDados]=useState([]),[erro,setErro]=useState(''),[aviso,setAviso]=useState(''),[pagina,setPagina]=useState(0),[total,setTotal]=useState(0),[ocupado,setOcupado]=useState(false),[carregando,setCarregando]=useState(true)
  const [remocaoAtiva,setRemocaoAtiva]=useState(false)
  useEffect(()=>{
    let ativo=true;setCarregando(true)
    const consultar=filtrar=>{
      let busca=db.from('novidades').select('*,lotes_distribuicao(titulo,quantidade,removido_do_historico_em),novidade_itens(count)',{count:'exact'})
      if(filtrar)busca=busca.is('removida_em',null)
      return busca.order('atualizado_em',{ascending:false}).order('id').range(pagina*20,pagina*20+19)
    }
    async function carregar(){
      let resultado=await consultar(true)
      const faltaColuna=resultado.error?.code==='42703'
      if(faltaColuna)resultado=await consultar(false)
      if(!ativo)return
      if(resultado.error)throw resultado.error
      setRemocaoAtiva(!faltaColuna)
      setDados(resultado.data)
      setTotal(resultado.count)
      setErro('')
      if(pagina>0&&pagina*20>=resultado.count)setPagina(Math.max(0,Math.ceil(resultado.count/20)-1))
    }
    carregar().catch(()=>{if(ativo)setErro('Não foi possível consultar as novidades.')}).finally(()=>{if(ativo)setCarregando(false)})
    return()=>{ativo=false}
  },[db,tick,pagina])
  async function ler(item){setOcupado(true);setErro('');setAviso('');try{const {error}=await db.rpc('marcar_novidade_lida',{p_id:item.id,p_versao:item.atualizado_em});if(error)throw error;atualizar()}catch(e){setErro(e.message)}finally{setOcupado(false)}}
  async function remover(item){
    setOcupado(true);setErro('');setAviso('')
    try{
      const {error}=await db.rpc('remover_novidade',{p_id:item.id})
      if(error){
        if(error.code==='PGRST202')throw Error('Execute o SQL Ativar-Remocao-de-Novidades.sql no Supabase para liberar a remoção.')
        throw error
      }
      setDados(lista=>lista.filter(x=>x.id!==item.id))
      setAviso('Notificação removida.')
      atualizar()
    }catch(e){setErro(e.message||'Não foi possível remover a notificação.')}finally{setOcupado(false)}
  }
  async function limparLidas(){
    setOcupado(true);setErro('');setAviso('')
    try{
      const {data,error}=await db.rpc('limpar_novidades_lidas')
      if(error){
        if(error.code==='PGRST202')throw Error('Execute o SQL Ativar-Remocao-de-Novidades.sql no Supabase para liberar a limpeza.')
        throw error
      }
      setAviso(data?n(data)+' notificação(ões) lida(s) removida(s).':'Nenhuma notificação lida para remover.')
      atualizar()
    }catch(e){setErro(e.message||'Não foi possível limpar as notificações.')}finally{setOcupado(false)}
  }
  return <section><div className="toolbar"><p>Novos lotes e atualizações semanais da sua carteira.</p><button onClick={atualizar}>Atualizar</button>{remocaoAtiva&&dados.some(d=>d.lida_em)&&<button disabled={ocupado||carregando} onClick={limparLidas}>Limpar lidas</button>}</div>{erro&&<p className="erro" role="alert">{erro}</p>}{aviso&&<p className="aviso" role="status">{aviso}</p>}
    {carregando&&!dados.length?<p role="status">Carregando novidades…</p>:!dados.length&&<section className="panel">Nenhuma novidade por enquanto. Os próximos lotes e importações aparecerão aqui.</section>}
    {dados.map(item=>{
      const loteRemovido=item.tipo==='lote'&&!!(item.lote_removido_em||item.lotes_distribuicao?.removido_do_historico_em)
      return <article className={'panel novidade'+(!item.lida_em?' nao-lida':'')} key={item.id}>
        <div className="toolbar"><span className={'badge'+(loteRemovido?' badge-vencido':'')}>{item.tipo==='lote'?(loteRemovido?'Lote removido':'Novo lote'):'Atualização semanal · '+item.semana}</span>{!item.lida_em&&<span className="badge badge-recuperados">Não lida</span>}<small>{dataHora(item.atualizado_em)}</small></div>
        <h2>{item.tipo==='lote'?item.lotes_distribuicao?.titulo:n(item.novidade_itens?.[0]?.count)+' casos com dados atualizados'}</h2>
        <p>{item.tipo==='lote'?(loteRemovido?'Este lote ('+n(item.lotes_distribuicao?.quantidade)+' casos) foi removido do histórico pelo supervisor. Os casos que continuam com você seguem disponíveis na carteira.':n(item.lotes_distribuicao?.quantidade)+' casos atribuídos a você.'):'Os indicadores foram atualizados. Isso não representa novos casos nem comprova o efeito do atendimento.'}</p>
        <div className="toolbar"><button className="primary" onClick={()=>abrirRecorte({tipo:'novidade',id:item.id,titulo:item.tipo==='lote'?item.lotes_distribuicao?.titulo:'Atualização '+item.semana})}>Abrir casos</button><button disabled={ocupado||!!item.lida_em} onClick={()=>ler(item)}>{item.lida_em?'Lida':'Marcar como lida'}</button>{remocaoAtiva&&<button disabled={ocupado} onClick={()=>remover(item)}>Remover notificação</button>}</div>
      </article>
    })}<Paginas pagina={pagina} total={total} ocupado={carregando||ocupado} mudar={setPagina}/>
  </section>
}

export function HistoricoLotes({db,tick,atualizar,abrirRecorte}) {
  const [dados,setDados]=useState([]),[erro,setErro]=useState(''),[pagina,setPagina]=useState(0),[total,setTotal]=useState(0),[carregando,setCarregando]=useState(true)
  const [versao,setVersao]=useState(0)
  const [removendo,setRemovendo]=useState(false)
  const [aviso,setAviso]=useState('')
  const [remocaoAtiva,setRemocaoAtiva]=useState(false)
  const [loteSelecionado,setLoteSelecionado]=useState(null)
  const dialogo=useRef(null)
  useEffect(()=>{
    if(loteSelecionado&&!dialogo.current.open)dialogo.current.showModal()
    if(!loteSelecionado&&dialogo.current.open)dialogo.current.close()
  },[loteSelecionado])
  useEffect(()=>{
    let ativo=true
    setCarregando(true)
    const consultar=filtrar=>{
      let busca=db.from('lotes_distribuicao').select('*,autor:colaboradores!supervisor_id(nome),destino:colaboradores!responsavel_id(nome),lote_itens(ultima_semana)',{count:'exact'})
      if(filtrar)busca=busca.is('removido_do_historico_em',null)
      return busca.order('criado_em',{ascending:false}).order('id').range(pagina*20,pagina*20+19)
    }
    async function carregar(){
      let resultado=await consultar(true)
      const faltaMigracao=resultado.error?.code==='42703'
      if(faltaMigracao)resultado=await consultar(false)
      if(!ativo)return
      if(resultado.error)throw resultado.error
      setRemocaoAtiva(!faltaMigracao)
      setDados(resultado.data)
      setTotal(resultado.count)
      if(pagina>0&&pagina*20>=resultado.count)setPagina(Math.max(0,Math.ceil(resultado.count/20)-1))
    }
    carregar().catch(e=>{if(ativo)setErro(e.message||'Não foi possível consultar os lotes.')})
      .finally(()=>{if(ativo)setCarregando(false)})
    return()=>{ativo=false}
  },[db,tick,pagina,versao])

  async function remover(lote){
    setLoteSelecionado(null)
    setRemovendo(true)
    setErro('')
    setAviso('')
    try{
      const {error}=await db.rpc('remover_lote_do_historico',{p_id:lote.id})
      if(error)throw error
      setDados(lista=>lista.filter(item=>item.id!==lote.id))
      setAviso('Lote removido do histórico e notificado ao destinatário.')
      setVersao(v=>v+1)
      atualizar?.()
    }catch(e){setErro(e.message||'Não foi possível remover o lote.')}
    finally{setRemovendo(false)}
  }
  return <section className="panel"><h2>Histórico de distribuição</h2>{erro&&<p className="erro" role="alert">{erro}</p>}{aviso&&<p className="aviso" role="status">{aviso}</p>}
    {!carregando&&!remocaoAtiva&&!erro&&<p>Ative a remoção do histórico no Supabase para liberar a opção.</p>}
    <div className="table"><table><thead><tr>{['Lote','Destinatário','Casos','Semanas','Distribuído por','Data','Ação'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{dados.map(l=><tr key={l.id}><td>{l.titulo}</td><td>{l.destino?.nome||'—'}</td><td>{l.quantidade}</td><td>{[...new Set(l.lote_itens.map(i=>i.ultima_semana))].sort().join(', ')}</td><td>{l.autor?.nome||'—'}</td><td>{dataHora(l.criado_em)}</td><td><button onClick={()=>abrirRecorte({tipo:'lote',id:l.id,titulo:l.titulo})}>Abrir lote</button> {remocaoAtiva&&<button disabled={removendo||carregando} onClick={()=>setLoteSelecionado(l)}>Remover do histórico</button>}</td></tr>)}</tbody></table></div>
    {!carregando&&!dados.length&&<p>Nenhum lote no histórico.</p>}<Paginas pagina={pagina} total={total} ocupado={carregando||removendo} mudar={setPagina}/>
    <dialog ref={dialogo} className="confirmacao-lote" aria-labelledby="confirmar-remocao-lote"
      aria-describedby="descricao-remocao-lote" onCancel={e=>{e.preventDefault();setLoteSelecionado(null)}}>
      <h2 id="confirmar-remocao-lote">Remover lote do histórico?</h2>
      <p id="descricao-remocao-lote">O lote <b>{loteSelecionado?.titulo}</b> sairá da lista. Os casos continuam atribuídos aos responsáveis.</p>
      <div className="toolbar">
        <button autoFocus onClick={()=>setLoteSelecionado(null)}>Cancelar</button>
        <button className="confirmar-remocao" disabled={!loteSelecionado||removendo}
          onClick={()=>remover(loteSelecionado)}>Remover do histórico</button>
      </div>
    </dialog>
  </section>
}

export function UsuariosAprovados({db,usuario,versao,alterar,ocupado}) {
  const limite=10
  const [pagina,setPagina]=useState(0)
  const [lista,setLista]=useState([])
  const [total,setTotal]=useState(0)
  const [carregando,setCarregando]=useState(true)
  const [erro,setErro]=useState('')
  useEffect(()=>{
    let ativo=true
    setCarregando(true)
    setErro('')
    db.from('colaboradores').select('id,nome,papel',{count:'exact'}).order('nome').order('id')
      .range(pagina*limite,(pagina+1)*limite-1)
      .then(({data,count,error})=>{
        if(!ativo)return
        if(error){setErro(error.message);return}
        setLista(data)
        setTotal(count)
        if(pagina>0&&pagina*limite>=count)setPagina(Math.max(0,Math.ceil(count/limite)-1))
      }).catch(()=>{if(ativo)setErro('Não foi possível consultar os usuários.')})
      .finally(()=>{if(ativo)setCarregando(false)})
    return()=>{ativo=false}
  },[db,pagina,versao])
  return <section className="panel">
    <h2>Usuários aprovados</h2>
    {erro&&<p className="erro" role="alert">{erro}</p>}
    {carregando&&<p role="status">Carregando usuários…</p>}
    {!carregando&&!erro&&!lista.length&&<p>Nenhum usuário aprovado nesta página.</p>}
    <div className="table"><table><thead><tr><th scope="col">Nome</th><th scope="col">Papel</th></tr></thead>
      <tbody>{lista.map(p=><tr key={p.id}><th scope="row">{p.nome}{p.id===usuario&&' (você)'}</th><td>
        {p.id===usuario?'Supervisor':<select aria-label={'Papel de '+p.nome} value={p.papel} disabled={ocupado||carregando||!!erro}
          onChange={e=>{
            const papel=e.target.value
            const rotulo=papel==='supervisor'?'Supervisor':'Colaborador'
            if(confirm('Alterar o papel de '+p.nome+' para '+rotulo+'?'))alterar(p,papel)
          }}><option value="colaborador">Colaborador</option><option value="supervisor">Supervisor</option></select>}
      </td></tr>)}</tbody>
    </table></div>
    <Paginas pagina={pagina} total={total} limite={limite} mudar={setPagina} ocupado={ocupado||carregando}/>
  </section>
}

export function PainelEquipe({db,versao,verEtapas,gerenciar}) {
  const [equipe,setEquipe]=useState(null)
  const [erro,setErro]=useState(false)
  useEffect(()=>{
    let ativo=true
    db.rpc('carga_colaboradores').then(({data,error})=>{
      if(!ativo)return
      setErro(!!error)
      if(!error)setEquipe(data||[])
    }).catch(()=>{if(ativo)setErro(true)})
    return()=>{ativo=false}
  },[db,versao])
  const maximo=Math.max(1,...(equipe||[]).map(c=>Number(c.ativos)))
  const maxRetornos=Math.max(1,...(equipe||[]).map(c=>Number(c.retornos)))
  return <section className="panel">
    <h2>Carteira por colaborador</h2>
    <p>Totais da equipe. Use “Ver etapas” para aplicar o colaborador aos gráficos do Dashboard.</p>
    {erro?<p role="alert">Não foi possível carregar a equipe.</p>:!equipe?<p role="status">Carregando equipe…</p>:!equipe.length?<p>Nenhum colaborador cadastrado.</p>:
      <div className="table"><table><thead><tr><th>Colaborador</th><th>Casos ativos</th><th>Retornos até hoje</th><th>Novos por abrir</th><th>Ações</th></tr></thead>
        <tbody>{equipe.map(c=><tr key={c.id}><th scope="row">{c.nome}</th>
          <td>{n(c.ativos)}<progress aria-label={c.nome+' — casos ativos'} value={c.ativos} max={maximo}/></td>
          <td>{n(c.retornos)}<progress aria-label={c.nome+' — retornos até hoje'} value={c.retornos} max={maxRetornos}/></td>
          <td>{n(c.novos)}</td><td><div className="toolbar"><button onClick={()=>verEtapas(c.id)}>Ver etapas</button><button onClick={()=>gerenciar(c.id)}>Gerenciar casos</button></div></td>
        </tr>)}</tbody>
      </table></div>}
  </section>
}
