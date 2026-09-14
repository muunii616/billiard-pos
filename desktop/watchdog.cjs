// A pipe EOF also occurs if the Electron parent crashes. Close its database cleanly
// and terminate only the child PIDs that parent explicitly registered with us.
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const fs=require('node:fs');const path=require('node:path');
const children=new Set();let shutdown,databasePid,finished=false;
const log=message=>{try{fs.appendFileSync(path.join(process.env.LOX_DATA_DIR,'logs','watchdog.log'),message+'\n');}catch{}};
readline.createInterface({input:process.stdin}).on('line',line=>{
  const message=JSON.parse(line);
  if(message.add)children.add(message.add);
  if(message.remove)children.delete(message.remove);
  if(message.shutdown)shutdown=message.shutdown;
  if(message.database)databasePid=message.database;
  if(message.done){finished=true;process.exit(0);}
});
process.stdin.on('end',async()=>{
  if(finished)return;
  log('Parent exited unexpectedly; stopping desktop runtime.');
  for(const pid of children)if(pid!==databasePid)try{process.kill(pid);}catch{}
  if(shutdown)await new Promise(resolve=>{
    const p=spawn(shutdown.exe,shutdown.args,{env:process.env,cwd:shutdown.cwd,windowsHide:true,stdio:['ignore','ignore','pipe']});
    p.stderr.on('data',b=>log(b.toString()));
    const timeout=setTimeout(()=>{p.kill();resolve();},10000);
    p.on('error',error=>{log(error.message);clearTimeout(timeout);resolve();});p.on('exit',code=>{log(`Shutdown command exited ${code}`);clearTimeout(timeout);resolve();});
  });
  if(databasePid)for(let i=0;i<150;i++) {
    try{process.kill(databasePid,0);}catch{break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  for(const pid of children)try{process.kill(pid);}catch{}
  process.exit(0);
});
