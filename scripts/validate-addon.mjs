#!/usr/bin/env node
// Static checks only. Passing never implies an add-on is secure to run.
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { join, resolve, relative, sep, extname, isAbsolute } from "node:path"
import { pathToFileURL } from "node:url"

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const CATEGORIES = new Set(["content", "theme", "icons", "language", "ai", "oauth", "integration", "accessibility", "other"])
const ROOT_KEYS = ["$schema", "schemaVersion", "id", "name", "summary", "description", "version", "author", "repository", "license", "category", "keywords", "compatibility", "permissions", "entrypoints"]

function object(value, what) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw Error(what + " must be an object")
}
function exactKeys(value, allowed, what) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw Error(what + " has unknown field: " + key)
}
function string(value, what, min = 1, max = 2000) {
  if (typeof value !== "string" || value.length < min || value.length > max || !value.trim()) throw Error(what + " is missing or invalid")
}
function safePath(root, value, what) {
  string(value, what, 1, 160)
  if (isAbsolute(value) || value.includes("\\") || value.startsWith("/") ||
      value.split("/").some(part => !part || part === "." || part === "..")) {
    throw Error(what + " must be a clean relative POSIX path")
  }
  const target = resolve(root, value)
  if (!target.startsWith(root + sep)) throw Error(what + " escapes the add-on root")
  if (realpathSync(target) !== target) throw Error(what + " must not resolve through a symbolic link")
  return target
}
function scanContent(directory, root, found) {
  if (lstatSync(directory).isSymbolicLink()) throw Error("Symbolic links are not allowed")
  const files = readdirSync(directory, { withFileTypes: true })
  for (const item of files) {
    const full = join(directory, item.name)
    if (item.isSymbolicLink()) throw Error("Symbolic links are not allowed: " + relative(root, full))
    if (item.isDirectory()) scanContent(full, root, found)
    else if (item.isFile()) {
      if (extname(item.name) !== ".md") throw Error("Only .md documentation is accepted in v1: " + relative(root, full))
      if (lstatSync(full).size > 262144) throw Error("Documentation exceeds 256 KiB: " + relative(root, full))
      found.count++
      if (found.count > 100) throw Error("Too many content files (maximum 100)")
    } else throw Error("Unsupported filesystem entry: " + relative(root, full))
  }
}
export function validateAddon(rootDir = process.cwd()) {
  const root = realpathSync(resolve(rootDir))
  const manifestPath = join(root, "nextguide-addon.json")
  if (lstatSync(manifestPath).isSymbolicLink()) throw Error("Manifest cannot be a symbolic link")
  if (lstatSync(manifestPath).size > 65536) throw Error("Manifest exceeds 64 KiB")
  const m = JSON.parse(readFileSync(manifestPath, "utf8"))
  object(m, "Manifest"); exactKeys(m, ROOT_KEYS, "Manifest")
  if (m.schemaVersion !== 1) throw Error("schemaVersion must be 1")
  string(m.id, "id", 3, 100); if (!ID.test(m.id)) throw Error("id must use publisher.addon-slug")
  string(m.name, "name", 3, 80); string(m.summary, "summary", 8, 160)
  string(m.description, "description", 12, 2000)
  string(m.version, "version"); if (!VERSION.test(m.version)) throw Error("version must use SemVer")
  object(m.author, "author"); exactKeys(m.author, ["name", "url"], "author")
  string(m.author.name, "author.name", 2, 100)
  if (m.author.url !== undefined) {
    string(m.author.url, "author.url")
    const u = new URL(m.author.url); if (u.protocol !== "https:") throw Error("author.url must use HTTPS")
  }
  string(m.repository, "repository")
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(m.repository)) throw Error("repository must be a GitHub HTTPS repository URL")
  string(m.license, "license", 2, 80)
  if (!CATEGORIES.has(m.category)) throw Error("Invalid category")
  if (!Array.isArray(m.keywords) || m.keywords.length < 1 || m.keywords.length > 12 || new Set(m.keywords).size !== m.keywords.length ||
      !m.keywords.every(k => typeof k === "string" && /^[a-z0-9][a-z0-9-]{1,39}$/.test(k))) throw Error("Invalid keywords")
  object(m.compatibility, "compatibility"); exactKeys(m.compatibility, ["mode", "nextguide"], "compatibility")
  if (m.compatibility.mode !== "account") throw Error("Add-ons are Account Mode only")
  string(m.compatibility.nextguide, "compatibility.nextguide", 3, 80)
  if (!/^(?:[<>=~^ ]*[0-9]+\.[0-9]+\.[0-9]+)(?:\s+[<>=~^ ]*[0-9]+\.[0-9]+\.[0-9]+)*$/.test(m.compatibility.nextguide)) throw Error("Invalid compatibility range")
  if (!Array.isArray(m.permissions) || m.permissions.length) throw Error("Content-only add-ons must have no permissions")
  object(m.entrypoints, "entrypoints"); exactKeys(m.entrypoints, ["content"], "entrypoints")
  const contentDir = safePath(root, m.entrypoints.content, "entrypoints.content")
  if (!lstatSync(contentDir).isDirectory()) throw Error("Content must be a directory")
  const found = { count: 0 }
  scanContent(contentDir, root, found)
  if (!found.count) throw Error("At least one Markdown file is required")
  return { id: m.id, version: m.version, files: found.count }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateAddon(process.argv[2] || process.cwd())
    console.log("Valid manifest and content:", result.id, result.version, "(" + result.files + " Markdown files)")
    console.log("Static checks only. Independent registry review is still required.")
  } catch (err) {
    console.error("Add-on validation failed:", err.message)
    process.exitCode = 1
  }
}
