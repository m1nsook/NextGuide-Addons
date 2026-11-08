# NextGuide Add-ons — official developer template

Build independently maintained, **content-only Account Mode** add-ons without changing NextGuide core.

## Create your first add-on

1. Select **Use this template → Create a new repository** on GitHub. Your add-on repository must be **public** so the registry can independently verify its releases.
2. Edit `nextguide-addon.json`:
   - Choose your permanent `publisher.addon-slug` ID.
   - Replace `repository` with **your new repository URL** (not the template URL).
   - Fill in author, license, version, summary and supported NextGuide versions.
   - Keep `compatibility.mode` as `account`, and `permissions` as `[]`.
3. Replace `icon.png` with your own PNG icon (32–1024 px; at most 256 KiB), and keep the `icon` field pointing to it.
4. Put one or more plain `.md` files in `content/`. No executable MDX, JavaScript, scripts or privileged hooks are supported.
5. Run the commands below, then commit and push your manifest, icon and content changes.

```bash
bun test
bun ng-addon pack
```

`pack` creates `dist/nextguide-addon-VERSION.tgz` and prints its SHA-256. It does not publish.

## Publish to the verified registry

Create a **fine-grained GitHub token** scoped to your own add-on repository with **Contents: read/write**. Make it available locally as `GITHUB_TOKEN` or `GH_TOKEN`. Never commit a token or send one to the registry.

```bash
bun ng-addon publish --dry-run
bun ng-addon publish --registry https://ngapi.m1nsook.com
```

The publisher:

1. Verifies that every local packaged file matches a pinned, pushed GitHub commit.
2. Creates a versioned GitHub Release with an immutable `.tgz` asset.
3. Submits the public repository, release tag, exact commit SHA, archive URL and SHA-256 to the separate ngapi registry.
4. Reports a `pending` review ID on HTTP 202. Only the protected owner dashboard can approve or reject it.

**Retry safely:** If the GitHub Release was uploaded but registry submission failed, rerun `bun ng-addon publish` once the service is available. The CLI reuses the existing asset **only** if its GitHub SHA-256, size and URL are identical. It never overwrites a published version. Bump SemVer when the source changes.

**Deployment status (November 2026):** The public read-only API and protected reviewer queue are running, but public `POST /v1/submissions` is currently restricted by nginx during security rollout. A publishing attempt can upload its GitHub Release yet receive HTTP 403 from ngapi until the operator enables submissions. You can still prepare, validate, pack, and run the dry-run checks now.

## What add-ons can do today

The first add-on format is **Markdown content only**. Categories such as themes, icons, languages, AI, OAuth and integrations are placeholders for future separately permissioned extension APIs; selecting those categories does not grant executable capabilities.

The installed-site Account Mode marketplace, installer, enable/disable, update and rollback features are **not complete yet**. The ngapi `/admin` dashboard is a private review queue, not a user-facing marketplace.

Read [authoring](docs/AUTHORING.md), [review policy](docs/REVIEW.md), and the [manifest schema](schema/nextguide-addon.schema.json).

The validator GitHub workflow only checks source quality; passing CI is not publication approval. The workflow has a 4-minute timeout and uses a read-only token. No public-registry server code, environment files, webhook URLs or credentials are stored in this repository.
