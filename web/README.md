# okmeme web

Vite + React + TypeScript, shadcn-style components on Tailwind, deployed as a
static SPA against a separate API. This replaces the create-react-app +
Material-UI app at the repository root; see [DESIGN.md](../DESIGN.md).

```sh
npm install
npm run dev        # http://localhost:5173, running against the in-browser fake
npm run build      # tsc -b && vite build
npm test           # visibility and rendering checks
```

## running against the real API

```sh
VITE_API_MOCK=false VITE_API_URL=http://localhost:8787 npm run dev
```

The server lives in [`api/`](../api). Start it first — `npm run migrate`,
`npm run init`, `npm run dev` — and see [api/README.md](../api/README.md) for
deployment. `WEB_ORIGIN` on the API has to list this origin or every request
fails CORS.

## running without a server

There is no API yet, so `VITE_API_MOCK` defaults to on and every request is
answered by [`src/api/mock/transport.ts`](src/api/mock/transport.ts). The fake
starts from rows and applies the ring predicate itself, in the place SQL will —
which is the only reason it is worth having. A mock that returned pre-resolved
payloads would let this client be built against a shape that has never been
filtered.

The login screen carries a tier switcher in mock mode. Use it: the ring model is
invisible from a single seat. The same fixtures look different from each tier —

| logged in as | tier | what changes |
| --- | --- | --- |
| *(nobody)* | 0 | limited-tier posts only, all attributed `[limited]` |
| `dana` | 1 limited | limited authors by name, full-tier posts as `[full]`, no NSFW |
| `sandra` | 2 full | full and below by name, staff posts as `[staff]`, NSFW by preference |
| `pip` | 3 staff | staff and below by name, admin posts as `[admin]` |
| `root` | 4 admin | everything, real names throughout |
| `vye` | 2 full | under a sanction — mute plus content hold, with an appeal form |

To see the tag flow: submit as `dana`, type a tag that does not exist, and watch
it appear on the post marked *pending*. Log in as `kes` and the same post has no
such tag. Log in as `pip`, approve it under Moderation, and it becomes an
ordinary tag for everyone.

Two fixtures exist to be looked for specifically: one post is pinned down a tier
by a moderator re-tier and stays visible to limited users no matter what its
author's tier does, and one author is under a content hold so their posts are
absent from every feed.

Setting `VITE_API_MOCK=false` at build time removes the fake, the fixtures and
the switcher from the output. That works because
[`src/api/transport.ts`](src/api/transport.ts) reaches the mock through a
dynamic `import()` inside a branch Vite can prove is dead — a static import
would survive tree shaking, since the fake holds module-level state and is
therefore not side-effect free.

## the tint

Categories carry a colour: a dot beside each entry in the left nav, the left
edge of every row, the top edge of every gallery tile. The hue is hashed from
the category slug in [`src/lib/tint.ts`](src/lib/tint.ts), so a category keeps
its colour across a rename and nobody maintains a palette by hand. Only the hue
varies — lightness and chroma are theme variables, so one seed reads correctly
in light and dark.

Beside the kind icon sits the site's favicon, or — when the site has none — a
letter square tinted by the host. The favicon comes from okmeme's own origin
through the same key-based route as thumbnails, never from
`https://<host>/favicon.ico`: a 16px image is more than enough to log a viewer,
and a site that can count its referrers can count the readers of a tier it
cannot see.

The seed is allowed to be a category slug or a link's host, and nothing else.
**Never an author.** A stable colour attached to an identity is a correlation
handle, and two `[full]` posts have to stay indistinguishable; a per-author tint
would undo the ring model quietly enough that nothing would notice. There is a
test on that specifically.

## display preferences

Three knobs, all under Settings → Appearance, all stored locally so an anonymous
reader keeps them and mirrored to the account through `PATCH /me` so they follow
a logged-in user to another device. The account copy wins when a session appears.

- **Density** — comfortable or compact. Compact trims padding and drops the body
  teaser. It is a root attribute plus a `compact:` Tailwind variant, so a
  component declares its own dense case next to its normal one and there is no
  prop to forget to pass down.
- **Width** — normal or wide. Wide gives the list most of the window on desktop
  and changes nothing on a phone.
- **Feed layout** — list or gallery. Gallery is a grid of thumbnails, toggled
  from the feed toolbar as well as from settings.

Gallery is a rearrangement of the page the server already sent, not a different
query. Every row gets a tile, including text posts and anything without an
image — dropping those client-side would make the page short for a reason that
has nothing to do with what the viewer may see, which is exactly the shape the
ring model spends its effort avoiding. NSFW tiles stay blurred there: the tile
is itself a link, and a reveal button inside it would nest one interactive
element in another, so revealing happens on the post's own page.

## layout

```text
src/
  domain/      tiers, authors, links, pages, the admin payloads — the model, no react
  i18n/        string keys and the one english catalogue
  api/         transport seam: client + http, and the mock behind the same interface
  session/     who is asking
  theme/       light/dark, prefers-color-scheme plus a persisted override
  components/  shell, cards, primitives
  routes/      one screen per file, each its own lazy chunk
```

Nothing re-exports anything. There are no barrel files: a barrel drags every
sibling into whichever chunk touches one of them, which undoes the route
splitting above.

## what this does not do

**Comments.** Deliberate: the schema and the invisible-parent rule are settled
but nothing ships. See [GAPS.md](../GAPS.md).

Everything else in the design is built. Signup, recovery, the one-time setup
page, API tokens, the admin queues (reports, appeals, recovery requests, users,
invites, audit, instance settings) and the owner surface all exist and all talk
to real endpoints.

The in-browser fake does **not** model the admin queues. There is no interesting
visibility rule in a list only admins can read, and inventing fixtures for one
would be a second implementation with nothing to check it against — so those
routes answer empty in mock mode and say so, rather than 404ing and looking
broken. Point the app at a real API to use them.
