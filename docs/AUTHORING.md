# Add-on authoring

`nextguide-addon.json` is the authoritative manifest. The first package format accepts **Account Mode, content-only** add-ons.

- `id`: Permanent publisher-qualified lowercase identifier, e.g. `acme.my-docs`.
- `version`: SemVer; every changed Release must increment the version.
- `repository`: The public GitHub HTTPS repository containing the exact commit and published Release. **Change it from the template URL**.
- `compatibility.mode`: Always `account` for now.
- `compatibility.nextguide`: An explicit SemVer interval, e.g. `>=1.0.0 <2.0.0`. This is a future 1.x example; NextGuide alpha does not yet have an add-on installer.
- `category`: A descriptive label. It is not permission to execute arbitrary code.
- `permissions`: Must be `[]`.
- `icon`: Relative path to a local PNG. Use your own icon; 32–1024 px, maximum 256 KiB; a 256×256 square works well. Remote images and SVG are not supported.
- `entrypoints.content`: A relative directory containing only `.md` files (at least one).
- `author` and `license`: Identify the publisher and include appropriate licensing information.

Run `bun test`, then `bun ng-addon pack`. Inspect the resulting SHA-256 archive, and commit and push the manifest, icon and Markdown content to your public GitHub repository.

Publish using the [NextGuide Publisher GitHub App](https://github.com/apps/nextguide-publisher). It authenticates with GitHub, verifies the committed source and release, and requests independent review. The browser workflow does not require a personal access token.

If an artifact exists but a submission fails, the publisher can reuse it only when GitHub's asset digest, byte size and download URL match the verified archive. Do not modify or replace an existing Release asset.

Unreviewed scripts, executable MDX, OAuth handlers, network access, and arbitrary JavaScript are not supported. A versioned permission model and sandbox API must be implemented before enabling such categories.

See the complete [NextGuide documentation](https://m1nsook.github.io/NextGuide/addons/).
