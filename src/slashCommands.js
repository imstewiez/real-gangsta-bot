'use strict';
const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('rg-setup')
    .setDescription('Configura painéis e inicializa o bot'),

  new SlashCommandBuilder()
    .setName('rg-sync-panels')
    .setDescription('Republica todos os painéis'),

  new SlashCommandBuilder()
    .setName('rg-stock')
    .setDescription('Consulta o stock atual de materiais'),

  new SlashCommandBuilder()
    .setName('rg-stock-summary')
    .setDescription('Força publicação do resumo de stock agora (no canal resumo-stock)'),

  new SlashCommandBuilder()
    .setName('rg-stock-channels')
    .setDescription('Verifica/cria os 4 canais da categoria INVENTÁRIO (entradas/saídas/ajustes/resumo)'),

  new SlashCommandBuilder()
    .setName('rg-member')
    .setDescription('Consulta ficha de um membro')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro a consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-top-week')
    .setDescription('Mostra o top semanal')
    .addStringOption(opt => opt.setName('semana').setDescription('atual/anterior').setRequired(false)
      .addChoices({ name: 'Semana Atual', value: 'current' }, { name: 'Semana Anterior', value: 'previous' })),

  new SlashCommandBuilder()
    .setName('rg-create-operation')
    .setDescription('Cria uma nova operação/saída'),

  new SlashCommandBuilder()
    .setName('rg-close-operation')
    .setDescription('Fecha uma operação em curso')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID da operação').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-audit')
    .setDescription('Consulta logs de auditoria')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Número de registos').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-items')
    .setDescription('Lista o catálogo de itens/materiais'),

  new SlashCommandBuilder()
    .setName('rg-add-item')
    .setDescription('Adiciona um item ao catálogo')
    .addStringOption(opt => opt.setName('nome').setDescription('Nome do item').setRequired(true))
    .addStringOption(opt => opt.setName('categoria').setDescription('Categoria').setRequired(true))
    .addStringOption(opt => opt.setName('unidade').setDescription('Unidade de medida').setRequired(false))
    .addNumberOption(opt => opt.setName('valor').setDescription('Valor estimado').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-sync-sheets')
    .setDescription('Exporta dados para Google Sheets'),

  new SlashCommandBuilder()
    .setName('rg-sync-structure')
    .setDescription('Sincroniza a estrutura do Discord com o template')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run (mostrar)', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-sync-perms')
    .setDescription('Só permissões — aperta perms + renomeia painéis (não mexe em categorias)')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-sync-roles')
    .setDescription('Reconcilia invariantes de roles em todos os membros')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-fix-tiers')
    .setDescription('Sincroniza DB.tier com os roles actuais do Discord (promoções manuais incluídas)')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-bootstrap-stock')
    .setDescription('Importa stock inicial de full-inventory.json (auditável)')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' }))
    .addBooleanOption(opt => opt.setName('force').setDescription('Reaplicar mesmo que já tenha corrido').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-kill')
    .setDescription('Regista uma kill no cemitério'),

  new SlashCommandBuilder()
    .setName('rg-cemetery')
    .setDescription('Leaderboard do cemitério'),

  new SlashCommandBuilder()
    .setName('rg-version')
    .setDescription('Mostra versão/identidade desta instância do bot'),

  new SlashCommandBuilder()
    .setName('rg-revert-residents')
    .setDescription('Reverte canais de moradores ao nome anterior aos renames do bot (via audit log)')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-revert-sync')
    .setDescription('Reverte TODOS os renames/moves feitos pelo bot nos últimos N min (mantém canais criados)')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' }))
    .addIntegerOption(opt => opt.setName('minutos').setDescription('Janela de tempo em minutos (default 60)').setRequired(false)),

  // ── Rádio ─────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-radio')
    .setDescription('Mostra o painel de rádio (publica no canal actual ou em RADIO_PUBLISH_CHANNEL_ID)'),

  new SlashCommandBuilder()
    .setName('rg-radio-set')
    .setDescription('Define o valor de uma rádio')
    .addStringOption(opt => opt.setName('tipo').setDescription('principal ou parceria').setRequired(true)
      .addChoices({ name: 'Principal', value: 'principal' }, { name: 'Parceria', value: 'parceria' }))
    .addStringOption(opt => opt.setName('valor').setDescription('Valor da rádio (4 dígitos default 1000-9999)').setRequired(true))
    .addStringOption(opt => opt.setName('nota').setDescription('Nota opcional').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-radio-random')
    .setDescription('Gera uma rádio aleatória para o tipo indicado')
    .addStringOption(opt => opt.setName('tipo').setDescription('principal ou parceria').setRequired(true)
      .addChoices({ name: 'Principal', value: 'principal' }, { name: 'Parceria', value: 'parceria' })),

  new SlashCommandBuilder()
    .setName('rg-radio-history')
    .setDescription('Mostra o histórico de alterações de rádio')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Número de registos (default 15)').setRequired(false)),

  // ── Sticky messages ───────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-sticky-set')
    .setDescription('Configura uma sticky message num canal (modo update ou repost)')
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal alvo').setRequired(true))
    .addStringOption(opt => opt.setName('source').setDescription('Source key (ex: availability:daily, radio:current)').setRequired(true))
    .addStringOption(opt => opt.setName('modo').setDescription('update (edita) ou repost (republica)').setRequired(true)
      .addChoices({ name: 'update (edita a mesma)', value: 'update' }, { name: 'repost (republica)', value: 'repost' }))
    .addIntegerOption(opt => opt.setName('threshold_msgs').setDescription('Repost após N mensagens novas (modo repost)').setRequired(false))
    .addIntegerOption(opt => opt.setName('threshold_minutes').setDescription('Repost após N minutos (modo repost)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-sticky-remove')
    .setDescription('Remove uma sticky message')
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal').setRequired(true))
    .addStringOption(opt => opt.setName('source').setDescription('Source key').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-sticky-refresh')
    .setDescription('Força refresh de uma sticky')
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal').setRequired(true))
    .addStringOption(opt => opt.setName('source').setDescription('Source key').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-sticky-list')
    .setDescription('Lista as sticky messages activas'),

  // ── Disponibilidade diária ────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-availability-create')
    .setDescription('Publica a chamada de disponibilidade do dia')
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal onde publicar (default: AVAILABILITY_CHANNEL_ID)').setRequired(false))
    .addStringOption(opt => opt.setName('horarios').setDescription('Horários separados por vírgula (ex: 20:30,21:30,22:30)').setRequired(false))
    .addStringOption(opt => opt.setName('cabecalho').setDescription('Cabeçalho/título (default: aleatório)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-availability-close')
    .setDescription('Fecha a sessão de disponibilidade do dia')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID da sessão (default: última do canal)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-availability-summary')
    .setDescription('Mostra o resumo de votos de uma sessão')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID da sessão (default: última do canal)').setRequired(false)),
];

module.exports = { commands };
