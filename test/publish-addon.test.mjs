import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import { main, packAddon } from "../scripts/ng-addon.mjs"

const commit = "b".repeat(40)
const treeSha = "c".repeat(40)
const repoBase = "https://api.github.com/repos/example/hello-world"
function sha(bytes) { return createHash("sha1").update(Buffer.from("blob "+bytes.length+"\\0")).update(bytes).digest("hex") }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ng-publish-"))
  mkdirSync(join(root,"content"))
  writeFileSync(join(root,"content","index.md"),"# Hello world!\\n")
  writeFileSync(join(root,"icon.png"),readFileSync(new URL("../icon.png", import.meta.url)))
  writeFileSync(join(root,"nextguide-addon.json"),JSON.stringify({
    schemaVersion:1,id:"example.hello-world",name:"Hello World",
    summary:"Example documentation add-on",description:"An example content-only documentation package.",
    version:"0.1.0",author:{name:"Example"},repository:"https://github.com/example/hello-world",
    license:"MIT",category:"content",icon:"icon.png",keywords:["documentation"],
    compatibility:{mode:"account",nextguide:">=1.0.0 <2.0.0"},
    permissions:[],entrypoints:{content:"content"}
  }))
  return {root,cleanup:()=>rmSync(root,{recursive:true,force:true})}
}
function response(status, data) {
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}})
}
function mockApi(packed,{existing=false,badDigest=false,submissionStatus=202}={}) {
  const calls=[]
  const name=packed.name
  const target="https://github.com/example/hello-world/releases/download/v0.1.0/"+name
  const files=packed.items.map(item=>({path:item.path,type:"blob",sha:sha(item.bytes)}))
  const asset={name,digest:"sha256:"+(badDigest?"0".repeat(64):packed.sha256),
    size:packed.archive.length,state:"uploaded",browser_download_url:target}
  const fetchMock=async (input,opts={})=>{
    const url=String(input),method=opts.method||"GET"
    calls.push({url,method,body:opts.body,headers:opts.headers})
    if(url===repoBase && method==="GET")return response(200,{private:false,default_branch:"main"})
    if(url===repoBase+"/commits/main")return response(200,{sha:commit,commit:{tree:{sha:treeSha}}})
    if(url===repoBase+"/git/trees/"+treeSha+"?recursive=1")return response(200,{truncated:false,tree:files})
    if(url===repoBase+"/releases/tags/v0.1.0" && method==="GET")return existing?response(200,{id:42,assets:[asset]}):response(404,{message:"Not Found"})
    if(url===repoBase+"/releases" && method==="POST")return response(201,{id:42,assets:[]})
    if(url==="https://uploads.github.com/repos/example/hello-world/releases/42/assets?name="+name && method==="POST"){
      return response(201,{browser_download_url:target,digest:"sha256:"+packed.sha256})
    }
    if(url==="https://ngapi.m1nsook.com/v1/submissions" && method==="POST"){
      return response(submissionStatus,submissionStatus===202?{id:"pending-test-id",status:"pending"}:{error:"Submissions are temporarily unavailable"})
    }
    throw Error("Unexpected request: "+method+" "+url)
  }
  return {calls,fetchMock,target}
}
async function runPublisher(root,api,argv=["publish"]) {
  const previous={cwd:process.cwd(),fetch:globalThis.fetch,token:process.env.GITHUB_TOKEN}
  process.chdir(root)
  globalThis.fetch=api.fetchMock
  process.env.GITHUB_TOKEN="test-only-not-a-real-github-token"
  try { await main(argv) }
  finally {
    process.chdir(previous.cwd)
    globalThis.fetch=previous.fetch
    if(previous.token===undefined)delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN=previous.token
  }
}

test("packs validated source into a versioned gzip archive",()=>{
  const f=fixture()
  try {
    const packed=packAddon(f.root)
    assert.equal(packed.name,"nextguide-addon-0.1.0.tgz")
    assert.equal(packed.items.length,3)
    assert.ok(gunzipSync(packed.archive).includes(Buffer.from("nextguide-addon.json")))
    assert.equal(packed.sha256.length,64)
  }finally{f.cleanup()}
})

test("dry run validates GitHub commit without creating release or submission",async()=>{
  const f=fixture()
  try {
    const api=mockApi(packAddon(f.root))
    await runPublisher(f.root,api,["publish","--dry-run"])
    assert.equal(api.calls.length,3)
    assert.ok(api.calls.every(c=>c.method==="GET"))
  }finally{f.cleanup()}
})

test("publishes GitHub Release then submits its pinned digest for manual review",async()=>{
  const f=fixture()
  try {
    const packed=packAddon(f.root),api=mockApi(packed)
    await runPublisher(f.root,api)
    const uploaded=api.calls.find(c=>c.url.startsWith("https://uploads.github.com/"))
    const submission=api.calls.find(c=>c.url==="https://ngapi.m1nsook.com/v1/submissions")
    assert.ok(uploaded)
    assert.ok(submission)
    assert.equal(JSON.parse(submission.body).commit,commit)
    assert.equal(JSON.parse(submission.body).sha256,packed.sha256)
    assert.equal(submission.headers.Authorization,undefined)
    assert.equal(JSON.parse(submission.body).assetUrl,api.target)
  }finally{f.cleanup()}
})

test("can retry a failed submission without modifying an identical GitHub asset",async()=>{
  const f=fixture()
  try {
    const api=mockApi(packAddon(f.root),{existing:true})
    await runPublisher(f.root,api)
    assert.equal(api.calls.filter(c=>c.method==="POST").length,1)
    assert.equal(api.calls.find(c=>c.method==="POST").url,"https://ngapi.m1nsook.com/v1/submissions")
  }finally{f.cleanup()}
})

test("refuses to reuse a GitHub asset with a different SHA-256",async()=>{
  const f=fixture()
  try {
    const api=mockApi(packAddon(f.root),{existing:true,badDigest:true})
    await assert.rejects(()=>runPublisher(f.root,api),/Existing GitHub Release asset differs/)
    assert.equal(api.calls.filter(c=>c.method==="POST").length,0)
  }finally{f.cleanup()}
})

test("reports a blocked registry submission after creating an artifact",async()=>{
  const f=fixture()
  try {
    const api=mockApi(packAddon(f.root),{submissionStatus:403})
    await assert.rejects(()=>runPublisher(f.root,api),/registry submission failed \(403\)/)
    assert.ok(api.calls.some(c=>c.url.startsWith("https://uploads.github.com/")))
  }finally{f.cleanup()}
})
