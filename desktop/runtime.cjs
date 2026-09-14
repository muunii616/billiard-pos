const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function atomicJson(file, value) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), {mode:0o600});
  await fs.rename(`${file}.tmp`, file);
}
async function freePort() {
  return new Promise((resolve,reject) => {
    const server = net.createServer(); server.on('error',reject);
    server.listen(0,'127.0.0.1',()=> { const port=server.address().port; server.close(()=>resolve(port)); });
  });
}
function isLocalUrl(value, origin) {
  try { return new URL(value).origin === origin; } catch { return false; }
}
class Runtime {
  constructor(payload, bridge, dataDir, onStatus=()=>{}) {
    this.payload=payload; this.bridge=bridge; this.dataDir=dataDir; this.onStatus=onStatus;
    this.children=[]; this.stopping=false; this.operation=Promise.resolve();
  }
  async initialize() {
    for (const dir of ['logs','backups','storage/app/private','storage/app/public','storage/framework/cache/data','storage/framework/sessions','storage/framework/views','storage/logs','cache']) {
      await fs.mkdir(path.join(this.dataDir,dir),{recursive:true});
    }
    this.stateFile=path.join(this.dataDir,'desktop-state.json');
    this.state=await exists(this.stateFile) ? JSON.parse(await fs.readFile(this.stateFile,'utf8')) : {
      version:1, rootPassword:crypto.randomBytes(32).toString('hex'), appPassword:crypto.randomBytes(32).toString('hex'),
      database:`lox_${crypto.randomBytes(8).toString('hex')}`, ready:false,
    };
    await atomicJson(this.stateFile,this.state);
    this.dbPort=await freePort(); this.phpPort=await freePort(); this.httpPort=await freePort();
    this.origin=`http://127.0.0.1:${this.httpPort}`;
    this.env={...process.env,
      APP_ENV:'production',APP_DEBUG:'false',APP_URL:this.origin,ASSET_URL:this.origin,
      LOX_DATA_DIR:this.dataDir,LOX_APP_DIR:path.join(this.payload,'app'),LOX_ROOT_PASSWORD:this.state.rootPassword,
      DB_CONNECTION:'mysql',DB_URL:'',DB_HOST:'127.0.0.1',DB_PORT:String(this.dbPort),DB_DATABASE:this.state.database,
      DB_USERNAME:'lox_app',DB_PASSWORD:this.state.appPassword,
      SESSION_DRIVER:'file',SESSION_COOKIE:'lox_desktop_session',SESSION_SECURE_COOKIE:'false',SESSION_DOMAIN:'',
      CACHE_STORE:'file',QUEUE_CONNECTION:'sync',BROADCAST_CONNECTION:'log',LOG_CHANNEL:'single',
      APP_CONFIG_CACHE:path.join(this.dataDir,'cache','config.php'),
      APP_SERVICES_CACHE:path.join(this.dataDir,'cache','services.php'),
      APP_PACKAGES_CACHE:path.join(this.dataDir,'cache','packages.php'),
      APP_ROUTES_CACHE:path.join(this.dataDir,'cache','routes.php'),
      APP_EVENTS_CACHE:path.join(this.dataDir,'cache','events.php'),
      PHP_FCGI_MAX_REQUESTS:'0',PHPRC:path.join(this.payload,'php','php.ini'),PHP_INI_SCAN_DIR:'',
    };
    if(this.watchdogPath) {
      this.watchdog=spawn(process.execPath,[this.watchdogPath],{env:{...this.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['pipe','ignore','ignore']});
      this.watchdog.stdin.on('error',()=>{});
      this.watchdog.on('error',error=>{this.failure=error;});
      this.watchdog.stdin.write(JSON.stringify({shutdown:{exe:path.join(this.payload,'php','php.exe'),args:this.phpArgs([this.bridge,'shutdown']),cwd:this.env.LOX_APP_DIR}})+'\n');
    }
    // Caches belong to a particular installed app version and are safe to regenerate.
    for (const file of ['config.php','services.php','packages.php','routes.php','events.php']) {
      await fs.rm(path.join(this.dataDir,'cache',file),{force:true});
    }
    const bin=path.join(this.payload,'mariadb','bin');
    this.mariaExe=path.join(bin,await exists(path.join(bin,'mariadbd.exe'))?'mariadbd.exe':'mysqld.exe');
    const initExe=path.join(bin,await exists(path.join(bin,'mariadb-install-db.exe'))?'mariadb-install-db.exe':'mysql_install_db.exe');
    const databaseDir=path.join(this.dataDir,'database');
    if (!await exists(path.join(databaseDir,'mysql'))) {
      this.onStatus('Preparing your local database…');
      await this.run(initExe,[`--datadir=${databaseDir}`,`--password=${this.state.rootPassword}`],{cwd:bin});
    }
    this.onStatus('Starting your local database…');
    this.databaseProcess=this.start(this.mariaExe,[
      '--no-defaults',`--basedir=${path.join(this.payload,'mariadb')}`,`--datadir=${databaseDir}`,
      '--bind-address=127.0.0.1',`--port=${this.dbPort}`,'--skip-name-resolve','--default-time-zone=+00:00',
      '--character-set-server=utf8mb4','--collation-server=utf8mb4_unicode_ci',
      '--innodb-buffer-pool-size=128M',`--log-error=${path.join(this.dataDir,'logs','database.log')}`,
    ],'database');
    await this.waitFor(async()=> { await this.php(['ping']); },60000);
    if (this.state.ready) await this.loadSettings();
  }
  phpArgs(args) {
    const ext=path.join(this.payload,'php','ext');
    return ['-c',path.join(this.payload,'php','php.ini'),'-d',`extension_dir=${ext}`,
      ...['curl','fileinfo','gd','intl','mbstring','openssl','pdo_mysql','pdo_sqlite','sqlite3','sodium','zip'].flatMap(e=>['-d',`extension=${e}`]),
      ...args];
  }
  async php(args) {
    const output=await this.run(path.join(this.payload,'php','php.exe'),this.phpArgs([this.bridge,...args]));
    return JSON.parse(output.trim());
  }
  run(exe,args,options={}) {
    return new Promise((resolve,reject)=> {
      const p=spawn(exe,args,{cwd:this.env?.LOX_APP_DIR,env:this.env,windowsHide:true,...options});
      let out='',err='';
      p.stdout.on('data',b=>out+=b); p.stderr.on('data',b=>err+=b);
      p.on('error',reject);
      p.on('exit',code=>code===0?resolve(out):reject(new Error(`${path.basename(exe)} failed (${code}): ${err || out}`)));
    });
  }
  start(exe,args,label) {
    const p=spawn(exe,args,{cwd:this.env.LOX_APP_DIR,env:this.env,windowsHide:true});
    if(p.pid)this.watchdog?.stdin.write(JSON.stringify({add:p.pid})+'\n');
    if(p.pid&&label==='database')this.watchdog?.stdin.write(JSON.stringify({database:p.pid})+'\n');
    p.on('error',e=>{this.failure=e;});
    const log=path.join(this.dataDir,'logs',`${label}-process.log`);
    const record=b=>fs.appendFile(log,b).catch(()=>{});
    p.stdout.on('data',record);p.stderr.on('data',record);
    p.on('exit',code=>{
      this.watchdog?.stdin.write(JSON.stringify({remove:p.pid})+'\n');
      if(!this.stopping)this.failure=new Error(`${label} stopped (${code}). See ${log}`);
    });
    this.children.push(p);return p;
  }
  async waitFor(action,timeout=30000) {
    const end=Date.now()+timeout;
    let last;
    while(Date.now()<end) {
      if(this.failure)throw this.failure;
      try { return await action(); } catch(e) {last=e;await sleep(300);}
    }
    throw new Error(`Startup timed out: ${last?.message}`);
  }
  async loadSettings() {
    const values=JSON.parse(await fs.readFile(path.join(this.dataDir,'settings.json'),'utf8'));
    const allowed=['APP_KEY','APP_NAME','MAIL_MAILER','MAIL_HOST','MAIL_PORT','MAIL_USERNAME','MAIL_PASSWORD','MAIL_SCHEME','MAIL_FROM_ADDRESS','MAIL_FROM_NAME'];
    for(const key of allowed) if(values[key]!==undefined && values[key]!==null) this.env[key]=String(values[key]);
  }
  async restore(backup) {
    if(this.state.ready)throw new Error('This installation already has data. Restore into a separate new installation to avoid overwriting records.');
    this.onStatus('Checking your backup…');await this.php(['check-backup',backup]);
    // Each attempt gets a new schema. A failed import never reuses or clears an existing one.
    this.state.database=`lox_${crypto.randomBytes(8).toString('hex')}`;
    this.env.DB_DATABASE=this.state.database;
    await atomicJson(this.stateFile,this.state);
    this.onStatus('Importing and verifying your records…');
    const result=await this.php(['restore',backup]);
    await this.loadSettings();
    this.state.ready=true;await atomicJson(this.stateFile,this.state);
    return result;
  }
  async backup(destination) {
    if(!this.state.ready)throw new Error('No database has been imported yet');
    const task=this.operation.then(()=>this.php(['export',destination]));
    this.operation=task.catch(()=>{});return task;
  }
  async startWeb() {
    if(!this.state.ready)throw new Error('Import your backup first');
    this.onStatus('Creating a startup backup…');
    await this.backup(path.join(this.dataDir,'backups',`startup-${new Date().toISOString().replace(/[:.]/g,'-')}.loxbackup`));
    this.onStatus('Checking application updates…');
    await this.run(path.join(this.payload,'php','php.exe'),this.phpArgs(['artisan','migrate','--force','--no-interaction']));
    this.onStatus('Opening Lox Billiard POS…');
    this.start(path.join(this.payload,'php','php-cgi.exe'),this.phpArgs(['-b',`127.0.0.1:${this.phpPort}`]),'php');
    const publicRoot=path.join(this.payload,'app','public').replaceAll('\\','/');
    const publicStorage=path.join(this.dataDir,'storage','app','public').replaceAll('\\','/');
    const caddy=`{\n admin off\n auto_https off\n}\n${this.origin} {\n bind 127.0.0.1\n root * ${JSON.stringify(publicRoot)}\n handle_path /storage/* {\n root * ${JSON.stringify(publicStorage)}\n file_server\n }\n php_fastcgi 127.0.0.1:${this.phpPort}\n file_server\n}\n`;
    const config=path.join(this.dataDir,'Caddyfile');await fs.writeFile(config,caddy);
    this.start(path.join(this.payload,'caddy','caddy.exe'),['run','--config',config,'--adapter','caddyfile'],'web');
    await this.waitFor(async()=>{const r=await fetch(`${this.origin}/up`);if(!r.ok)throw new Error(`HTTP ${r.status}`);});
  }
  async stop() {
    if(this.stopping)return;this.stopping=true;
    await this.operation;
    // Stop accepting requests before shutting down the database cleanly.
    for(const child of this.children.filter(c=>c!==this.databaseProcess).reverse()) if(child.exitCode===null)child.kill();
    try {await this.php(['shutdown']);} catch {}
    if(this.databaseProcess?.exitCode===null) {
      for(let i=0;i<100&&this.databaseProcess.exitCode===null;i++)await sleep(100);
      if(this.databaseProcess.exitCode===null)this.databaseProcess.kill();
    }
    this.watchdog?.stdin.end(JSON.stringify({done:true})+'\n');
  }
}
module.exports={Runtime,atomicJson,isLocalUrl};
