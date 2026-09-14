// Run explicitly with a source backup. Every operation uses a NEW isolated profile.
const fs=require('node:fs/promises');const path=require('node:path');
const {Runtime}=require('../runtime.cjs');
(async()=>{
  if(!process.argv[2])throw new Error('Pass a .loxbackup file');
  const base=path.resolve(__dirname,'..');
  const profile=path.join(base,'.build',`integration-${Date.now()}`);
  const runtime=new Runtime(path.join(base,'.build/payload'),path.join(base,'bridge.php'),profile,console.log);
  try {
    await runtime.initialize();
    const restored=await runtime.restore(path.resolve(process.argv[2]));
    console.log('Restored:',JSON.stringify(restored));
    await runtime.startWeb();
    const response=await fetch(runtime.origin+'/login');
    if(response.status!==200)throw new Error(`Login returned ${response.status}`);
    const body=await response.text();
    if(!body.includes('/build/assets/')||body.includes(':5173'))throw new Error('App is not using its bundled production assets');
    runtime.env.LOX_SMOKE_TEST='1';
    const cookie=JSON.parse(await runtime.run(path.join(runtime.payload,'php','php.exe'),runtime.phpArgs([path.join(__dirname,'session.php')])));
    const pages=[];
    for(const route of ['/dashboard','/tables','/checkouts','/overview','/admin/products','/cash-register','/admin/users']) {
      const r=await fetch(runtime.origin+route,{headers:{Cookie:`${cookie.name}=${encodeURIComponent(cookie.value)}`},redirect:'manual'});
      if(r.status!==200)throw new Error(`${route} returned ${r.status}`);
      pages.push(route);
    }
    const exported=await runtime.backup(path.join(profile,'roundtrip.loxbackup'));
    console.log(JSON.stringify({ok:true,profile,pages,restored,exported},null,2));
    await fs.writeFile(path.join(profile,'integration-result.json'),JSON.stringify({ok:true,pages,restored,exported},null,2));
  }finally{await runtime.stop();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
