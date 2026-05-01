'use strict';
/**
 * Interaction router — ponto único de entrada para toda a interacção.
 *
 * Fluxo:
 *   1. Autocomplete? → dispatch directo sem rate limit
 *   2. Rate limiting (admin 30/10s, outros 10/10s)
 *   3. Dispatch por tipo: slash, button, select, userSelect, modal
 *   4. Error envelope (correlation ID visível ao utilizador)
 *
 * Todas as interacções correm dentro de `requestContext.run(...)` para
 * propagar `correlationId` e `actor` aos logs.
 */

const { MessageFlags } = require('discord.js');
const { log, warn, error } = require('../../logger');
const metrics = require('../../lib/metrics');
const ctx = require('../../shared/requestContext');
const rateLimiter = require('../../shared/rateLimiter');
const { safeReply } = require('../../shared/interactionHelpers');
const { ERRORS } = require('../../content');

const { handleAutocomplete } = require('./routers/autocomplete');
const { handleSlash } = require('./routers/slash');
const { handleButton } = require('./routers/buttons');
const { handleSelect } = require('./routers/selects');
const { handleUserSelect } = require('./routers/userSelects');
const { handleModal } = require('./routers/modals');

function actionKeyFor(interaction) {
  if (interaction.isChatInputCommand()) return `cmd:${interaction.commandName}`;
  if (interaction.isButton()) return `btn:${interaction.customId}`;
  if (interaction.isModalSubmit()) return `mod:${interaction.customId}`;
  if (interaction.isAnySelectMenu()) return `sel:${interaction.customId}`;
  return 'misc';
}

function typeTagFor(interaction) {
  if (interaction.isChatInputCommand?.()) return `cmd=/${interaction.commandName}`;
  if (interaction.isButton?.()) return `button=${interaction.customId}`;
  if (interaction.isModalSubmit?.()) return `modal=${interaction.customId}`;
  if (interaction.isAnySelectMenu?.()) return `select=${interaction.customId}`;
  return `type=${interaction.type}`;
}

async function dispatch(interaction) {
  // ── Autocomplete (sem rate limit, sem deferReply) ──────────────────────
  if (interaction.isAutocomplete?.()) {
    return handleAutocomplete(interaction);
  }

  // ── Rate limiting global por user ──────────────────────────────────────
  const actionKey = ctx.current()?.action || 'misc';
  const { isCommand } = require('../../permissions/permissionEngine');
  const rlLimit = isCommand(interaction.member) ? 30 : 10;
  if (!rateLimiter.allow(interaction.user.id, actionKey, { limit: rlLimit, windowMs: 10_000 })) {
    const wait = rateLimiter.retryAfter(interaction.user.id, actionKey);
    return safeReply(
      interaction,
      {
        content: rateLimiter.denyMessage(wait),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  // ── Dispatch por tipo ──────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    metrics.commandInvocationsTotal.inc();
    return handleSlash(interaction);
  }
  if (interaction.isButton()) return handleButton(interaction);
  if (interaction.isStringSelectMenu()) return handleSelect(interaction);
  if (interaction.isUserSelectMenu()) return handleUserSelect(interaction);
  if (interaction.isModalSubmit()) return handleModal(interaction);
}

/**
 * Handler principal. Registado em client.on(Events.InteractionCreate).
 * Envolve dispatch() com requestContext + error envelope.
 */
async function onInteraction(interaction) {
  metrics.discordEventsTotal.inc();
  const action = actionKeyFor(interaction);

  return ctx.run(
    {
      actorId: interaction.user.id,
      actorName: interaction.user.username,
      action,
      guildId: interaction.guildId,
    },
    async () => {
      const cid = ctx.correlationId();
      try {
        log(`${ctx.tag()} start ${action} · actor=${interaction.user.id}`);
        await dispatch(interaction);
        log(`${ctx.tag()} done ${action} · ${ctx.elapsed()}ms`);
      } catch (e) {
        metrics.interactionErrorsTotal.inc();
        warn(`${ctx.tag()} failed ${action} · ${e.message} · ${ctx.elapsed()}ms`);
        error(`[INTERACTION] Unhandled (${typeTagFor(interaction)}, user=${interaction.user?.id}): ${e.message}`, e);
        try {
          await safeReply(
            interaction,
            {
              content: ERRORS.INTERNAL(cid),
              flags: MessageFlags.Ephemeral,
            },
            { messageClass: 'ERROR' }
          );
        } catch (_) {
          /* ignore */
        }
      }
    }
  );
}

module.exports = { onInteraction, dispatch };
