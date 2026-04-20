'use strict';
/**
 * Autocomplete router — resposta sem deferReply, sem rate limit.
 *
 * Map: commandName → handler. Handler recebe (interaction, focused).
 */

const { getActiveItemsList } = require('../../../sheets/queries');

async function itemAutocomplete(interaction, focused) {
  const all = await getActiveItemsList().catch(() => []);
  const q = String(focused.value || '').toLowerCase();
  const filtered = (q ? all.filter(i => i.name.toLowerCase().includes(q)) : all).slice(0, 25);
  return interaction.respond(filtered.map(i => ({ name: i.name, value: i.name }))).catch(() => {});
}

// Map: commandName → handler por campo
// Convenção: handler só é chamado se o campo focado for 'item' (ou o que indicar).
const AUTOCOMPLETE = {
  stock: { item: itemAutocomplete },
  transfer: { item: itemAutocomplete },
  entrega: { item: itemAutocomplete },
  venda: { item: itemAutocomplete },
};

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const cmd = interaction.commandName;
  const handlers = AUTOCOMPLETE[cmd];
  if (!handlers) return interaction.respond([]).catch(() => {});
  const handler = handlers[focused.name];
  if (!handler) return interaction.respond([]).catch(() => {});
  return handler(interaction, focused);
}

module.exports = { handleAutocomplete, AUTOCOMPLETE };
