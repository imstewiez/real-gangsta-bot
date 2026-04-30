'use strict';
/**
 * Perfil → Histórico de movimentos.
 *
 * Mostra últimos 20 movimentos agrupados por tipo (entregas / vendas /
 * outros) com resumo no topo. Discord embed limita tamanho — usamos
 * filtro rápido por tipo via select menu.
 */

const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { safeReply, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { memberRepo, inventoryRepo } = require('../repositories');
const { buttonRow, button } = require('../shared/ui/buttons');
const { formatPtDate } = require('../shared/formatPtDate');

const fmt = n => (Number(n) || 0).toLocaleString('pt-PT');

const TYPE_EMOJI = {
  entrega_bairrista: '📥',
  entrega_oficial: '📥',
  venda_bairrista: '💰',
  fornecimento_org: '📤',
  devolucao_saida: '↩️',
  perda_saida: '❌',
  consumo_saida: '🔥',
  ajuste_manual: '⚙️',
  apreendido: '🚔',
  craftado: '🛠️',
};

const TYPE_LABEL = {
  entrega_bairrista: 'entrega',
  entrega_oficial: 'entrega oficial',
  venda_bairrista: 'venda',
  fornecimento_org: 'fornecimento',
  devolucao_saida: 'devolução saída',
  perda_saida: 'perda saída',
  consumo_saida: 'consumo saída',
  ajuste_manual: 'ajuste',
  apreendido: 'apreendido',
  craftado: 'craft',
};

async function handle(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  return render(interaction, 'all');
}

async function handleFilterSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});
  return render(interaction, interaction.values[0]);
}

async function render(interaction, filter) {
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, { content: 'Não estás registado.' }, { messageClass: 'BANAL' });
  }

  const movements = await inventoryRepo.getMemberMovements(member.id, 50);

  // Aplicar filtro
  let filtered = movements;
  if (filter === 'deliveries') {
    filtered = movements.filter(m => /^entrega_/.test(m.movement_type));
  } else if (filter === 'sales') {
    filtered = movements.filter(m => /^venda_/.test(m.movement_type));
  } else if (filter === 'saida') {
    filtered = movements.filter(m => m.saida_id != null);
  }
  filtered = filtered.slice(0, 20);

  const embed = brandEmbed('MOVEMENT').setTitle(`${EMOJI.MATERIAL} Histórico de movimentos`);

  if (!filtered.length) {
    embed.setDescription('Sem movimentos para este filtro.');
  } else {
    const totalQty = filtered.reduce((a, m) => a + (Number(m.quantity) || 0), 0);
    embed.setDescription(`${filtered.length} movimentos · total **${fmt(totalQty)}** un.`);

    const lines = filtered.map(m => {
      const emj = TYPE_EMOJI[m.movement_type] || '•';
      const lbl = TYPE_LABEL[m.movement_type] || m.movement_type;
      const date = formatPtDate(m.created_at);
      const opTag = m.saida_id ? ` · saída **#${m.saida_id}**` : '';
      return `${emj} \`${date}\` **${m.quantity}× ${m.item_name}** — ${lbl}${opTag}`;
    });

    // Discord field limit = 1024 chars. Corta se precisa.
    let chunk = '';
    const fields = [];
    for (const line of lines) {
      if ((chunk + '\n' + line).length > 1000) {
        fields.push({ name: '\u200b', value: chunk, inline: false });
        chunk = line;
      } else {
        chunk = chunk ? `${chunk}\n${line}` : line;
      }
    }
    if (chunk) fields.push({ name: '\u200b', value: chunk, inline: false });
    embed.addFields(fields);
  }

  const filterRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('perfil::historico_filter')
      .setPlaceholder('Filtrar por tipo')
      .addOptions([
        { label: 'Tudo', value: 'all', emoji: '📜', default: filter === 'all' },
        { label: 'Entregas', value: 'deliveries', emoji: '📥', default: filter === 'deliveries' },
        { label: 'Vendas', value: 'sales', emoji: '💰', default: filter === 'sales' },
        { label: 'De Saídas', value: 'saida', emoji: '🎯', default: filter === 'saida' },
      ])
  );

  const navRow = buttonRow(
    button({ customId: 'perfil::voltar', label: 'Voltar ao Perfil', style: 'Secondary', emoji: EMOJI.VOLTAR })
  );

  return safeReply(
    interaction,
    {
      embeds: [embed],
      components: [filterRow, navRow],
    },
    { messageClass: 'COCKPIT' }
  );
}

module.exports = { handle, handleFilterSelect };
