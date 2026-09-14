const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Runtime,isLocalUrl,atomicJson}=require('../runtime.cjs');

test('desktop navigation stays on the exact local origin',()=>{
  const origin='http://127.0.0.1:41357';
  assert.equal(isLocalUrl(origin+'/checkouts',origin),true);
  for(const url of ['http://127.0.0.1:8000','https://example.com','file:///C:/Windows/system.ini','javascript:alert(1)','http://127.0.0.1.evil.test:41357'])assert.equal(isLocalUrl(url,origin),false);
});
test('a ready desktop database cannot be overwritten by restore',async()=>{
  const runtime=new Runtime('unused','unused','unused');runtime.state={ready:true};
  await assert.rejects(runtime.restore('anything'),/already has data/);
});
test('state saves replace complete JSON documents',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lox-state-test-'));
  const file=path.join(dir,'state.json');
  await atomicJson(file,{ready:false});await atomicJson(file,{ready:true,database:'example'});
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{ready:true,database:'example'});
});
