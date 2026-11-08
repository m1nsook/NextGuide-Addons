# Registry review and release policy

**Registry status:** The separate `ngapi.m1nsook.com` registry has a signed read-only catalog and a Cloudflare Access-protected owner review dashboard. Public publisher submissions are currently blocked at nginx until production hardening is finished. The installed-site Account Mode marketplace and installer are not ready.

1. A developer publishes a public GitHub commit and a SemVer Release containing a content-only `.tgz`.
2. The registry independently verifies the exact commit, package manifest, PNG, Markdown, artifact SHA-256 and GitHub Release provenance. Developer-provided CI results are not trusted as verification.
3. Submission enters the **pending** queue and notifies the registry owner.
4. The owner independently reviews and approves or rejects a release; approval re-checks the source and updates the Ed25519-signed registry.
5. Approved metadata becomes visible through the public catalog and signed index. It **does not yet install automatically**.
6. Future Account Mode clients must pin the registry signing key, verify both signature and exact archive hash, enforce compatibility and declared permissions, and support transactional rollback.
7. Each update requires a new higher SemVer and independent review. Revoked versions must not be offered as new installs.

Developer submissions do not give write access to NextGuide core or owner secrets. Nothing in the current template may execute untrusted third-party code or import arbitrary runtime dependencies.

No server application, owner dashboard implementation, deployment config or secrets belong in the public NextGuide or NextGuide-Addons repositories.
