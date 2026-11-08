import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const root = dirname(dirname(fileURLToPath(import.meta.url)))
test("public template references only developer-facing publishing entrypoints", () => {
  for (const path of ["README.md", "docs/AUTHORING.md", "docs/REVIEW.md"]) {
    const contents = readFileSync(join(root, path), "utf8")
    assert.doesNotMatch(contents, /ngapi\.m1nsook\.com|\/admin\b|cloudflare access/i, path)
    assert.match(contents, /github\.com\/apps\/nextguide-publisher/, path)
  }
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /\/NextGuide\/addons\//)
})
