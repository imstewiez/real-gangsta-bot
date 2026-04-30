'use strict';
const { guildId, optId } = require('./_helpers');

// Role IDs da hierarquia completa.
// Fallbacks vêm de config/guild-defaults.json; override via env var.
module.exports = {
  // Comando Total
  MANDA_CHUVA_ROLE_ID: guildId('MANDA_CHUVA_ROLE_ID'),
  KINGPIN_ROLE_ID: guildId('KINGPIN_ROLE_ID'),
  // Supervisão
  OG_ROLE_ID: guildId('OG_ROLE_ID'),
  REAL_GANGSTER_ROLE_ID: guildId('REAL_GANGSTER_ROLE_ID'),
  // Patrão di Zona — chefe do bairro
  PATRAO_DI_ZONA_ROLE_ID: guildId('PATRAO_DI_ZONA_ROLE_ID'),
  // Bairristas (ordem entry → topo):
  //   young_blood → o_gunao (25k) → gangster_fodido (50k)
  //   Promoções excepcionais acima de Gangster Fodido são manuais.
  YOUNG_BLOOD_ROLE_ID: guildId('YOUNG_BLOOD_ROLE_ID'),
  O_GUNAO_ROLE_ID: guildId('O_GUNAO_ROLE_ID'),
  GANGSTER_FODIDO_ROLE_ID: guildId('GANGSTER_FODIDO_ROLE_ID'),
  // Role base obrigatória para qualquer bairrista (invariante).
  BAIRRISTAS_BASE_ROLE_ID: guildId('BAIRRISTAS_BASE_ROLE_ID'),
  // Pendente — atribuído automaticamente a newcomers. Único role que vê boas-vindas.
  PENDENTE_ROLE_ID: optId('PENDENTE_ROLE_ID'),
  // Flavor (não-core)
  TROPINHAS_DO_GUETTO_ROLE_ID: guildId('TROPINHAS_DO_GUETTO_ROLE_ID'),
  PATRULHA_PATA_ROLE_ID: guildId('PATRULHA_PATA_ROLE_ID'),
  BOT_ROLE_ID: guildId('BOT_ROLE_ID'),
  // Nota: CONFIGURADOR_ROLE_ID foi removido — role órfão, zero referências no código.
};
