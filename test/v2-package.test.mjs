import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync, gunzipSync } from "node:zlib"
import { packV2, inspectV2Archive } from "../scripts/v2-package.mjs"

const demo=String.raw`export async function activate({ request }) {
  const info = await request("extension.info")
  const visits = await request("storage.get", { key: "visits" })
  await request("storage.set", { key: "visits", value: Number(visits || 0) + 1 })
  return () => { void info }
}
`
function manifest() {
  return {
    schemaVersion:2, id:"example.storage-demo",name:"Storage Demo",
    summary:"V2 capability prototype",description:"Reviewable compiled single-module example",
    version:"0.1.0",category:"integration",author:{name:"Example"},
    repository:"https://github.com/example/storage-demo",license:"MIT",
    compatibility:{mode:"account",nextguide:">=1.0.0 <2.0.0"},
    permissions:["storage.read","storage.write"],
    entrypoints:{server:"dist/server.mjs"},
  }
}
function fixture() {
  const root=mkdtempSync(join(tmpdir(),"ng-v2-pack-"))
  mkdirSync(join(root,"src"))
  mkdirSync(join(root,"dist"))
  writeFileSync(join(root,"nextguide-addon.json"),JSON.stringify(manifest(),null,2)+"\n")
  writeFileSync(join(root,"src","server.js"),demo)
  writeFileSync(join(root,"dist","server.mjs"),demo)
  return {root,cleanup:()=>rmSync(root,{recursive:true,force:true})}
}
const sha=b=>createHash("sha256").update(b).digest("hex")
test("v2 pack is reproducible, source-bound and contains the complete permission list",()=>{
  const f=fixture()
  try {
    const first=packV2(f.root),second=packV2(f.root)
    assert.deepEqual(first.archive,second.archive)
    assert.equal(first.archiveSha256,sha(first.archive))
    assert.equal(first.serverSha256,sha(Buffer.from(demo)))
    assert.equal(first.name,"nextguide-addon-v2-0.1.0.tgz")
    assert.equal(first.manifest.permissions.length,2)
    assert.deepEqual(inspectV2Archive(first.archive).index.permissions,[
      "storage.read","storage.write"
    ])
    assert.equal(inspectV2Archive(first.archive).index.source.path,"src/server.js")
  }finally{f.cleanup()}
})
test("v2 archive inspector detects byte tampering even with a valid gzip wrapper",()=>{
  const f=fixture()
  try{
    const packed=packV2(f.root)
    const tar=gunzipSync(packed.archive)
    const at=tar.indexOf(Buffer.from(demo))
    assert.ok(at>0)
    tar[at+20]^=1
    assert.throws(()=>inspectV2Archive(gzipSync(tar)),/compiled server digest\/size mismatch/)
    assert.throws(()=>inspectV2Archive(new Uint8Array(0)),/Archive size quota/)
  }finally{f.cleanup()}
})
test("manifest cannot request unrecognized capabilities, browser JS or unsafe paths",()=>{
  const f=fixture()
  try{
    const file=join(f.root,"nextguide-addon.json")
    const original=manifest()
    for(const mutation of [
      {permissions:["process.exec"]},
      {entrypoints:{client:"dist/client.js",server:"dist/server.mjs"}},
      {entrypoints:{server:"../unsafe.js"}},
      {compatibility:{mode:"developer",nextguide:">=1.0.0 <2.0.0"}},
      {schemaVersion:1},
    ]){
      writeFileSync(file,JSON.stringify({...original,...mutation}))
      assert.throws(()=>packV2(f.root),/Invalid v2 server manifest/)
    }
    writeFileSync(file,JSON.stringify(original))
    assert.equal(packV2(f.root).manifest.id,"example.storage-demo")
  }finally{f.cleanup()}
})
test("v2 rejects symlinked source, compiled output and overlarge modules",()=>{
  const f=fixture()
  try{
    rmSync(join(f.root,"dist","server.mjs"))
    symlinkSync(join(f.root,"src","server.js"),join(f.root,"dist","server.mjs"))
    assert.throws(()=>packV2(f.root),/Symbolic links are forbidden/)
    rmSync(join(f.root,"dist","server.mjs"))
    writeFileSync(join(f.root,"dist","server.mjs"),"x".repeat(1024*1024+1))
    assert.throws(()=>packV2(f.root),/Invalid file or size/)
  }finally{f.cleanup()}
})
test("packager treats compiled JavaScript as bytes and never imports it",()=>{
  const f=fixture()
  try {
    const malicious="throw new Error('evaluated unexpectedly');\nexport function activate() {}\n"
    writeFileSync(join(f.root,"dist","server.mjs"),malicious)
    assert.equal(packV2(f.root).serverSha256,sha(Buffer.from(malicious)))
  }finally{f.cleanup()}
})
test("already approved v1 manifest is never silently packaged as executable v2",()=>{
  const f=fixture()
  try {
    const v1=manifest()
    v1.schemaVersion=1
    v1.category="content"
    v1.entrypoints={content:"content"}
    v1.permissions=[]
    writeFileSync(join(f.root,"nextguide-addon.json"),JSON.stringify(v1))
    assert.throws(()=>packV2(f.root),/Invalid v2 server manifest/)
  }finally{f.cleanup()}
})
