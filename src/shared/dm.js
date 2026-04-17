'use strict';
/**
 * DM helper — envia mensagem privada ao user com fallback gracioso.
 *
 * Muitos users fecham DMs de servidores (default em alguns clients).
 * Quando isso acontece, `user.send()` atira com DiscordAPIError 50007
 * "Cannot send messages to this user". Em vez de silenciar a mensagem,
 * fazemos fallback para um post num canal público (com menção ao user)
 * ou devolvemos `{ok:false}` para o caller decidir.
 *
 * Uso típico (aprovação/negação de tag):
 *
 *   const { tryDmOrFallback } = require('../shared/dm');
 *   const r = await tryDmOrFallback({
 *     user: interaction.user,
 *     payload: { embeds: [embed] },
 *     fallbackChannel: entradaChannel,
 *     fallbackMention: true,
 *   });
 *   if (r.delivered === 'dm') log('[DM] entregue por DM');
 *   else if (r.delivered === 'channel') log('[DM] fallback para canal');
 *   else warn('[DM] não entregue');
 */

const { warn } = require('../logger');

/**
 * Tenta enviar DM ao user. Retorna `{ok, error?}`.
 * Nunca atira — erros são capturados e devolvidos.
 */
async function sendDM(user, payload) {
  if (!user) return { ok: false, error: 'no_user' };
  try {
    const dm = await user.createDM();
    await dm.send(payload);
    return { ok: true };
  } catch (e) {
    // 50007 = DMs fechados; 50001 = sem acesso; outros = rede/rate limit.
    return { ok: false, error: e.code || e.message || 'unknown' };
  }
}

/**
 * Envia DM ou, se falhar, faz fallback para um canal público com menção.
 *
 * @param {object} opts
 * @param {import('discord.js').User} opts.user
 * @param {object} opts.payload                 — `{ content?, embeds?, components? }`
 * @param {import('discord.js').TextChannel|null} opts.fallbackChannel
 * @param {boolean} [opts.fallbackMention=true] — adiciona `<@id>` ao conteúdo
 * @returns {Promise<{ delivered: 'dm'|'channel'|'none', dmError?: string, channelError?: string }>}
 */
async function tryDmOrFallback({ user, payload, fallbackChannel, fallbackMention = true }) {
  const dmResult = await sendDM(user, payload);
  if (dmResult.ok) return { delivered: 'dm' };

  if (!fallbackChannel) {
    warn(`[DM] ${user?.id}: DM falhou (${dmResult.error}) e sem canal fallback.`);
    return { delivered: 'none', dmError: dmResult.error };
  }

  // Fallback — cria payload com menção para garantir notificação.
  const fallbackPayload = { ...payload };
  if (fallbackMention && user?.id) {
    const prefix = `<@${user.id}>`;
    fallbackPayload.content = fallbackPayload.content ? `${prefix}\n${fallbackPayload.content}` : prefix;
    fallbackPayload.allowedMentions = { users: [user.id] };
  }

  try {
    await fallbackChannel.send(fallbackPayload);
    return { delivered: 'channel', dmError: dmResult.error };
  } catch (e) {
    warn(`[DM] ${user?.id}: DM e fallback falharam (dm=${dmResult.error} ch=${e.message}).`);
    return { delivered: 'none', dmError: dmResult.error, channelError: e.message };
  }
}

module.exports = { sendDM, tryDmOrFallback };
