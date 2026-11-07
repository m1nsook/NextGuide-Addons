#!/usr/bin/env node
// Developer-owned NextGuide add-on publisher. Never transmits GITHUB_TOKEN to NextGuide.
// Only content-only Account Mode add-ons can be packed by this v1 CLI.
import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { readFileSync, readdirSync, lstatSync, writeFileSync, mkdirSync } from "node:fs"
import { join, resolve, relative, sep, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { validateAddon } from "./validate-addon.mjs"

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex")
const gitBlob = bytes => createHash("sha1").update(Buffer.from("blob " + bytes.length + "\0")).update(bytes).digest("hex")
const SHA = /^[a-f0-9]{40}$/i
function options(argv) {
  const result = {}
  for (let i=0;i<argv.length;i++) {
    const key = argv[i]
    if (!/^--[a-z-]+$/.test(key)) throw Error("Unknown argument: " + key)
    if (key === "--dry-run") { result.dryRun=true;continue }
    if (!argv[i+1] || argv[i+1].startsWith("--")) throw Error("Missing value for " + key)
    if (Object.hasOwn(result,key.slice(2))) throw Error("Duplicate option: "+key)
    result[key.slice(2)]=argv[++i]
  }
  return result
}
function tarMember(path,bytes) {
  if (Buffer.byteLength(path,"utf8") > 100) throw Error("Archive path is longer than 100 bytes: "+path)
  if (bytes.length > 256*1024) throw Error("Archive member exceeds 256 KiB: "+path)
  const block = Buffer.alloc(512)
  block.write(path,0,100,"utf8")
  block.write("0000644\0",100,8,"ascii")
  block.write("0000000\0",108,8,"ascii")
  block.write("0000000\0",116,8,"ascii")
  block.write(bytes.length.toString(8).padStart(11,"0")+"\0",124,12,"ascii")
  block.write("00000000000\0",136,12,"ascii")
  block.fill(32,148,156)
  block.write("0",156,1,"ascii")
  block.write("ustar\0",257,6,"ascii")
  block.write("00",263,2,"ascii")
  const checksum=block.reduce((a,b)=>a+b,0)
  block.write(checksum.toString(8).padStart(6,"0")+"\0 ",148,8,"ascii")
  return Buffer.concat([block,bytes,Buffer.alloc((512-bytes.length%512)%512)])
}
export function packAddon(source=process.cwd()) {
  source=resolve(source)
  validateAddon(source)
  const manifest=JSON.parse(readFileSync(join(source,"nextguide-addon.json"),"utf8"))
  const items=[
    {path:"nextguide-addon.json",bytes:readFileSync(join(source,"nextguide-addon.json"))},
    {path:manifest.icon,bytes:readFileSync(join(source,manifest.icon))}
  ]
  const contentRoot=join(source,manifest.entrypoints.content)
  function walk(directory) {
    for(const dirent of readdirSync(directory,{withFileTypes:true})) {
      const full=join(directory,dirent.name)
      if(dirent.isSymbolicLink()||lstatSync(full).isSymbolicLink())throw Error("Symlinks are forbidden")
      if(dirent.isDirectory()) {walk(full);continue}
      if(!dirent.isFile()||!dirent.name.endsWith(".md"))throw Error("Content must be Markdown only")
      items.push({path:relative(source,full).split(sep).join("/"),bytes:readFileSync(full)})
    }
  }
  walk(contentRoot)
  const unique=new Set(items.map(x=>x.path))
  if(unique.size!==items.length)throw Error("Icon path conflicts with content or manifest")
  items.sort((a,b)=>a.path.localeCompare(b.path,"en"))
  const tar=Buffer.concat([...items.map(i=>tarMember(i.path,i.bytes)),Buffer.alloc(1024)])
  const archive=gzipSync(tar,{level:9,mtime:0})
  if(archive.byteLength>3*1024*1024)throw Error("Archive must be 3 MiB or less")
  return { manifest, archive, items, sha256:sha256(archive),
    name:"nextguide-addon-"+manifest.version+".tgz" }
}
async function github(url,token,method="GET",data) {
  const r=await fetch(url,{method,headers:{
    "Authorization":"Bearer "+token, "Accept":"application/vnd.github+json",
    "User-Agent":"nextguide-addon-cli/1", "X-GitHub-Api-Version":"2022-11-28",
    ...(data?{"Content-Type":"application/json"}:{})
  },body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)})
  const json=await r.json().catch(()=>({}))
  if(!r.ok)throw Error("GitHub HTTP "+r.status+": "+String(json.message||"Unknown error"))
  return json
}
function sourceRepo(manifest) {
  const m=/^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/?$/.exec(manifest.repository)
  if(!m)throw Error("Manifest repository must be a GitHub HTTPS repository")
  return {owner:m[1],repo:m[2]}
}
async function checkGitHubSource(packed,token,commitOverride) {
  const {owner,repo}=sourceRepo(packed.manifest)
  const base="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo)
  const meta=await github(base,token)
  if(meta.private)throw Error("Only public GitHub repositories can be published")
  const commit=commitOverride||meta.default_branch
  const details=await github(base+"/commits/"+encodeURIComponent(commit),token)
  if(!SHA.test(details.sha))throw Error("GitHub did not return a full commit SHA")
  const tree=await github(base+"/git/trees/"+details.commit.tree.sha+"?recursive=1",token)
  if(tree.truncated||!Array.isArray(tree.tree))throw Error("GitHub tree is truncated")
  const hashes=new Map(tree.tree.filter(x=>x.type==="blob").map(x=>[x.path,x.sha]))
  for(const item of packed.items)if(hashes.get(item.path)!==gitBlob(item.bytes)) {
    throw Error("Your local "+item.path+" does not match commit "+details.sha+". Commit and push your changes first.")
  }
  return {owner,repo,base,commit:details.sha}
}
async function publish(packed,flags) {
  const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN
  if(!token)throw Error("Set GITHUB_TOKEN or GH_TOKEN with Contents: write for YOUR add-on repository")
  const githubSource=await checkGitHubSource(packed,token,flags.commit)
  const {base,owner,repo,commit}=githubSource
  const tag="v"+packed.manifest.version
  const target="https://github.com/"+owner+"/"+repo+"/releases/download/"+tag+"/"+packed.name
  console.log("Verified source:",commit)
  console.log("Archive SHA-256:",packed.sha256)
  if(flags.dryRun) { console.log("Dry run: no release uploaded or registry submission");return }
  let release
  try {release=await github(base+"/releases/tags/"+encodeURIComponent(tag),token)}
  catch(e) { if(!String(e.message).includes("HTTP 404"))throw e }
  if(!release) {
    release=await github(base+"/releases",token,"POST",{
      tag_name:tag,target_commitish:commit,name:packed.manifest.name+" "+packed.manifest.version,
      draft:false,prerelease:false,generate_release_notes:false
    })
  }
  const match=(release.assets||[]).find(x=>x.name===packed.name)
  if(match)throw Error("Release already has an artifact with this name. Releases must be immutable; bump the version.")
  const upload=new URL("https://uploads.github.com/repos/"+owner+"/"+repo+"/releases/"+release.id+"/assets")
  upload.searchParams.set("name",packed.name)
  const uploaded=await fetch(upload,{method:"POST",headers:{
    "Authorization":"Bearer "+token,"Accept":"application/vnd.github+json",
    "Content-Type":"application/gzip","Content-Length":String(packed.archive.length),
    "User-Agent":"nextguide-addon-cli/1"
  },body:packed.archive,signal:AbortSignal.timeout(30000)})
  if(!uploaded.ok)throw Error("GitHub asset upload failed: HTTP "+uploaded.status)
  const asset=await uploaded.json()
  if(asset.browser_download_url!==target)throw Error("Unexpected GitHub artifact URL")
  const api=new URL(flags.registry||"https://ngapi.m1nsook.com")
  if(api.protocol!=="https:" && !(api.protocol==="http:"&&["127.0.0.1","localhost"].includes(api.hostname)))throw Error("Registry URL requires HTTPS")
  const endpoint=new URL("/v1/submissions",api)
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({repository:packed.manifest.repository,tag,commit,assetUrl:target,sha256:packed.sha256}),
    signal:AbortSignal.timeout(30000)})
  const result=await response.json().catch(()=>({}))
  if(response.status!==202)throw Error("GitHub Release created, but registry submission failed ("+response.status+"): "+String(result.error||"Unknown error"))
  console.log("Submitted for owner approval:",result.id)
  console.log("Registry status:",result.status)
}
export async function main(argv=process.argv.slice(2)) {
  const action=argv[0],flags=options(argv.slice(1))
  if(!action||action==="help"||action==="--help") {
    console.log("bun ng-addon pack [--output dist/my-addon.tgz]\\nbun ng-addon publish [--commit 40-hex-sha] [--registry https://ngapi.m1nsook.com] [--dry-run]\\nRequires GITHUB_TOKEN for publish. Add-ons must be committed/pushed first.")
    return
  }
  if(!["pack","publish"].includes(action))throw Error("Unknown command: "+action)
  if(action==="pack" && Object.keys(flags).some(k=>k!=="output"))throw Error("pack supports --output only")
  if(action==="publish" && Object.keys(flags).some(k=>!["commit","registry","dryRun"].includes(k)))throw Error("Unexpected publish option")
  const packed=packAddon()
  if(action==="pack"){
    const file=resolve(flags.output||("dist/"+packed.name))
    mkdirSync(dirname(file),{recursive:true})
    writeFileSync(file,packed.archive,{flag:"w"})
    console.log("Packed:",file,"("+packed.archive.length+" bytes)")
    console.log("SHA-256:",packed.sha256)
    return
  }
  await publish(packed,flags)
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{console.error("Add-on publish failed:",e.message);process.exitCode=1})
}
