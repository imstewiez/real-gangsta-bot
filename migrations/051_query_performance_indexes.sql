-- Migration 051: Índices de performance para N+1 hotspots e autocomplete
-- Aplica batching de queries em finalizeSaida/settleParticipantCustody

-- Índice composto para lookups de participação por membro + operação
-- Usado em: "minhas saídas", check de duplicados, painel pessoal
CREATE INDEX IF NOT EXISTS idx_operation_participants_member_op
  ON operation_participants(member_id, operation_id);

-- Índice funcional para busca case-insensitive de itens no autocomplete
CREATE INDEX IF NOT EXISTS idx_items_name_lower
  ON items(LOWER(name));

-- Índice para queries de movimentos por operação (material summary)
-- Nota: coluna chama-se saida_id (renomeada na migração 011)
CREATE INDEX IF NOT EXISTS idx_inventory_movements_saida_id
  ON inventory_movements(saida_id)
  WHERE saida_id IS NOT NULL;

-- Índice para member_saida_stats lookups rápidos em rankings
CREATE INDEX IF NOT EXISTS idx_member_saida_stats_kd
  ON member_saida_stats(kd_ratio DESC NULLS LAST)
  WHERE saidas_total > 0;
