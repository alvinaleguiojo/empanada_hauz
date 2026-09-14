# eh-dev

`eh-dev` is the Empanada Hauz development/build orchestrator.

## Commands

```bash
npm run dev
npm run build
npm run build:clean
npm run eh:stats
```

The production build is dependency-aware: `packages/shared` is built first, then API and Web build in parallel. Local fingerprints under `.eh-dev/` prevent rebuilding a workspace when its inputs and required output are unchanged.

`eh-dev` does not disable TypeScript or Next.js build validation. `npm run build` remains a real production build; the optimization is deciding when a workspace actually needs to run.
