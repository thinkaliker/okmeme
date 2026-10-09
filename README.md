okme.me
-------

A linkdump built around a semi-anonymous tiered community. Users on higher tiers
see down into lower ones; users on lower tiers see exactly one rung above them,
and no further.

```text
api/    the server — Hono, Postgres, Prisma. Deployable to Vercel or a box you own.
web/    the SPA — Vite, React, TypeScript, shadcn-style components on Tailwind.
```

`web/` replaces the original create-react-app + Material-UI build that lived in
`src/`.

running it
----------

```sh
cd api && npm install && npm run migrate && npm run init && npm run dev
cd web && npm install && VITE_API_MOCK=false VITE_API_URL=http://localhost:8787 npm run dev
```

The root `package.json` delegates to both — `npm run install:all`, `dev:api`,
`dev:web`, `build`, `test`, `typecheck` — and is **deliberately not an npm
workspace root**. `api/` and `web/` deploy from their own directories with their
own lockfiles, on Vercel and in Docker alike; hoisting them into one install
would leave both with a lockfile nothing reads.

**[DEPLOY.md](DEPLOY.md)** is the step-by-step guide to putting this somewhere
real — Vercel, Docker Compose, or bare metal, with the buttons to click and a
troubleshooting section for the two things that always go wrong (CORS and
cookies).

[api/README.md](api/README.md) covers local development and the port
abstractions. The SPA also runs with no server at all against an in-browser
fake — see [web/README.md](web/README.md).

the documents
-------------

These are the spec. The code implements them; where the two disagree, that is a
bug in the code.

- [DESIGN.md](DESIGN.md) — the overview and the infrastructure stance
- [VISIBILITY.md](VISIBILITY.md) — the ring model, the exact rules, and the leaks it does and does not close
- [SCHEMA.md](SCHEMA.md) — tables and the visibility predicate in SQL
- [API.md](API.md) — surface, conventions, and the rules every endpoint follows
- [GAPS.md](GAPS.md) — accepted leaks, decided-but-unbuilt, and what is still open

[DEPLOY.md](DEPLOY.md) is the exception: it is a runbook rather than a spec.
