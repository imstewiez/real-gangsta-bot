'use strict';
/**
 * /precario — sincronizar preços do catálogo oficial.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { ERRORS, EMOJI } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { syncPrices } = require('../inventory/catalogPricesSync');

async function handle(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('sync catálogo'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const modo = interaction.options.getString('modo') || 'prices';
  try {
    const r = await syncPrices({ full: modo === 'full' });
    const lines = [
      `📋 **Precário sincronizado** (modo \`${modo}\`)`,
      `${EMOJI.OK} ${r.created.length} criados · ${EMOJI.REFRESH} ${r.updated.length} actualizados · ⚪ ${r.unchanged.length} iguais · ${EMOJI.WARN} ${r.errors.length} erros`,
    ];
    if (r.updated.length) {
      lines.push('', '**Preços alterados:**');
      for (const u of r.updated.slice(0, 15)) lines.push(`• ${u.name}: ${u.oldPrice}€ → **${u.newPrice}€**`);
      if (r.updated.length > 15) lines.push(`_… e mais ${r.updated.length - 15}._`);
    }
    if (r.created.length) {
      lines.push('', '**Itens novos:**');
      for (const c of r.created.slice(0, 15)) lines.push(`• ${c.name} (${c.price}€)`);
      if (r.created.length > 15) lines.push(`_… e mais ${r.created.length - 15}._`);
    }
    if (r.errors.length) {
      lines.push('', '**Erros:**');
      for (const e of r.errors.slice(0, 5)) lines.push(`${EMOJI.WARN} ${e.name}: ${e.message}`);
    }
    return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

module.exports = { handle };
