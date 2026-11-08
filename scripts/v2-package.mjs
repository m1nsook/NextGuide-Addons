/**
 * NextGuide v2 developer bundle LAB (NOT registry publishing or authorization).
 *
 * Offline deterministic archiver + independent byte-level self-check. It runs
 * neither the compiled module nor its lifecycle hooks. The private v1 registry
 * does not accept v2 artifacts and must not be bypassed.
 */
import { createHash } from "node:crypto"
import {
  existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync
} from "node:fs"
import { resolve, join, dirname, sep } from "node:path"
import { spawnSync } from "node:child_process"
import { gzipSync, gunzipSync } from "node:zlib"

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const REPO = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/
const PATH = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/
const INTEGRITY = "nextguide-integrity.json"
const MANIFEST = "nextguide-addon.json"
const ENTRYPOINT = "dist/server.mjs"
const MAX_FILE = 1024 * 1024
const MAX_SOURCE = 512 * 1024
const MAX_TAR = 3 * 1024 * 1024
const MAX_ARCHIVE = 3 * 1024 * 1024
const MAX_MEMBERS = 5
const ALLOWED_PERMISSIONS = new Set([
  "docs.pages", "mdx.blocks", "ui.components", "admin.pages",
  "theme.tokens", "icons.packs", "i18n.locales", "ai.providers",
  "auth.providers", "server.routes", "server.jobs",
  "storage.read", "storage.write", "network.fetch", "secrets.read"
])
const sha = input => createHash("sha256").update(input).digest("hex")
function fail(message) { throw Error("NextGuide v2 bundle: " + message) }
function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v) }
function cleanPath(path) {
  return typeof path === "string" && path.length <= 100 &&
    PATH.test(path) && path.split("/").every(x =>
      x !== "." && x !== ".." && !x.startsWith(".") && !x.endsWith("."))
}
function projectDir(project) {
  const root = resolve(project)
  if (!existsSync(root) || !lstatSync(root).isDirectory() ||
      lstatSync(root).isSymbolicLink() || realpathSync(root) !== root) {
    fail("Source must be a real project directory with no symlink")
  }
  return root
}
function regular(root, path, max = MAX_FILE) {
  if (!cleanPath(path)) fail("Unsafe source path: " + String(path))
  let current = root
  for (const part of path.split("/")) {
    current = join(current, part)
    if (!existsSync(current)) fail("Missing required file: " + path)
    const stat = lstatSync(current)
    if (stat.isSymbolicLink()) fail("Symbolic links are forbidden: " + path)
    if (current !== join(root, path) && !stat.isDirectory()) {
      fail("Path parent is not a directory: " + path)
    }
  }
  const stat = lstatSync(current)
  if (!stat.isFile() || stat.size === 0 || stat.size > max ||
      realpathSync(current) !== current) fail("Invalid file or size: " + path)
  return readFileSync(current)
}
function sourceFile(root) {
  const choices = ["src/server.ts", "src/server.js", "src/server.mjs"]
  const available = choices.filter(path => existsSync(join(root,path)))
  if (available.length !== 1) fail("Provide exactly one src/server.ts, .js or .mjs")
  return available[0]
}
function parseJson(bytes, label) {
  let value
  try { value = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)) }
  catch { fail("Invalid UTF-8 JSON in " + label) }
  if (!object(value)) fail("Expected JSON object in " + label)
  return value
}
function validateManifest(m) {
  if (!object(m) || m.schemaVersion !== 2 || !NAME.test(m.id) ||
      !VERSION.test(m.version) || typeof m.name !== "string" ||
      m.name.length < 3 || m.name.length > 80 ||
      !REPO.test(m.repository) || !object(m.compatibility) ||
      m.compatibility.mode !== "account" ||
      typeof m.compatibility.nextguide !== "string" ||
      !/^>=\d+\.\d+\.\d+\s+<\d+\.\d+\.\d+$/.test(m.compatibility.nextguide) ||
      !Array.isArray(m.permissions) || m.permissions.length > 16 ||
      m.permissions.some(p => !ALLOWED_PERMISSIONS.has(p)) ||
      new Set(m.permissions).size !== m.permissions.length ||
      !object(m.entrypoints) ||
      Object.keys(m.entrypoints).length !== 1 ||
      m.entrypoints.server !== ENTRYPOINT) {
    fail("Invalid v2 server manifest, capability list, or Account Mode compatibility")
  }
  if (m.icon !== undefined && (!cleanPath(m.icon) || !m.icon.endsWith(".png") ||
      m.icon === MANIFEST || m.icon === INTEGRITY ||
      m.icon === ENTRYPOINT || m.icon.startsWith("src/"))) {
    fail("Invalid optional PNG icon path")
  }
  return m
}
function tarMember(name, input) {
  if (!cleanPath(name)) fail("Unsafe tar member path")
  const bytes=Buffer.from(input)
  if (Buffer.byteLength(name,"utf8") > 100 ||
      bytes.length > MAX_FILE) fail("Tar member quota exceeded")
  const header=Buffer.alloc(512)
  header.write(name,0,100,"utf8")
  header.write("0000644\0",100,8,"ascii")
  header.write("0000000\0",108,8,"ascii")
  header.write("0000000\0",116,8,"ascii")
  header.write(bytes.length.toString(8).padStart(11,"0")+"\0",124,12,"ascii")
  header.write("00000000000\0",136,12,"ascii")
  header.fill(32,148,156)
  header.write("0",156)
  header.write("ustar\0",257)
  header.write("00",263)
  const checksum=header.reduce((sum,n)=>sum+n,0)
  header.write(checksum.toString(8).padStart(6,"0")+"\0 ",148,8)
  return Buffer.concat([header,bytes,Buffer.alloc((512 - bytes.length % 512) % 512)])
}
function octal(bytes) {
  const str=bytes.toString("ascii").replace(/\0.*$/,"").trim()
  if (!/^[0-7]+$/.test(str)) fail("Malformed octal tar field")
  const n=Number.parseInt(str,8)
  if (!Number.isSafeInteger(n)) fail("Oversized tar field")
  return n
}
function parseTar(archive) {
  if (!(archive instanceof Uint8Array) || archive.byteLength < 32 ||
      archive.byteLength > MAX_ARCHIVE) fail("Archive size quota exceeded")
  if (archive[0] !== 0x1f || archive[1] !== 0x8b) fail("Expected gzip archive")
  let bytes
  try { bytes=gunzipSync(archive,{maxOutputLength:MAX_TAR}) }
  catch { fail("Archive is corrupt or decompresses beyond quota") }
  const files=new Map()
  let offset=0,finished=false
  while (offset + 512 <= bytes.length) {
    const header=bytes.subarray(offset,offset+512)
    if (header.every(value=>value===0)) {
      if (bytes.length-offset<1024 ||
          bytes.subarray(offset).some(value=>value!==0)) fail("Missing tar end blocks")
      finished=true
      break
    }
    if (header.subarray(257,263).toString("ascii")!=="ustar\0" ||
        header.subarray(263,265).toString("ascii")!=="00" ||
        header[156] !== 48 ||
        header.subarray(345,500).some(value=>value!==0)) {
      fail("Only regular ustar members are permitted")
    }
    const checksum=Buffer.from(header)
    checksum.fill(32,148,156)
    if (checksum.reduce((sum,n)=>sum+n,0)!==octal(header.subarray(148,156))) {
      fail("Tar checksum mismatch")
    }
    const end=header.subarray(0,100).indexOf(0)
    const name=header.subarray(0,end<0?100:end).toString("ascii")
    if (!cleanPath(name) || files.has(name.toLowerCase())) {
      fail("Unsafe or duplicate tar member")
    }
    const size=octal(header.subarray(124,136))
    const start=offset+512, finish=start+size
    const next=start+Math.ceil(size/512)*512
    if (size<1 || size>MAX_FILE || next>bytes.length ||
        bytes.subarray(finish,next).some(value=>value!==0)) fail("Invalid member size or padding")
    files.set(name.toLowerCase(),{name,bytes:Buffer.from(bytes.subarray(start,finish))})
    if (files.size > MAX_MEMBERS) fail("Too many archive members")
    offset=next
  }
  if (!finished) fail("Missing tar terminator")
  return files
}
function expectDigest(files, record, label, max) {
  if (!object(record) || !cleanPath(record.path) ||
      !/^[a-f0-9]{64}$/.test(record.sha256) ||
      !Number.isSafeInteger(record.size) || record.size<1 || record.size>max) {
    fail("Malformed " + label + " integrity record")
  }
  const member=files.get(record.path.toLowerCase())
  if (!member || member.name!==record.path || member.bytes.length!==record.size ||
      sha(member.bytes)!==record.sha256) fail(label + " digest/size mismatch")
  return member.bytes
}
/** Verifies local bytes only. NOT a signature, reviewer approval, or execution grant. */
export function inspectV2Archive(archive) {
  const files=parseTar(archive)
  const manifestMember=files.get(MANIFEST)
  const indexMember=files.get(INTEGRITY)
  if (!manifestMember || !indexMember) fail("Manifest or integrity record missing")
  const manifest=validateManifest(parseJson(manifestMember.bytes,MANIFEST))
  const index=parseJson(indexMember.bytes,INTEGRITY)
  if (index.schemaVersion !== 2 || index.format !== "nextguide-single-server-v2" ||
      !object(index.manifest) || index.manifest.path !== MANIFEST ||
      !object(index.server) || index.server.path !== ENTRYPOINT ||
      !object(index.source) || !/^src\/server\.(?:ts|js|mjs)$/.test(index.source.path) ||
      !Array.isArray(index.permissions) ||
      JSON.stringify(index.permissions)!==JSON.stringify(manifest.permissions)) {
    fail("Inconsistent v2 integrity descriptor")
  }
  expectDigest(files,index.manifest,"manifest",65536)
  const server=expectDigest(files,index.server,"compiled server",MAX_FILE)
  expectDigest(files,index.source,"reviewable source",MAX_SOURCE)
  const names=[MANIFEST,INTEGRITY,index.source.path,ENTRYPOINT]
  if (manifest.icon !== undefined) {
    names.push(manifest.icon)
    const icon=files.get(manifest.icon.toLowerCase())
    if (!icon || icon.name!==manifest.icon || icon.bytes.length>256*1024 ||
        !icon.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      fail("Invalid optional PNG icon")
    }
    expectDigest(files,index.icon,"icon",256*1024)
  } else if (index.icon !== undefined) fail("Unexpected icon descriptor")
  if (files.size!==names.length ||
      names.some(name=>!files.has(name.toLowerCase())) ||
      new Set(names.map(x=>x.toLowerCase())).size!==names.length) {
    fail("Archive contains unexpected or duplicate files")
  }
  // No static regex can prove compiled JS safe. A future independent reviewer
  // must separately verify source provenance, the compiler, and sandbox policy.
  return {manifest,index,sourceSha256:index.source.sha256,
    serverSha256:sha(server),archiveSha256:sha(archive),archiveSize:archive.length}
}

/** Deterministic, self-verified v2 dev artifact; NOT publishable to v1 ngapi. */
export function packV2(project = process.cwd()) {
  const root=projectDir(project)
  const manifestBytes=regular(root,MANIFEST,65536)
  const manifest=validateManifest(parseJson(manifestBytes,MANIFEST))
  const source=sourceFile(root)
  const sourceBytes=regular(root,source,MAX_SOURCE)
  const serverBytes=regular(root,ENTRYPOINT,MAX_FILE)
  const files=[
    {name:MANIFEST,bytes:manifestBytes},
    {name:source,bytes:sourceBytes},
    {name:ENTRYPOINT,bytes:serverBytes},
  ]
  let iconRecord
  if (manifest.icon !== undefined) {
    const bytes=regular(root,manifest.icon,256*1024)
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      fail("Optional icon must be PNG")
    }
    files.push({name:manifest.icon,bytes})
    iconRecord={path:manifest.icon,size:bytes.length,sha256:sha(bytes)}
  }
  const record=(path,bytes)=>({path,size:bytes.length,sha256:sha(bytes)})
  const index={
    schemaVersion:2,format:"nextguide-single-server-v2",
    manifest:record(MANIFEST,manifestBytes),
    source:record(source,sourceBytes),
    server:record(ENTRYPOINT,serverBytes),
    ...(iconRecord?{icon:iconRecord}:{}),
    permissions:manifest.permissions,
  }
  files.push({name:INTEGRITY,bytes:Buffer.from(JSON.stringify(index,null,2)+"\n")})
  const archive=gzipSync(Buffer.concat([
    ...files.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)
      .map(item=>tarMember(item.name,item.bytes)),
    Buffer.alloc(1024)
  ]),{level:9,mtime:0})
  if (archive.length>MAX_ARCHIVE) fail("Compressed archive exceeds 3 MiB")
  const inspection=inspectV2Archive(archive)
  return {...inspection,archive,
    name:"nextguide-addon-v2-"+manifest.version+".tgz"}
}
/** Invokes local Bun as the DEVELOPER, never while processing registry files. */
export function buildV2(project=process.cwd()) {
  const root=projectDir(project)
  validateManifest(parseJson(regular(root,MANIFEST,65536),MANIFEST))
  const source=sourceFile(root)
  regular(root,source,MAX_SOURCE)
  const output=join(root,ENTRYPOINT)
  if (existsSync(output) && lstatSync(output).isSymbolicLink()) {
    fail("Compiled output must not be a symlink")
  }
  mkdirSync(dirname(output),{recursive:true})
  const built=spawnSync("bun",[
    "build",source,"--target=node","--format=esm","--outfile="+ENTRYPOINT
  ],{cwd:root,encoding:"utf8",timeout:120000,maxBuffer:1024*1024,shell:false,
    stdio:["ignore","pipe","pipe"]})
  if (built.error) fail("Bun build unavailable: "+built.error.message)
  if (built.status!==0) fail("Bun build failed: "+String(built.stderr).slice(0,1600))
  regular(root,ENTRYPOINT,MAX_FILE)
  return {source,entrypoint:ENTRYPOINT}
}
