# Política de Deprecação

Política formal para remover campos, enums, movement types, env vars ou
APIs internas sem partir produção.

---

## Ciclo de vida

```
[novo]  →  [supported]  →  [deprecated]  →  [removed]
              ↑                ↑                ↑
         release N         release N+1     release N+2
```

Cada transição exige:

1. **novo → supported**: merged em `main`, documentado em CHANGELOG.
2. **supported → deprecated**:
   - Adicionar entrada em `docs/DEPRECATION.md` com data, motivo, substituto.
   - Manter código legacy funcional (alias / fallback / CHECK constraint extra).
   - Emitir warning em logs ao detectar uso legacy (quando aplicável).
3. **deprecated → removed**:
   - Só depois de **mínimo 1 release completo** em estado deprecated.
   - Antes de remover: verificar DB / produção que não há uso real.
   - Atualizar migration SQL se for enum/CHECK constraint.
   - Actualizar testes.
   - Announce em CHANGELOG.

## Regras duras

- **Nunca** saltar o estado `deprecated`. Passar directamente de supported →
  removed é apenas aceitável se for comprovadamente sem uso (grep vazio +
  dados DB ausentes).
- **Deprecações em CHECK constraints de SQL**: precisam sempre de migration
  dedicada; valores antigos ficam aceites até serem fisicamente removidos.
- **Env vars** deprecated: continuam a ser lidos como fallback do novo nome.
  O warning aparece apenas no validador de config, não em cada leitura.

## Histórico de deprecações

### Fechadas (2026-04-17)

| Item | Anunciado | Removido | Substituto |
|---|---|---|---|
| role `morador` | v2.2 (2026-04-15) | v2.3 (2026-04-17) | `bairrista` |
| role `chefe_moradores` | v2.2 | v2.3 | `patrao_di_zona` |
| movement `entrega_morador` | v2.2 | v2.3 | `entrega_bairrista` |
| movement `venda_morador` | v2.2 | v2.3 | `venda_bairrista` |
| env `MORADORES_BASE_ROLE_ID` | v2.2 | v2.3 | `BAIRRISTAS_BASE_ROLE_ID` |
| env `MORADOR_TOPICOS_CATEGORY_ID` | v2.2 | v2.3 | `BAIRRISTA_TOPICOS_CATEGORY_ID` |
| predicados `isMorador` / `isChefeMoradores` | v2.2 | v2.3 | `isBairrista` / `isPatraoDiZona` |

### Abertas

Nenhuma actualmente.

## Como adicionar uma deprecação

1. Abre PR com:
   - `@deprecated <data>` em JSDoc/comentário
   - Entrada na secção "Abertas" acima
   - Warning emitido ao detectar uso (quando faz sentido, ex: env var legacy)
2. Espera ≥ 1 release completa antes de remover.
3. PR de remoção referencia o PR de deprecação.
