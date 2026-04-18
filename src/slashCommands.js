'use strict';
const { SlashCommandBuilder } = require('discord.js');

// ══════════════════════════════════════════════════════════════════════════════
// Slash commands — 10 comandos, todos de 1 palavra, sem prefixo.
//
// Painéis são a via principal. Slash commands existem como atalhos rápidos
// e acções operacionais. Toda a manutenção técnica (sync, reconcile, perms,
// precario, backfill) corre em jobs automáticos — fora da UX do utilizador.
// ══════════════════════════════════════════════════════════════════════════════

const commands = [
  // ── User-facing ────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName('versao').setDescription('Estado do bot, versão e saúde dos dados'),

  new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Stock actual (geral ou de um item)')
    .addStringOption(opt =>
      opt.setName('item').setDescription('Item específico (por casa)').setRequired(false).setAutocomplete(true)
    ),

  new SlashCommandBuilder().setName('catalogo').setDescription('Catálogo de materiais com preços'),

  new SlashCommandBuilder()
    .setName('ficha')
    .setDescription('Ficha de um membro')
    .addUserOption(opt => opt.setName('membro').setDescription('Quem consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('movimento')
    .setDescription('Movimento no bairro — o teu cockpit pessoal (material, PvP, progressão)'),

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Rankings da firma')
    .addStringOption(opt =>
      opt
        .setName('periodo')
        .setDescription('Período')
        .setRequired(false)
        .addChoices(
          { name: 'Semanal', value: 'week' },
          { name: 'Mensal', value: 'month' },
          { name: 'Histórico', value: 'alltime' }
        )
    ),

  new SlashCommandBuilder()
    .setName('saidas')
    .setDescription('As tuas últimas saídas')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID de uma saída específica').setRequired(false)),

  new SlashCommandBuilder().setName('kill').setDescription('Registar uma kill'),

  new SlashCommandBuilder().setName('meu-pedido').setDescription('Ver o estado do teu pedido de tag'),

  // ── Staff diagnóstico ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('sync-sheets')
    .setDescription('Diagnóstico e resync do Google Sheets (chefia)')
    .addStringOption(opt =>
      opt
        .setName('acao')
        .setDescription('status=ver estado · all=resync de todas · tab=resync de uma (default: status)')
        .setRequired(false)
        .addChoices(
          { name: 'status (ver última sync por tab)', value: 'status' },
          { name: 'all (resync de todas as tabs)', value: 'all' },
          { name: 'tab (resync de uma — preenche "tab")', value: 'tab' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('tab')
        .setDescription('Tab a resync (obrigatório se acao=tab)')
        .setRequired(false)
        .addChoices(
          { name: 'dashboard', value: 'dashboard' },
          { name: 'resumo', value: 'resumo' },
          { name: 'membros', value: 'membros' },
          { name: 'saidas', value: 'saidas' },
          { name: 'stock', value: 'stock' },
          { name: 'config', value: 'config' }
        )
    ),

  // ── Staff operacional ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Logs de auditoria')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Registos (default 20)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Mover material entre casas')
    .addStringOption(opt => opt.setName('item').setDescription('Item').setRequired(true).setAutocomplete(true))
    .addIntegerOption(opt => opt.setName('quantidade').setDescription('Unidades').setRequired(true).setMinValue(1))
    .addStringOption(opt =>
      opt
        .setName('de')
        .setDescription('Origem')
        .setRequired(true)
        .addChoices({ name: 'Armazém', value: 'armazem' }, { name: 'Grupo', value: 'grupo' })
    )
    .addStringOption(opt =>
      opt
        .setName('para')
        .setDescription('Destino')
        .setRequired(true)
        .addChoices({ name: 'Armazém', value: 'armazem' }, { name: 'Grupo', value: 'grupo' })
    )
    .addStringOption(opt => opt.setName('nota').setDescription('Nota').setRequired(false)),
];

module.exports = { commands };
