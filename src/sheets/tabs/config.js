'use strict';
/**
 * Tab Config / Legendas — explicações + listas auxiliares.
 * Conteúdo estático (não vem da DB).
 */

const { COLOR, cell, bodyCell, subHeaderCell, headerCell, titleCell } = require('../theme');
const { writeHeader, setWidths } = require('./_common');

const COL_COUNT = 4;

function section(batch, sheetId, row, title) {
  batch.updateCells(sheetId, row, 0, [[
    subHeaderCell(title),
    ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.CHARCOAL })),
  ]]);
  batch.mergeCells(sheetId, row, row + 1, 0, COL_COUNT);
  batch.setRowHeight(sheetId, row, 26);
  return row + 1;
}

function pair(batch, sheetId, row, k, v) {
  batch.updateCells(sheetId, row, 0, [[
    cell(k, { bg: COLOR.BLACK, font: { bold: true, fontSize: 10, foregroundColor: COLOR.GRAY_LIGHT }, align: 'LEFT', vAlign: 'MIDDLE' }),
    cell(v, { bg: COLOR.BLACK, font: { fontSize: 10, foregroundColor: COLOR.OFF_WHITE }, align: 'LEFT', vAlign: 'MIDDLE' }),
    cell('', { bg: COLOR.BLACK }),
    cell('', { bg: COLOR.BLACK }),
  ]]);
  batch.mergeCells(sheetId, row, row + 1, 1, COL_COUNT);
  return row + 1;
}

async function syncConfig(batch, sheetId) {
  let row = writeHeader(batch, sheetId, 'Config · Legendas & Referências', COL_COUNT);

  row = section(batch, sheetId, row, 'TIERS DE MORADOR');
  for (const [key, label, emoji] of [
    ['young_blood', 'Young Blood', '🍼'],
    ['o_gunao', 'O Gunão', '🔫'],
    ['gangster_fodido', 'Gangster Fodido', '💀'],
    ['patrao_di_zona', 'Patrão di Zona', '👑'],
  ]) row = pair(batch, sheetId, row, `${emoji} ${label}`, `tier = ${key}`);

  row = section(batch, sheetId, row, 'RESULTADOS DE SAÍDA');
  for (const [k, v] of [
    ['vitoria', '🏆 Vitória'],
    ['derrota', '💀 Derrota'],
    ['empate', '⚖️ Empate'],
    ['sem_conflito', 'Sem conflito'],
    ['abortada', '🚫 Abortada'],
  ]) row = pair(batch, sheetId, row, v, `result = ${k}`);

  row = section(batch, sheetId, row, 'TIPOS DE MOVIMENTO');
  for (const [k, v] of [
    ['entrega_morador', 'Entrega feita por morador'],
    ['entrega_oficial', 'Entrega feita por oficial'],
    ['venda_morador', 'Venda na rua'],
    ['fornecimento_org', 'Material que saiu da org para saída'],
    ['devolucao_saida', 'Material devolvido após saída'],
    ['perda_saida', 'Material perdido em saída'],
    ['consumo_saida', 'Material gasto em saída'],
  ]) row = pair(batch, sheetId, row, k, v);

  row = section(batch, sheetId, row, 'LEGENDA DE CORES (condicional)');
  for (const [k, v] of [
    ['🟢 Verde', 'Acima da média · performance forte'],
    ['🟡 Amarelo', 'Média · atenção'],
    ['🔴 Vermelho', 'Abaixo · acção necessária'],
    ['🔴 Dia caro', 'Muitas mortes / prejuízo'],
    ['🟢 Bom dia', 'Lucro de saídas > 500€'],
  ]) row = pair(batch, sheetId, row, k, v);

  row = section(batch, sheetId, row, 'MATERIAL vs DINHEIRO');
  for (const [k, v] of [
    ['Material (itens)', 'Entregas, vendas, progresso de tier — contam UNIDADES'],
    ['Lucro de saídas (€)', 'Valor económico das saídas (fornecido/devolvido/perdido/net)'],
    ['Promoção YB → O Gunão', '25.000 itens entregues'],
    ['Promoção O Gunão → Gangster Fodido', '50.000 itens entregues'],
  ]) row = pair(batch, sheetId, row, k, v);

  row = section(batch, sheetId, row, 'SCORES');
  for (const [k, v] of [
    ['K/D', 'Kills ÷ Mortes — métrica de eficácia em combate'],
    ['Return Rate', 'Valor devolvido ÷ valor recebido — disciplina'],
    ['Survival Rate', 'Saídas sem morrer ÷ saídas totais'],
    ['Performance Score', 'Combate + sobrevivência + resultado (0-100)'],
    ['Discipline Score', 'Gestão de material durante saída (0-100)'],
    ['Hybrid Score', 'Contribuição × 0.4 + Performance × 0.4 + Fiabilidade × 0.2'],
  ]) row = pair(batch, sheetId, row, k, v);

  row += 2;
  batch.updateCells(sheetId, row, 0, [[
    cell('— Firma RedWood', { bg: COLOR.BLACK, font: { italic: true, fontSize: 10, foregroundColor: COLOR.GRAY }, align: 'RIGHT' }),
    ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.BLACK })),
  ]]);
  batch.mergeCells(sheetId, row, row + 1, 0, COL_COUNT);

  setWidths(batch, sheetId, [220, 320, 120, 120]);
}

module.exports = { syncConfig };
