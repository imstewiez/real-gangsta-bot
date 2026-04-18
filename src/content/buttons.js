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
    // Label user-facing canonical: "Dar a Cara" — tom RP imersivo,
    // usado no painel de entrada público (Tier 1). "Pedir Tag" fica
    // como termo técnico em logs e slash /meu-pedido.
    PEDIR_TAG: { label: 'Dar a Cara', emoji: E.TAG, style: STYLE.SUCCESS },
    MEU_PEDIDO: { label: 'O meu pedido', emoji: '🔎', style: STYLE.SECONDARY },
  },

  BAIRRISTA: {
    ENTREGA: { label: 'Registar Material', emoji: E.MATERIAL, style: STYLE.SUCCESS },
    MOVIMENTO: { label: 'Movimento no Bairro', emoji: E.FIRMA, style: STYLE.PRIMARY },
    RANKING: { label: 'Ranking', emoji: E.MEDAL_1, style: STYLE.PRIMARY },
  },

  PATRAO: {
    LISTAR: { label: 'Listar Bairristas', emoji: E.PARTICIPANTE, style: STYLE.PRIMARY },
    ENTREGAS: { label: 'Entregas da Zona', emoji: E.MATERIAL, style: STYLE.SECONDARY },
    VENDAS: { label: 'Vendas da Zona', emoji: E.LUCRO, style: STYLE.SECONDARY },
    TOPOS: { label: 'Topo da Zona', emoji: E.TOPO, style: STYLE.SECONDARY },
  },

  OFICIAL: {
    REGISTAR: { label: 'Registar Material', emoji: E.MATERIAL, style: STYLE.SUCCESS },
    VALIDAR: { label: 'Validar Entrega', emoji: E.OK, style: STYLE.SUCCESS },
    // Canonizado com PATRAO.LISTAR — mesma acção, mesmo label.
    MEMBROS: { label: 'Listar Bairristas', emoji: E.PARTICIPANTE, style: STYLE.PRIMARY },
  },

  CHEFIA: {
    // Saídas — termo canónico é "Saída", não "Sessão" (ver docs/VOICE_AND_UX.md § 3).
    CRIAR_SAIDA: { label: 'Abrir Saída', emoji: E.NOVO, style: STYLE.SUCCESS },
    VER_SAIDAS: { label: 'Ver Saídas', emoji: E.VER, style: STYLE.PRIMARY },
    // Stock
    VER_STOCK: { label: 'Ver Stock', emoji: E.STOCK, style: STYLE.PRIMARY },
    AJUSTAR_STOCK: { label: 'Ajustar Stock', emoji: E.AJUSTAR, style: STYLE.SECONDARY },
    GERIR_MATERIAIS: { label: 'Gerir Materiais', emoji: E.EDITAR, style: STYLE.SECONDARY },
    // Gestão + Dados
    RADIO: { label: 'Painel Rádio', emoji: E.RADIO, style: STYLE.PRIMARY },
    STICKYS: { label: 'Stickys', emoji: E.STICKY, style: STYLE.SECONDARY },
    TOPS: { label: 'Topo', emoji: E.TOPO, style: STYLE.SECONDARY },
    LOGS: { label: 'Logs', emoji: E.AUDIT, style: STYLE.SECONDARY },
  },

  // Onboarding — aprovação/rejeição de tags
  ONBOARDING: {
    APROVAR: { label: 'Aprovar', emoji: E.OK, style: STYLE.SUCCESS },
    NEGAR: { label: 'Negar', emoji: E.ERRO, style: STYLE.DANGER },
  },

  // Inventário (canal individual do bairrista)
  INVENTORY: {
    REGISTAR: { label: 'Registar Material', emoji: E.MATERIAL, style: STYLE.SUCCESS },
    ENCOMENDAR: { label: 'Encomendar', emoji: E.FORNECER, style: STYLE.PRIMARY },
    HISTORICO: { label: 'Histórico', emoji: E.AUDIT, style: STYLE.SECONDARY },
    PROGRESSO: { label: 'Progresso', emoji: E.TOPO, style: STYLE.PRIMARY },
    TOP_SEMANAL: { label: 'Topo Semanal', emoji: E.TOPO, style: STYLE.SECONDARY },
  },

  // Saídas (wizard/participantes)
  SAIDAS: {
    ADD_PART: { label: 'Adicionar Nome', emoji: E.PARTICIPANTE, style: STYLE.SUCCESS },
    REMOVE_PART: { label: 'Remover Nome', emoji: E.APAGAR, style: STYLE.DANGER },
    MATERIAL_IN: { label: 'Dar Material', emoji: E.FORNECER, style: STYLE.SUCCESS },
    MATERIAL_OUT: { label: 'Devolver Material', emoji: E.DEVOLVER, style: STYLE.PRIMARY },
    SETTLE: { label: 'Fechar Resultado', emoji: E.FECHAR, style: STYLE.DANGER },
  },

  // Rádio
  RADIO: {
    SET_PRIMARY: { label: 'Definir Principal', emoji: E.EDITAR, style: STYLE.PRIMARY },
    SET_PARTNER: { label: 'Definir Parceria', emoji: E.EDITAR, style: STYLE.PRIMARY },
    RANDOM_PRIMARY: { label: 'Random Principal', emoji: E.REFRESH, style: STYLE.SECONDARY },
    RANDOM_PARTNER: { label: 'Random Parceria', emoji: E.REFRESH, style: STYLE.SECONDARY },
    SWAP: { label: 'Trocar', emoji: E.REFRESH, style: STYLE.SECONDARY },
    HISTORY: { label: 'Histórico', emoji: E.AUDIT, style: STYLE.SECONDARY },
  },

  // Disponibilidade
  AVAILABILITY: {
    VOTE_YES: { label: 'Apareço', emoji: E.DISPONIVEL, style: STYLE.SUCCESS },
    VOTE_MAYBE: { label: 'Talvez', emoji: E.TALVEZ, style: STYLE.SECONDARY },
    VOTE_NO: { label: 'Não dá', emoji: E.INDISPONIVEL, style: STYLE.DANGER },
    SUMMARY: { label: 'Resumo', emoji: E.INFO, style: STYLE.SECONDARY },
    REFRESH: { label: 'Actualizar', emoji: E.REFRESH, style: STYLE.SECONDARY },
  },

  // Kills
  KILL: {
    REGISTAR: { label: 'Registar Kill', emoji: E.KILL, style: STYLE.SUCCESS },
    LEADERBOARD: { label: 'Cemitério', emoji: E.MORTE, style: STYLE.PRIMARY },
  },
};

module.exports = { BUTTONS, STYLE };
