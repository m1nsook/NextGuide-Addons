# Add-on authoring

The authoritative file is `nextguide-addon.json`. The v1 validator only accepts content-only Account Mode packages.

- id: publisher-qualified lowercase identifier; permanent across releases.
- version: SemVer; increment for every published release.
- compatibility.mode: account, always.
- compatibility.nextguide: explicit semver interval (for example >=1.0.0 <2.0.0).
- category: content, theme, icons, language, ai, oauth, integration, accessibility or other. This is descriptive, not an executable entitlement.
- permissions: empty until a permissioned runtime exists.
- icon: required relative path to your own branded PNG icon (the template supplies `icon.png`). Prefer a square transparent 256×256 file. PNG size limit: 256 KiB; width/height: 32–1024 pixels. The icon is included in the release artifact, verified against your immutable commit and shown on cards/detail pages in the authenticated Account Mode marketplace. Remote image URLs and SVG icons are not yet permitted.
- entrypoints.content: a clean relative directory containing only .md files.

The add-on template does not run arbitrary JavaScript/MDX, shell commands, git hooks or post-install scripts.

Planned API points include documentation sources/blocks, theme tokens, icon packs, locale catalogs, AI providers, OAuth providers, integrations and accessibility hooks. An API contract must be versioned and implemented in NextGuide before these can be installed. Do not import fictional SDK methods.

Maintain a changelog, clear license and source repository. Never commit credentials or private keys.
