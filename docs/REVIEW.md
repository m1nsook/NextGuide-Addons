# Registry review and release policy

A contributor's repository is not the registry. Contributors never get write access to NextGuide core.

1. Author publishes an immutable commit and SemVer release, then files a submission.
2. A **trusted** verifier fetches that SHA, ignores potentially modified author-provided CI validators, and checks schema, compatibility, paths, size, license, content and provenance.
3. Human security review is required before admitting executable/capability-bearing modules, even when tests pass.
4. The reviewed immutable SHA, manifest digest and file hashes are published by a restricted registry publisher.
5. NextGuide Account Mode accepts only approved releases, verifies digest, requests new permissions, and records an audit trail.
6. Enable, disable, uninstall and update are transactional and support rollback. Revocations block future installs; existing installs receive a warning.
7. New upstream commits never install automatically. A new version is only offered after review. NextGuide npm releases are independent.

Static checking cannot prove arbitrary plugin code safe; no server-side evaluation of untrusted JS or node:vm sandboxing. The proposed ngapi.m1nsook.com registry is a future, not a working service.

