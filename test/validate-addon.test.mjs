import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateAddon } from "../scripts/validate-addon.mjs"

function fixture(change) {
  const root = mkdtempSync(join(tmpdir(), "ng-addon-"))
  const manifest = {
    schemaVersion: 1, id: "example.hello-world", name: "Hello World",
    summary: "Useful documentation add-on", description: "A valid documentation-only add-on package.",
    version: "1.0.0", author: { name: "Contributor" },
    repository: "https://github.com/example/hello-world", license: "MIT",
    category: "content", keywords: ["docs"],
    compatibility: { mode: "account", nextguide: ">=1.0.0 <2.0.0" },
    permissions: [], entrypoints: { content: "content" }
  }
  mkdirSync(join(root, "content"))
  writeFileSync(join(root, "content", "index.md"), "# Example\n")
  change?.(manifest, root)
  writeFileSync(join(root, "nextguide-addon.json"), JSON.stringify(manifest))
  return root
}
function using(change, check) {
  const root = fixture(change)
  try { check(root) } finally { rmSync(root, { recursive: true, force: true }) }
}
test("accepts valid content-only packages", () => using(null, root => assert.equal(validateAddon(root).files, 1)))
test("rejects Developer Mode", () => using(m => { m.compatibility.mode = "developer" }, root => assert.throws(() => validateAddon(root), /Account Mode/)))
test("rejects path traversal", () => using(m => { m.entrypoints.content = "../outside" }, root => assert.throws(() => validateAddon(root), /relative POSIX path/)))
test("rejects undeclared runtime permissions", () => using(m => { m.permissions = ["network"] }, root => assert.throws(() => validateAddon(root), /no permissions/)))
test("rejects executable payload", () => using((m, root) => { writeFileSync(join(root, "content", "script.js"), "console.log('no')") }, root => assert.throws(() => validateAddon(root), /Only .md/)))
test("rejects symlinks", () => using((m, root) => { symlinkSync(join(root, "content", "index.md"), join(root, "content", "duplicate.md")) }, root => assert.throws(() => validateAddon(root), /Symbolic links/)))
test("rejects unknown manifest properties", () => using(m => { m.installScript = "unsafe" }, root => assert.throws(() => validateAddon(root), /unknown field/)))
test("rejects wild compatibility", () => using(m => { m.compatibility.nextguide = "*" }, root => assert.throws(() => validateAddon(root), /compatibility range/)))
