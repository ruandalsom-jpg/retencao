export const equipe = ['Ana', 'Bruno', 'Camila']
export const prioridades = ['Alta', 'Média', 'Reativação', 'Monitoramento']
export const resultados = ['Respondeu', 'Sem resposta', 'Número inválido', 'Solicitou retorno', 'Retornou à operação', 'Recusou']
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
export const hoje = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'}).format(new Date())

export const cabecalhos = [
  'Semana Referência','UUID','Praça','Subpraça Principal','Sinalização','Prioridade','SH Semana',
  'SH Média 4 Sem.','Semanas Sem Produção','Celular','Pedidos','Ofertas','Aceites','Rejeitadas','UTR',
  'Aceitação (%)','Rejeição (%)','UTR histórica (4 sem.)','Aceitação histórica (%)',
  'Rejeição histórica (%)','Variação aceitação (p.p.)','Variação rejeição (p.p.)',
  'Variação SH histórica (%)','Última produção anterior','SH semana anterior','Pedidos semana anterior',
]
const prioridadePorChave = new Map(prioridades.map(p => [normalize(p), p]))
function numero(texto) {
  if (!texto) return null
  return Number(texto.includes(',') ? texto.replace(/\./g,'').replace(',','.') : texto)
}

export function lerColagem(texto) {
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  if (normalize(linhas[0]?.split('\t')[1]) === 'uuid') linhas.shift()
  if (!linhas.length) throw Error('Cole pelo menos uma linha de dados.')
  const chaves = new Set()
  const semanas = new Set()
  return linhas.map((linha, i) => {
    const c = linha.split('\t').map(v => v.trim())
    const numeroLinha = i + 1
    if (c.length !== 26) throw Error('A linha '+numeroLinha+' precisa ter 26 colunas separadas por tabulação.')
    const [semana, uuid, praca, subpraca, motivo, categoria] = c
    const prioridade = prioridadePorChave.get(normalize(categoria))
    if (!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(semana) || !uuid || !praca || !prioridade) {
      throw Error('Confira semana, UUID, praça e prioridade na linha '+numeroLinha+'.')
    }
    semanas.add(semana)
    if (semanas.size>1) throw Error('Importe uma semana fechada de cada vez.')
    const entregador = normalize(uuid)
    if (chaves.has(entregador)) throw Error('UUID duplicado na linha '+numeroLinha+'.')
    chaves.add(entregador)
    const indicadores = Object.fromEntries(cabecalhos.slice(6).map((campo,j) => {
      const indice=j+6
      const valor=[9,23].includes(indice)?c[indice]:numero(c[indice])
      if (typeof valor==='number' && !Number.isFinite(valor)) throw Error('Indicador inválido na linha '+numeroLinha+': '+campo+'.')
      return [campo,valor]
    }))
    return { semana, entregador, praca, subpraca, motivo, prioridade, indicadores }
  })
}

export function importar(base, registros, data=hoje()) {
  const casos = [...base.casos]
  const evolucao = [...base.evolucao]
  const abertos = new Map(casos.filter(c => c.status==='Aberto').map(c=>[c.entregador,c]))
  const entradas = new Set(casos.map(c=>c.entregador+'|'+c.semana))
  const historico = new Set(evolucao.map(e=>e.caso+'|'+e.semana))
  let seq = base.seq
  const resumo = { novos:0, atualizados:0, repetidos:0, fora:0 }
  for (const r of registros) {
    let caso=abertos.get(r.entregador)
    if (caso && r.semana<caso.semana) { resumo.fora++; continue }
    if (!caso) {
      if (r.prioridade==='Monitoramento' || entradas.has(r.entregador+'|'+r.semana)) { resumo.fora++; continue }
      caso={ id:'RET-'+String(++seq).padStart(6,'0'), entregador:r.entregador, semana:r.semana,
        praca:r.praca, motivo:r.motivo, prioridade:r.prioridade, responsavel:'', retorno:'', status:'Aberto', abertura:data }
      casos.push(caso)
      abertos.set(caso.entregador,caso)
      resumo.novos++
    } else if (historico.has(caso.id+'|'+r.semana)) { resumo.repetidos++; continue }
    else resumo.atualizados++
    evolucao.push({caso:caso.id,...r})
    historico.add(caso.id+'|'+r.semana)
  }
  return { base:{...base, casos, evolucao, seq}, resumo }
}

export function atribuir(base, ids, responsavel) {
  if (!equipe.includes(responsavel) || !ids.length || ids.length>50) throw Error('Escolha um responsável e até 50 casos.')
  const disponiveis=base.casos.filter(c=>ids.includes(c.id) && c.status==='Aberto' && !c.responsavel)
  if (disponiveis.length!==ids.length) throw Error('A seleção contém casos indisponíveis.')
  return {...base, casos:base.casos.map(c=>ids.includes(c.id)?{...c,responsavel}:c),
    atribuicoes:[...base.atribuicoes,...ids.map(caso=>({caso,responsavel,data:hoje()}))]}
}

export function registrar(base, id, dados) {
  const caso=base.casos.find(c=>c.id===id && c.status==='Aberto')
  if (!caso || !equipe.includes(dados.autor) || !resultados.includes(dados.resultado)) throw Error('Confira o caso, o colaborador e o resultado.')
  if (dados.acao==='agendar' && (!dados.data || dados.data<hoje())) throw Error('Escolha uma data de retorno a partir de hoje.')
  const status=dados.status || caso.status
  const retorno=status!=='Aberto' || dados.acao==='concluir'?'':dados.acao==='agendar'?dados.data:caso.retorno
  return {...base, casos:base.casos.map(c=>c.id===id?{...c,status,retorno,responsavel:c.responsavel||dados.autor}:c),
    contatos:[...base.contatos,{...dados,caso:id,retorno,registrado:hoje()}]}
}

export function proximaAcao(caso, contatos, data=hoje()) {
  if (caso.status!=='Aberto') return caso.status
  if (caso.retorno) return caso.retorno<data?'Retorno vencido':caso.retorno===data?'Retorno hoje':'Retorno agendado'
  return contatos.length?'Definir próximo passo':'Primeiro contato'
}

const vazio={casos:[],evolucao:[],contatos:[],atribuicoes:[],seq:0}
const exemplo=(semana,entregador,praca,motivo,prioridade,sh,pedidos)=>({
  semana,entregador,praca,motivo,prioridade,indicadores:{'SH Semana':sh,Pedidos:pedidos}
})
export function baseDemo() {
  const anterior=importar(vazio,[
    exemplo('2026-W45','demo-1','São Paulo','Inatividade recente','Alta',0,0),
    exemplo('2026-W45','demo-2','Fortaleza','Queda moderada','Média',4,8),
  ]).base
  return importar(anterior,[
    exemplo('2026-W46','demo-1','São Paulo','Inatividade recorrente','Média',0,0),
    exemplo('2026-W46','demo-2','Fortaleza','Com produção','Monitoramento',12,26),
    exemplo('2026-W46','demo-3','Niterói','Inatividade prolongada','Reativação',0,0),
  ]).base
}
export const colagemDemo = [
  ['2026-W47','demo-1','São Paulo','','Com produção','Monitoramento','8','4','0','','18','20','19','1','','95','5'],
  ['2026-W47','demo-4','Fortaleza','','Inatividade recente','Alta','0','12','1','','0','0','0','0'],
].map(l=>Array.from({length:26},(_,i)=>l[i]??'').join('\t')).join('\n')
