/**
 * Adicione a um projeto Apps Script de teste. Rode sincronizarColagemSupabase
 * com a planilha de teste aberta e importe as migrações no Supabase antes.
 * Propriedades do script: RETENCAO_SUPABASE_URL e RETENCAO_SUPABASE_SECRET.
 */
function sincronizarColagemSupabase() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getSheetByName('Colar Power BI');
  if (!aba || aba.getLastRow() < 2) throw new Error('Aba Colar Power BI sem dados.');
  const dados = aba.getRange(1, 1, aba.getLastRow(), 26).getDisplayValues();
  const cabecalhos = dados.shift();
  if (cabecalhos[0] !== 'Semana Referência' || cabecalhos[1] !== 'UUID' ||
      cabecalhos[2] !== 'Praça' || cabecalhos[25] !== 'Pedidos semana anterior' ||
      new Set(cabecalhos).size !== 26 || cabecalhos.some(nome => !nome)) {
    throw new Error('Confira os 26 cabeçalhos da aba Colar Power BI.');
  }
  const ids = new Set();
  let semana = '';
  const linhas = [];
  dados.forEach((r, i) => {
    if (r.every(v => !v.trim())) return;
    const atual = r[0].trim();
    const id = r[1].trim().toLowerCase();
    if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(atual) ||
        (semana && atual !== semana) || !id || !r[2].trim() || ids.has(id)) {
      throw new Error('Confira semana, UUID e praça na linha ' + (i + 2) + '.');
    }
    semana = atual;
    ids.add(id);
    linhas.push({semana, entregador_id:id, praca:r[2].trim(), colunas:r});
  });
  if (!linhas.length) throw new Error('Aba Colar Power BI sem dados.');
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('RETENCAO_SUPABASE_URL');
  const chave = props.getProperty('RETENCAO_SUPABASE_SECRET');
  if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) || !chave) {
    throw new Error('Configure o projeto Supabase nas propriedades do script.');
  }
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Sincronizar ' + semana, 'Enviar ' + linhas.length + ' linhas para o Supabase?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const resposta = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/sincronizar_semana', {
    method:'post', contentType:'application/json', headers:{apikey:chave},
    payload:JSON.stringify({p_semana:semana,p_linhas:linhas}), muteHttpExceptions:true
  });
  if (resposta.getResponseCode() >= 300) {
    throw new Error('O Supabase recusou a sincronização (HTTP ' + resposta.getResponseCode() + ').');
  }
  ui.alert(semana + ' sincronizada. ' + Number(resposta.getContentText()) + ' linhas inseridas ou alteradas.');
}
