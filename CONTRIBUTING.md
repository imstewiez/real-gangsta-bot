# Contributing

## Code Style

- **Language**: Node.js (CommonJS, `'use strict'` at top of every file)
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Strings**: Single quotes
- **Semicolons**: Required
- **Comments**: Portuguese for user-facing messages, English for code comments

## Adding a New Command

1. **Declare** the slash command in `src/slashCommands.js` using `SlashCommandBuilder`.
2. **Add handler** in `src/index.js` inside `_dispatchInteraction()`:
   ```js
   if (cmd === 'rg-my-command') {
     if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('...'), flags: MessageFlags.Ephemeral }, { dismissible: true });
     await interaction.deferReply({ flags: MessageFlags.Ephemeral });
     // ... logic
     return safeReply(interaction, { content: '✅ Done.' }, { dismissible: true });
   }
   ```
3. **Test** locally with `npm test`.

## Adding a New Button/Modal

1. Choose a `customId` following the existing convention: `domain::action::params`.
2. Add the handler function in the appropriate `src/[domain]/[domain]Handlers.js` file.
3. Register it in `_dispatchInteraction()` in `src/index.js`.
4. All handlers must use `safeReply` / `safeUpdate` — never call `interaction.reply()` directly.

## Error Handling

Every handler must handle errors gracefully:

```js
async function handleMyButton(interaction) {
  try {
    // ... logic
  } catch (e) {
    warn(`[MY_HANDLER] ${e.message}`, e);
    return safeReply(interaction, {
      content: 'Erro interno. Tenta novamente.',
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
}
```

The global error boundary in `_dispatchInteraction` catches anything that slips through, but explicit handling gives better error messages.

## Database Changes

1. Add a new migration object to the `MIGRATIONS` array in `src/dbMigrate.js`.
2. Use the next sequential `id` (check existing IDs first).
3. Migrations are **forward-only** — never modify an existing migration.
4. Test with `npm run db:migrate` locally.

## Testing Requirements

- All new utility functions must have unit tests in `test/`.
- Tests use Node's built-in test runner (`node:test`).
- Run tests: `npm test`
- Tests must not require a real database or Discord connection.
- Use mocks from `test/helpers/` for Discord objects and DB queries.

## Commit Message Format

Use conventional commits:

```
type(scope): short description

feat(inventory): add bulk movement recording
fix(rankings): correct hybrid score calculation for new members
chore(deps): update discord.js to 14.19.3
docs(deployment): add Railway setup instructions
test(cache): add TTL expiry tests
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`

## PR Process

1. Create a branch from `main`.
2. Make changes, run `npm test` and `npm run lint`.
3. Open a PR with a clear description of what changed and why.
4. PRs that touch the interaction dispatcher (`src/index.js`) require extra care — test all affected flows manually.
