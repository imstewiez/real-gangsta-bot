'use strict';

const https = require('node:https');
const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { EMOJI, BUTTONS } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { warn } = require('../logger');

let cachedLogoUrl = null;
let logoLookupDone = false;

function fetchText(url, timeoutMs = 5000) {
  return new Promise(resolve => {
    const req = https.get(url, { headers: { 'user-agent': 'BallasGangBot/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).href, timeoutMs));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve('');
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 2_000_000) req.destroy();
      });
      res.on('end', () => resolve(body));
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on('error', () => resolve(''));
  });
}

function findLogoUrl(text, baseUrl) {
  if (!text) return '';
  const patterns = [
    /["'`]([^"'`]*ballas[^"'`]*\.(?:png|webp|jpg|jpeg|svg))["'`]/i,
    /["'`]([^"'`]*logo[^"'`]*\.(?:png|webp|jpg|jpeg|svg))["'`]/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    return new URL(match[1], baseUrl).href;
  }
  return '';
}

async function resolveLogoUrl() {
  if (CONFIG.BALLAS_GANG_LOGO_URL || CONFIG.BOT_LOGO_URL) {
    return CONFIG.BALLAS_GANG_LOGO_URL || CONFIG.BOT_LOGO_URL;
  }
  if (logoLookupDone) return cachedLogoUrl;
  logoLookupDone = true;

  const baseUrl = CONFIG.WEB_APP_URL || 'https://www.ballasgang.eu';
  const html = await fetchText(baseUrl);
  cachedLogoUrl = findLogoUrl(html, baseUrl);

  if (!cachedLogoUrl) {
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi)]
      .map(m => new URL(m[1], baseUrl).href)
      .slice(0, 6);
    for (const scriptUrl of scripts) {
      const js = await fetchText(scriptUrl);
      cachedLogoUrl = findLogoUrl(js, scriptUrl);
      if (cachedLogoUrl) break;
    }
  }

  if (!cachedLogoUrl) warn('[ENTRADA] Não consegui resolver o logo no website da Ballas Gang.');
  else warn(`[ENTRADA] Logo resolvido: ${cachedLogoUrl}`);
  return cachedLogoUrl;
}

async function buildEntradaPanel() {
  const logoUrl = await resolveLogoUrl();

  const embed = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle(`${EMOJI.TAG} Bem-vindo ao Bairro`)
    .setDescription(
      'Faz aqui o teu pedido de tag para a Ballas Gang.\n\n' +
        'Escolhe a opção certa, preenche o formulário e aguarda a análise da equipa responsável.'
    )
    .setFooter({ text: '— Ballas Gang', iconURL: logoUrl || undefined });

  if (logoUrl) embed.setThumbnail(logoUrl);

  const bBairrista = BUTTONS.ENTRADA.PEDIR_BAIRRISTA;
  const bTropinha = BUTTONS.ENTRADA.PEDIR_TROPINHA;
  const bPedido = BUTTONS.ENTRADA.MEU_PEDIDO;

  const btnBairrista = button({
    customId: 'onboard::pedir_bairrista',
    label: bBairrista.label,
    style: bBairrista.style,
    emoji: bBairrista.emoji,
  });
  const btnTropinha = button({
    customId: 'onboard::pedir_tropinha',
    label: bTropinha.label,
    style: bTropinha.style,
    emoji: bTropinha.emoji,
  });
  const btnPedido = button({
    customId: 'onboard::meu_pedido',
    label: bPedido.label,
    style: bPedido.style,
    emoji: bPedido.emoji,
  });

  return { embeds: [embed], components: [buttonRow(btnBairrista, btnTropinha, btnPedido)] };
}

module.exports = { buildEntradaPanel, resolveLogoUrl };
