# NextGuide Add-ons — developer template

Create independently maintained add-ons for [NextGuide](https://github.com/m1nsook/NextGuide) without changing its core repository.

## Make an add-on

1. Choose **Use this template** or fork this repository.
2. Edit nextguide-addon.json: choose a unique publisher.addon id, actual repository URL, version, license and compatibility. Replace the included **icon.png** with your own add-on logo and keep its path in the manifest's **icon** field. On GitHub Actions, the manifest repository must match the repository running the validator.
3. Put Markdown pages under content/. No executable MDX, install scripts or unsafe hooks in this first content-only template.
4. Run `node scripts/validate-addon.mjs` and `node --test test/validate-addon.test.mjs` locally.
5. Commit and push your changes to your own GitHub repository. Run `bun ng-addon pack` to build a versioned `.tgz`. Then set `GITHUB_TOKEN` (with **Contents: write** in your own repository) and run `bun ng-addon publish`. The CLI verifies that the manifest, Markdown and icon exactly match GitHub, creates a GitHub Release, uploads the archive, and submits its URL/SHA-256 to the NextGuide registry for owner review. The registry API must be online for the last step.

GitHub Actions validate PRs, pushes to main and manual runs using a read-only token, a 4-minute timeout and no package installation. Passing CI is **not** publication approval or a security audit. Registry publication is controlled by a private admin approval queue; GitHub Issues are not the publishing mechanism.

## Scope and future versions

Add-ons are **Account Mode only**. This template establishes a content-only manifest, validator and reviewer workflow. The extension runtime, marketplace, AI/OAuth/integration capabilities, installation management and hosted registry are a future NextGuide 1.0 milestone, **not provided by this template**.

Updates must be published as immutable releases and approved with their manifest and content digest. NextGuide package releases and reviewed add-on updates will be independent; the proposed ngapi registry is not deployed yet.

Read [authoring](docs/AUTHORING.md), [review policy](docs/REVIEW.md) and the [manifest schema](schema/nextguide-addon.schema.json).

Standard GitHub-hosted Actions runners are currently free in public repositories, subject to GitHub policies and account settings; no paid runners are configured here.

## Publisher commands

```bash
bun ng-addon pack
bun ng-addon publish --dry-run
bun ng-addon publish --registry https://ngapi.m1nsook.com
```

The registry server is not deployed yet. The publish command will only submit successfully when its public URL is online. Treat GitHub Releases as immutable; publishing an update requires a higher manifest version. A Discord webhook can alert the registry owner when submissions arrive.
