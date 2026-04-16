'use strict';
/**
 * Labels canónicos de botões por domínio.
 *
 * Cada entrada define: label (curto, imperativo), emoji (semântico, opcional),
 * style (Success/Primary/Secondary/Danger).
 *
 * CustomIds NÃO pertencem aqui — continuam nos handlers para preservar
 * compatibilidade com mensagens antigas já publicadas.
 *
 * Regras:
 *   - Labels ≤ 20 chars
 *   - Imperativo: "Registar Material", não "Material Registration"
 *   - Mesmo emoji por acção em painéis diferentes (ex: 📦 em todos os "entregar")
 *   - Style consistente: Success para criar/registar/aprovar, Primary para ver,
 *     Secondary para consultar/histórico, Danger para fechar/negar
 */

const E = require('./emojis');

// Re-export de stubs de style para quem quiser sem importar discord.js
const STYLE = { SUCCESS: 'Success', PRIMARY: 'Primary', SECONDARY: 'Secondary', DANGER: 'Danger' };

const BUTTONS = {
  ENTRADA: {
    PEDIR_TAG:     { label: 'Pedir Tag',         emoji: E.TAG,       style: STYLE.SUCCESS },
  },

  BAIRRISTA: {
    ENTREGA:       { label: 'Registar Material', emoji: E.MATERIAL,  style: STYLE.SUCCESS },
    HISTORICO:     { label: 'Histórico',         emoji: E.AUDIT,     style: STYLE.SECONDARY },
    TOTAIS:        { label: 'Progresso',         emoji: E.TOPO,      style: STYLE.SECONDARY },
    PERFORMANCE:   { label: 'Performance',       emoji: E.KILL,      style: STYLE.PRIMARY },
    MATERIAL:      { label: 'Meu Material',      emoji: E.MATERIAL,  style: STYLE.PRIMARY },
    LUCRO:         { label: 'Meu Lucro',         emoji: E.LUCRO,     style: STYLE.PRIMARY },
  },

  PATRAO: {
    LISTAR:        { label: 'Listar Bairristas', emoji: E.PARTICIPANTE, style: STYLE.PRIMARY },
    ENTREGAS:      { label: 'Entregas da Zona',  emoji: E.MATERIAL,     style: STYLE.SECONDARY },
    VENDAS:        { label: 'Vendas da Zona',    emoji: E.LUCRO,        style: STYLE.SECONDARY },
    TOPOS:         { label: 'Topo da Zona',      emoji: E.TOPO,         style: STYLE.SECONDARY },
  },

  OFICIAL: {
    REGISTAR:      { label: 'Registar Material', emoji: E.MATERIAL,  style: STYLE.SUCCESS },
    VALIDAR:       { label: 'Validar Entrega',   emoji: E.OK,        style: STYLE.SUCCESS },
    MEMBROS:       { label: 'Lista de Nomes',    emoji: E.PARTICIPANTE, style: STYLE.PRIMARY },
  },

  CHEFIA: {
    // Grupo Saídas
    CRIAR_SAIDA:     { label: 'Saída Nova',       emoji: E.NOVO,          style: STYLE.SUCCESS },
    FECHAR_SAIDA:    { label: 'Fechar Saída',     emoji: E.FECHAR,        style: STYLE.DANGER },
    PARTICIPANTES:   { label: 'Participantes',    emoji: E.PARTICIPANTE,  style: STYLE.PRIMARY },
    MATERIAL_SAIDA:  { label: 'Material da Saída',emoji: E.MATERIAL,      style: STYLE.PRIMARY },
    VER_SAIDAS:      { label: 'Ver Saídas',       emoji: E.VER,           style: STYLE.SECONDARY },
    // Grupo Stock
    FORNECER:        { label: 'Fornecer a Nome',  emoji: E.FORNECER,      style: STYLE.SUCCESS },
    VER_STOCK:       { label: 'Ver Stock',        emoji: E.STOCK,         style: STYLE.PRIMARY },
    AJUSTAR_STOCK:   { label: 'Ajustar Stock',    emoji: E.AJUSTAR,       style: STYLE.SECONDARY },
    GERIR_MATERIAIS: { label: 'Gerir Materiais',  emoji: E.EDITAR,        style: STYLE.SECONDARY },
    // Grupo Gestão
    DISPONIBILIDADE: { label: 'Presença Hoje',    emoji: E.PRESENCA,      style: STYLE.PRIMARY },
    RADIO:           { label: 'Painel Rádio',     emoji: E.RADIO,         style: STYLE.PRIMARY },
    STICKYS:         { label: 'Stickys',          emoji: E.STICKY,        style: STYLE.SECONDARY },
    // Grupo Dados
    TOPS:            { label: 'Topo',             emoji: E.TOPO,          style: STYLE.SECONDARY },
    STATS:           { label: 'Estatísticas',     emoji: E.INFO,          style: STYLE.SECONDARY },
    LOGS:            { label: 'Logs',             emoji: E.AUDIT,         style: STYLE.SECONDARY },
  },

  // Onboarding — aprovação/rejeição de tags
  ONBOARDING: {
    APROVAR:       { label: 'Aprovar',            emoji: E.OK,            style: STYLE.SUCCESS },
    NEGAR:         { label: 'Negar',              emoji: E.ERRO,          style: STYLE.DANGER },
  },

  // Inventário (canal individual do bairrista)
  INVENTORY: {
    REGISTAR:      { label: 'Registar Material', emoji: E.MATERIAL,  style: STYLE.SUCCESS },
    ENCOMENDAR:    { label: 'Encomendar',        emoji: E.FORNECER,  style: STYLE.PRIMARY },
    HISTORICO:     { label: 'Histórico',         emoji: E.AUDIT,     style: STYLE.SECONDARY },
    PROGRESSO:     { label: 'Progresso',         emoji: E.TOPO,      style: STYLE.PRIMARY },
    TOP_SEMANAL:   { label: 'Topo Semanal',      emoji: E.TOPO,      style: STYLE.SECONDARY },
  },

  // Saídas (wizard/participantes)
  SAIDAS: {
    ADD_PART:      { label: 'Adicionar Nome',    emoji: E.PARTICIPANTE, style: STYLE.SUCCESS },
    REMOVE_PART:   { label: 'Remover Nome',      emoji: E.APAGAR,       style: STYLE.DANGER },
    MATERIAL_IN:   { label: 'Dar Material',      emoji: E.FORNECER,     style: STYLE.SUCCESS },
    MATERIAL_OUT:  { label: 'Devolver Material', emoji: E.DEVOLVER,     style: STYLE.PRIMARY },
    SETTLE:        { label: 'Fechar Resultado',  emoji: E.FECHAR,       style: STYLE.DANGER },
  },

  // Rádio
  RADIO: {
    SET_PRIMARY:   { label: 'Definir Principal', emoji: E.EDITAR,    style: STYLE.PRIMARY },
    SET_PARTNER:   { label: 'Definir Parceria',  emoji: E.EDITAR,    style: STYLE.PRIMARY },
    RANDOM_PRIMARY:{ label: 'Random Principal',  emoji: E.REFRESH,   style: STYLE.SECONDARY },
    RANDOM_PARTNER:{ label: 'Random Parceria',   emoji: E.REFRESH,   style: STYLE.SECONDARY },
    SWAP:          { label: 'Trocar',            emoji: E.REFRESH,   style: STYLE.SECONDARY },
    HISTORY:       { label: 'Histórico',         emoji: E.AUDIT,     style: STYLE.SECONDARY },
  },

  // Disponibilidade
  AVAILABILITY: {
    VOTE_YES:      { label: 'Apareço',          emoji: E.DISPONIVEL,   style: STYLE.SUCCESS },
    VOTE_MAYBE:    { label: 'Talvez',           emoji: E.TALVEZ,       style: STYLE.SECONDARY },
    VOTE_NO:       { label: 'Não dá',           emoji: E.INDISPONIVEL, style: STYLE.DANGER },
    SUMMARY:       { label: 'Resumo',           emoji: E.INFO,         style: STYLE.SECONDARY },
    REFRESH:       { label: 'Actualizar',       emoji: E.REFRESH,      style: STYLE.SECONDARY },
  },

  // Kills
  KILL: {
    REGISTAR:      { label: 'Registar Kill',    emoji: E.KILL,      style: STYLE.SUCCESS },
    LEADERBOARD:   { label: 'Cemitério',        emoji: E.MORTE,     style: STYLE.PRIMARY },
  },
};

module.exports = { BUTTONS, STYLE };
