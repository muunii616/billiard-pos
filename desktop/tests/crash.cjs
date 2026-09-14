const fs=require('node:fs/promises');const path=require('node:path');const {spawn}=require('node:child_process');
const {Runtime}=require('../runtime.cjs');
const base=path.resolve(__dirname,'..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  if(process.argv[2]==='child') {
    const profile=process.argv[3];
    const runtime=new Runtime(path.join(base,'.build/payload'),path.join(base,'bridge.php'),profile);
    runtime.watchdogPath=path.join(base,'watchdog.cjs');
    await runtime.initialize();await runtime.restore(process.argv[4]);await runtime.startWeb();
    await fs.writeFile(path.join(profile,'ready.json'),JSON.stringify({pids:runtime.children.map(c=>c.pid)}));
    setInterval(()=>{},1000);return;
  }
  if(!process.argv[2])throw new Error('Pass a .loxbackup file');
  const profile=path.join(base,'.build',`crash-test-${Date.now()}`);
  const child=spawn(process.execPath,[__filename,'child',profile,path.resolve(process.argv[2])],{stdio:'inherit',windowsHide:true});
  let data;
  try {
    for(let i=0;i<180;i++) {
      try{data=JSON.parse(await fs.readFile(path.join(profile,'ready.json'),'utf8'));break;}catch{}
      if(child.exitCode!==null)throw new Error('Test runtime stopped before ready');
      await sleep(500);
    }
    if(!data)throw new Error('Test runtime startup timed out');
    child.kill();
    let alive=[];
    for(let i=0;i<60;i++) {
      alive=data.pids.filter(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});
      if(!alive.length)break;await sleep(500);
    }
    if(alive.length)throw new Error(`Orphaned child processes: ${alive.join(',')}`);
    // Windows may terminate an entire process job at once. In that case InnoDB
    // performs crash recovery instead of receiving the watchdog's clean shutdown.
    const recovered=new Runtime(path.join(base,'.build/payload'),path.join(base,'bridge.php'),profile);
    try {
      await recovered.initialize();await recovered.startWeb();
      const exported=path.join(profile,'after-crash.loxbackup');await recovered.backup(exported);
      const zlib=require('node:zlib');
      const original=JSON.parse(zlib.gunzipSync(await fs.readFile(path.resolve(process.argv[2]))));
      const restored=JSON.parse(zlib.gunzipSync(await fs.readFile(exported)));
      const differences=Object.keys(original.tables).filter(name=>original.tables[name].sha256!==restored.tables[name]?.sha256);
      if(differences.length)throw new Error(`Data changed after recovery: ${differences.join(',')}`);
    }finally{await recovered.stop();}
    const log=await fs.readFile(path.join(profile,'logs','database.log'),'utf8');
    if(!log.includes('Shutdown complete'))throw new Error('Normal shutdown did not complete');
    console.log(JSON.stringify({ok:true,crashCleanup:true,recoveryPreservedAllRecords:true,normalShutdownClean:true}));
  }finally{if(child.exitCode===null)child.kill();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
