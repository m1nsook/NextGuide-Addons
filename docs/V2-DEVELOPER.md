# Executable v2 add-on developer lab

**Status: developer preview. Not a production marketplace or deployed registry protocol.**

The current ngapi v1 registry accepts signed **content-only** releases. V2 packages
made here are **offline developer artifacts** for building, testing and independent
review. They cannot be published with the existing v1 publish command, installed
in Account Mode, or executed from an unreviewed registry release. The private
ngapi reviewer needs a separate signed v2 protocol first.

## Try a real capability add-on

The [Activation Counter](../examples/v2-server/nextguide-addon.json) example is
functional JavaScript: its activate function requests the extension identity,
increments namespaced storage, then publishes a **declarative** admin page.
It receives a broker request function, never raw filesystem paths, database
clients, secrets, or a network socket.

From the root of this repository run:

    bun ng-addon build-v2 --project examples/v2-server
    bun ng-addon validate-v2 --project examples/v2-server
    bun ng-addon pack-v2 --project examples/v2-server --output dist/example-v2.tgz
    bun ng-addon inspect-v2 --archive dist/example-v2.tgz
    bun test

The example includes a prebuilt module, so validate-v2, pack-v2, inspect-v2 and
tests also work under Node 22+ without installing Bun. Bun builds a fresh single
module from JavaScript or TypeScript source when the build-v2 command is run.

## Make your own JavaScript or TypeScript add-on

Create a repository from this template. Copy the examples/v2-server project
and update the manifest ID, repository URL, license, author and permissions.
Edit src/server.js or rename it to src/server.ts. Exactly one of server.ts,
server.js or server.mjs must exist under src/. The v2 compiler bundles it to
dist/server.mjs. Run the commands above with your project directory.

Keep the root v1 add-on as content-only until you deliberately migrate. Never
run the v1 publish command against a v2 manifest, or assume an unsigned archive
constitutes registry approval.

The deliberately narrow v2 laboratory format supports:

- Account Mode only, with a compiled single-file server entrypoint.
- A reviewable original source file included inside the package.
- Reproducible tar.gz with stable names, zero mtime and no symlinks.
- A nextguide-integrity.json record of source, compiled bundle and manifest
  SHA-256 and sizes, plus the exact manifest permission list.
- An optional PNG icon; no arbitrary embedded executables or extra files.
- Maximum 1 MiB compiled module to match the experimental Linux runner.

The server example requests storage.read, storage.write and admin.pages and
uses the actual NextGuide broker protocol:

    request("extension.info")
    request("storage.get", { key: "activations" })
    request("storage.set", { key: "activations", value: 1 })
    request("contribution.publish", {
      kind: "admin.page",
      descriptor: { title: "Example", view: { type: "paragraph", text: "Hello" } }
    })

Those strings are protocol method names. Production owner permission approval
and the isolation boundary remain mandatory; a manifest cannot grant itself
capabilities.

## Independent review and safety

The inspector verifies source/compiled byte hashes, tar/gzip formatting,
manifest shape, requested permissions, allowed paths, quotas and non-duplicated
files. It reads module bytes, but never imports, evaluates or runs them.

It does not sign the archive, prove that compiled output was built from the
source, scan behavior for malware, or make an extension safe to run.
Independent reviewers must reproduce builds and compare to the actual source
commit, approve an immutable release, sign v2 metadata in the **separate private
registry**, and bind owner grants to the approved digest at activation.

Reviewer command:

    node scripts/ng-addon.mjs inspect-v2 --archive path/to/addon.tgz

**Do not execute arbitrary v2 code with a host-process import, Node worker,
node:vm or an unreviewed runner.** Linux sandbox hardening, memory/process
cgroups, Windows support or explicit refusal, browser UI isolation, v2 private
registry acceptance and transactional install/update/rollback are separate
release gates. The existing v1 index and signatures never authorize v2.
