# Testing

> Jest 29 + ts-jest, configured inline in `cli/package.json` (`preset: ts-jest`, `testEnvironment: node`, `roots: [src]`). Run with `npm test` (= `jest --passWithNoTests`).

---

## Layout

- Tests are **colocated**: `src/**/__tests__/*.test.ts` inside each module.
- `tsconfig.json` excludes tests from the build, so test-only imports never leak into `dist/`.
- Known deviation: `src/tunnel/CloudClient.test.ts` and `src/tunnel/TunnelClient.test.ts` sit beside sources instead of in `__tests__/`. Put new tests in `__tests__/`.

## Fixture Conventions

- Temp directories: `fs.mkdtempSync(path.join(os.tmpdir(), ...))` with `afterEach` cleanup.
- Mock by implementing the real interfaces (e.g. `ProviderCompiler`, `ProviderExecutor`) rather than shape-casting `as any`.

## Trusted Example Tests

| Test | What it demonstrates |
|------|---------------------|
| `src/container/__tests__/Container.test.ts` | Interface-based mocking of providers |
| `src/utils/__tests__/configLoader.test.ts` | Three-tier config merge behavior |
| `src/core/compiler/__tests__/PromptCompiler.test.ts` | Pure-function testing of @-token rewriting |
| `src/executor/providers/__tests__/BaseApiProvider.test.ts` | Template-method provider testing |
| `src/review-ui/__tests__/ReviewServer.test.ts` | supertest against the Express app factory |
| `src/core/__tests__/ArchitectureFlow.test.ts` | End-to-end flow against the repo-level `packs/short-drama` pack (note: reaches outside the package — acceptable for flow tests, not for unit tests) |

## What To Test When

- New Zod schema → parse/validate round-trip tests like `configLoader.test.ts` style.
- New provider compiler → golden `BaseTaskJson` output for a fixed `CompileContext`.
- New executor behavior → mock `HttpClient`; never hit real APIs in tests.
- Cross-layer changes (frontmatter field, ref syntax, manifest shape) → extend `ArchitectureFlow.test.ts` or add an equivalent flow test; see `../../guides/cross-layer-thinking-guide.md`.

## Anti-Patterns

- Do not write tautological tests (a test that still passes when the feature is deleted — see `../../guides/index.md` "Verifying AI Cross-Review Results").
- Do not mock `fs` globally; use temp dirs so tests exercise real path behavior.
- Do not depend on test execution order; each test builds its own fixture.
