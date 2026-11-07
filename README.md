# NextGuide Add-ons — developer template

Create independently maintained add-ons for [NextGuide](https://github.com/m1nsook/NextGuide) without changing its core repository.

## Make an add-on

1. Choose **Use this template** or fork this repository.
2. Edit nextguide-addon.json: choose a unique publisher.addon id, actual repository URL, version, license and compatibility.
3. Put Markdown pages under content/. No executable MDX, install scripts or unsafe hooks in this first content-only template.
4. Run `node scripts/validate-addon.mjs` and `node --test test/validate-addon.test.mjs` locally.
5. Submit your repository URL and an immutable commit SHA using the [NextGuide submission template](https://github.com/m1nsook/NextGuide/issues/new?template=submit-your-addon.md).

GitHub Actions validate PRs, pushes to main and manual runs using a read-only token, a 4-minute timeout and no package installation. Passing CI is **not** publication approval or a security audit.

## Scope and future versions

Add-ons are **Account Mode only**. This template establishes a content-only manifest, validator and reviewer workflow. The extension runtime, marketplace, AI/OAuth/integration capabilities, installation management and hosted registry are a future NextGuide 1.0 milestone, **not provided by this template**.

Updates must be published as immutable releases and approved with their manifest and content digest. NextGuide package releases and reviewed add-on updates will be independent; the proposed ngapi registry is not deployed yet.

Read [authoring](docs/AUTHORING.md), [review policy](docs/REVIEW.md) and the [manifest schema](schema/nextguide-addon.schema.json).

Standard GitHub-hosted Actions runners are currently free in public repositories, subject to GitHub policies and account settings; no paid runners are configured here.
