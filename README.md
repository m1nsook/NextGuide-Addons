# NextGuide Add-ons — official developer template

Build independently maintained **content-only NextGuide Account Mode** add-ons without editing the framework. The current publishable format supports Markdown and a local PNG icon. React, MDX, TypeScript and server code extensions are not yet accepted by the registry.

## Get started

1. Choose **Use this template → Create a new repository** on GitHub. Keep the new repository public for release verification.
2. Edit `nextguide-addon.json` with your permanent `publisher.addon-name` ID, your actual repository URL, author, version, license and compatibility.
3. Replace `icon.png` with your own PNG (32–1024 pixels, maximum 256 KiB).
4. Put one or more plain `.md` files in `content/`. No executable scripts or MDX.
5. Commit and push all changed files to your repository.

## Validate and pack locally

```bash
bun test
bun ng-addon pack
```

The pack command creates a versioned `.tgz` archive and reports its SHA-256. It does not publish.

## Publish with GitHub

Open the [NextGuide Publisher GitHub App](https://github.com/apps/nextguide-publisher), sign in with GitHub, select your repository and submit your verified release for independent review. **You do not need a personal access token for the web publisher.**

The publisher verifies the source, creates or reuses a matching immutable GitHub Release asset, and shows your submission status. Validation reports multiple source issues together, with explicit fixes for safe metadata changes.

An uploaded GitHub Release is not the same as registry approval. Only reviewed versions appear in the signed catalog.

## Updates and withdrawal

To update, increment the manifest SemVer version, commit and push the changes, then submit again. Do not overwrite an existing versioned asset. A retry may reuse an artifact only when its size and SHA-256 digest match.

Verified publishers can withdraw their own add-ons. Withdrawn versions are no longer offered as new installations; review history and GitHub Releases are preserved.

## Executable v2 developer lab

You can now **author and build real server-side JavaScript/TypeScript extensions**
locally, bundle their code with source provenance and per-file SHA-256 hashes,
and inspect the deterministic archive **without executing the code**.

The sample in [examples/v2-server](examples/v2-server) demonstrates a brokered
storage counter and a declarative Account Mode admin page.

    bun ng-addon build-v2 --project examples/v2-server
    bun ng-addon pack-v2 --project examples/v2-server --output dist/example-v2.tgz
    bun ng-addon inspect-v2 --archive dist/example-v2.tgz

See the [complete v2 developer guide](docs/V2-DEVELOPER.md) for JavaScript,
TypeScript, manifest schema, trust limits and independent review requirements.
**The existing private ngapi currently accepts v1 only.** V2 bundles cannot
be published or installed until independent executable review, signed registry
metadata and secure host execution are ready.

## Current capabilities

| Feature | Status |
| --- | --- |
| Manifest validation and content-only packaging | Supported |
| GitHub App publishing, review, updates and withdrawal | Supported |
| Signed approved release catalog | Supported |
| Installed-site Account Mode marketplace | In development |
| Server JS/TS authoring, reproducible v2 packaging and offline inspection | Developer lab (not publishable) |
| Executable React, MDX, server, AI or OAuth marketplace installation | Not yet supported |

The single `nextguide` package contains foundation APIs for future extensions. This is **not** permission to publish or execute third-party JavaScript.

See [NextGuide Add-ons documentation](https://m1nsook.github.io/NextGuide/addons/), [authoring](docs/AUTHORING.md), [review policy](docs/REVIEW.md), [manifest schema](schema/nextguide-addon.schema.json), and [security policy](SECURITY.md).

This public template does not contain private registry code, credentials, operator-only URLs or deployment settings.
