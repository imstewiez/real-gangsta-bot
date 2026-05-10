'use strict';
const { optBool } = require('./_helpers');

module.exports = {
  ARCHIVE_ON_PROMOTION: optBool('ARCHIVE_ON_PROMOTION', true),
  DELETE_ON_PROMOTION: optBool('DELETE_ON_PROMOTION', false),
  // Quando bairrista sai do servidor: apagar canal individual (default limpo).
  DELETE_ON_LEAVE: optBool('DELETE_ON_LEAVE', true),
  ARCHIVE_ON_LEAVE: optBool('ARCHIVE_ON_LEAVE', false),
  // Auto-atribuir Pendente a newcomers (requer PENDENTE_ROLE_ID configurado).
  AUTO_ASSIGN_PENDENTE: optBool('AUTO_ASSIGN_PENDENTE', true),
  ENABLE_BACKGROUND_JOBS: optBool('ENABLE_BACKGROUND_JOBS', false),
  ENFORCE_ROLE_INVARIANTS: optBool('ENFORCE_ROLE_INVARIANTS', true),
  PANEL_BOOTSTRAP_ON_READY: optBool('PANEL_BOOTSTRAP_ON_READY', true),
  // Saídas v3.0: auto-lock automático (5 min após criação)
  SAIDA_AUTO_LOCK_ENABLED: optBool('SAIDA_AUTO_LOCK_ENABLED', false),
  // Saídas v3.0: auto-force-close (12h após liquidação)
  SAIDA_AUTO_FORCE_CLOSE_ENABLED: optBool('SAIDA_AUTO_FORCE_CLOSE_ENABLED', false),
};
