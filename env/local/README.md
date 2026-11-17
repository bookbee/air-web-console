# env/local: local settings that wire the AIR services together

Every AIR repository ships a `.env.example` that works **alone**: its optional
connections to the other services are switched off, so a single checkout never
reports itself degraded against services that aren't running.

The files here are the difference between "alone" and "together" on a developer's
machine. Each one is a block of settings appended to the end of that service's own
`.env` (when a key appears twice in a `.env` file, the last value wins):

| File | Appended to | What it switches on |
| --- | --- | --- |
| `air-orchestrator-service.env` | `../air-orchestrator-service/.env` | The classifier, document search, order lookups, the planner, confirmed changes; the cloud model class; the Brightcart brand name |
| `air-classifier-service.env` | `../air-classifier-service/.env` | Tiers 2 and 3, through air-model-gateway |

The other services need nothing beyond their own `.env.example`.

- `make platform-up` applies a block when it **creates** a missing `.env`.
- `make platform-env` creates missing `.env` files and applies the blocks to existing
  ones too. Each block is applied once; it is recognised by its first line.
- To undo, delete the block (between its two marker lines) from the service's `.env`.

**Development keys only.** Every key in these files is a published development value
that works only against the development salts in the sibling repositories. They are
safe to commit and must never be used anywhere else. Real secrets, such as a cloud
provider key, go in the service's own untracked `.env` by hand: never in this folder.

When a service's `.env.example` changes a setting named here, update the block in
the same change. `docs/platform/03-local-setup.md` describes the whole setup.
