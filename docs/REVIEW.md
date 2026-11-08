# Add-on release review policy

The NextGuide add-on review process is independent of developer CI. Use the [NextGuide Publisher GitHub App](https://github.com/apps/nextguide-publisher) to submit releases. The catalog is signed; the installed-site marketplace is still in development.

1. A developer commits a valid content-only release to a public GitHub repository.
2. The service verifies the selected commit, manifest, icon, Markdown content, SHA-256 digest and immutable GitHub Release provenance.
3. Every version enters a pending review queue. Developers can view submission status in the publisher.
4. Authorized moderation may approve or reject a release. Approved versions appear in the signed catalog.
5. New versions require higher SemVer and a fresh review. Revoked releases are not offered for new installations.
6. Future Account Mode clients must pin the signing key, verify catalog signatures and archive digests, and enforce permissions and compatibility.

**Review is not permission to execute code.** The current registry only accepts content-only v1 add-ons with no executable MDX, scripts or privileged hooks. Executable extensions require isolation and explicit owner permissions.

Developer submissions do not grant access to unrelated repositories, platform credentials or the NextGuide core.

This public policy does not expose internal operator routes or private registry deployment configuration.
