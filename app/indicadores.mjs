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
