// Sheets exports localized display strings; new imports may also contain numbers.
export function numeroIndicador(valor) {
  if (typeof valor==='number') return Number.isFinite(valor)?valor:null
  let texto=String(valor??'').trim().replace(/\s|%/g,'')
  if (!texto) return null
  if (texto.includes(',')) texto=texto.replace(/\./g,'').replace(',','.')
  if (!/^[+-]?\d+(\.\d+)?$/.test(texto)) return null
  const numero=Number(texto)
  return Number.isFinite(numero)?numero:null
}

export function indicador(valor,tipo) {
  const numero=numeroIndicador(valor)
  if (numero===null) return '—'
  const inteiro=['pedidos','ofertas','semanas_inativo'].includes(tipo)
  const texto=numero.toLocaleString('pt-BR',{maximumFractionDigits:inteiro?0:2})
  // rejeicao_pct is already in percentage points. Never infer a ratio from magnitude.
  return texto+(tipo==='horas_online'?' h':tipo==='rejeicao_pct'?'%':'')
}

const nivelPrioridade={monitoramento:4,media:3,'média':3,alta:2,reativacao:1,'reativação':1}
const pesoPrioridade=valor=>nivelPrioridade[String(valor??'').trim().toLowerCase()]??null

export function tendenciaSemanal(evolucao) {
  if (!Array.isArray(evolucao) || evolucao.length<2) return null
  const [atual,anterior]=[...evolucao].sort((a,b)=>String(b.semana||'').localeCompare(String(a.semana||'')))
  const pAtual=pesoPrioridade(atual?.prioridade), pAnterior=pesoPrioridade(anterior?.prioridade)
  if (pAtual!==null && pAnterior!==null && pAtual!==pAnterior) return pAtual>pAnterior?'melhora':'piora'
  for (const chave of ['horas_online','pedidos']) {
    const vAtual=numeroIndicador(atual?.indicadores?.[chave]), vAnterior=numeroIndicador(anterior?.indicadores?.[chave])
    if (vAtual!==null && vAnterior!==null && vAtual!==vAnterior) return vAtual>vAnterior?'melhora':'piora'
  }
  return null
}
