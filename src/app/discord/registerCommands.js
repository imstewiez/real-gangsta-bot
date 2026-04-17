'use strict';
/**
 * Registo de slash commands na API do Discord.
 *
 * Chamado no `ready` — idempotente. Se falhar, loga erro crítico mas não aborta
 * (modo degradado). Retorna o erro para o caller decidir.
 */

const { REST, Routes } = require('discord.js');
const CONFIG = require('../../config');
const { commands } = require('../../slashCommands');
const { log, error } = require('../../logger');

async function registerCommands(client) {
  const body = commands.map(c => c.toJSON());

  // ── Validação: nomes duplicados ──────────────────────────────────────────
  const names = body.map(c => c.name);
  const seen = new Set();
  const dupes = [];
  for (const name of names) {
    if (seen.has(name)) dupes.push(name);
    seen.add(name);
  }
  if (dupes.length) {
    error(`[COMMANDS] Slash commands com nomes duplicados: ${dupes.join(', ')} — registo abortado.`);
    return new Error(`Nomes duplicados: ${dupes.join(', ')}`);
  }

  log(`[COMMANDS] A registar ${body.length} slash commands: ${names.join(', ')}`);

  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_BOT_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, CONFIG.DISCORD_GUILD_ID), { body });
    log(`[READY] ${body.length} slash commands registados com sucesso.`);
  } catch (e) {
    error(`[COMMANDS] FALHA CRÍTICA — comandos podem estar desatualizados: ${e.message}`);
    return e;
  }
}

module.exports = { registerCommands };
