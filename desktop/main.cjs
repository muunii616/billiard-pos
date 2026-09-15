const {app,BrowserWindow,Menu,dialog,shell,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {Runtime,isLocalUrl}=require('./runtime.cjs');

const arg=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const smoke=process.argv.includes('--smoke-test');
if(smoke) {
  if(!arg('--data-dir') || !arg('--backup'))throw new Error('Smoke testing requires explicit isolated data and backup paths');
  app.setPath('userData',path.resolve(arg('--data-dir')));
} else app.setPath('userData',path.join(app.getPath('appData'),'Lox Billiard POS'));
if(!app.requestSingleInstanceLock()) {app.quit();} else {
  let window,runtime,ready=false,quitting=false,stopped=false,backupTimer;
  const dataDir=app.getPath('userData');
  const payload=app.isPackaged?path.join(process.resourcesPath,'payload'):path.join(__dirname,'.build','payload');
  const bridge=app.isPackaged?path.join(process.resourcesPath,'bridge.php'):path.join(__dirname,'bridge.php');
  function status(message) {
    if(message.startsWith('Preparing your local') || message.startsWith('Starting your local'))message='Preparing your tables…';
    else if(message.startsWith('Checking your backup'))message='Checking your saved data…';
    else if(message.startsWith('Importing and verifying'))message='Restoring your club…';
    else if(message.startsWith('Creating a startup backup'))message='Saving a fresh backup…';
    else if(message.startsWith('Checking application updates'))message='Getting everything ready…';
    if(window&&!window.isDestroyed())window.webContents.executeJavaScript(`document.getElementById('status') && (document.getElementById('status').textContent=${JSON.stringify(message)})`).catch(()=>{});
  }
  function attachNavigation(win) {
    win.webContents.on('will-navigate',(event,url)=> {
      if(runtime?.origin&&!isLocalUrl(url,runtime.origin))event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({url})=> {
      if(runtime?.origin&&isLocalUrl(url,runtime.origin))return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}};
      return {action:'deny'};
    });
    win.webContents.on('did-create-window',attachNavigation);
  }
  async function saveBackup() {
    if(!ready)return;
    const {canceled,filePath}=await dialog.showSaveDialog(window,{title:'Save a backup for another PC',defaultPath:path.join(app.getPath('documents'),`Lox-Billiard-${new Date().toISOString().slice(0,10)}.loxbackup`),filters:[{name:'Lox Billiard backup',extensions:['loxbackup']}]});
    if(canceled)return;
    try {
      await runtime.backup(filePath);
      await dialog.showMessageBox(window,{type:'info',message:'Backup saved',detail:'Copy this .loxbackup file to the other PC.\n\nOn a brand-new install, the app asks for it on first open.\n\nIf that PC already opened the app once, use Lox Billiard → Replace data from backup… there, or rename the "%APPDATA%\\Lox Billiard POS" folder and reopen the app to get the import prompt again.'});
    }catch(error){await dialog.showMessageBox(window,{type:'error',message:'Backup could not be saved',detail:error.message});}
  }
  async function replaceFromBackup() {
    if(quitting||stopped)return;
    const confirm=await dialog.showMessageBox(window,{
      type:'warning',
      buttons:['Cancel','Replace and restart'],
      defaultId:0,
      cancelId:0,
      message:'Replace all data on this PC?',
      detail:'This moves the current local data aside and restarts so you can import a .loxbackup file.\n\nCurrent data is kept in a renamed folder under AppData and is not deleted. Running timers will stop with the app.',
    });
    if(confirm.response!==1)return;
    quitting=true;
    clearInterval(backupTimer);
    status('Preparing to import a backup…');
    try {
      await runtime?.stop();
      stopped=true;
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      const aside=`${dataDir}-before-import-${stamp}`;
      await fs.rename(dataDir,aside);
      await dialog.showMessageBox(window,{
        type:'info',
        message:'Restarting for import',
        detail:`Previous data was moved to:\n${aside}\n\nAfter restart, choose your .loxbackup file (Import my data).`,
      });
      app.relaunch();
      app.exit(0);
    }catch(error){
      await dialog.showErrorBox('Could not prepare import',error.message+'\n\nClose the app, rename "%APPDATA%\\Lox Billiard POS", then open the app again to import.');
      quitting=false;stopped=false;
    }
  }
  function setMenu() {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'Lox Billiard',submenu:[
        {label:'Save backup…',enabled:ready,click:saveBackup},
        {label:'Replace data from backup…',enabled:ready,click:()=>{void replaceFromBackup();}},
        {label:'Open backup folder',click:()=>shell.openPath(path.join(dataDir,'backups'))},
        {label:'Open diagnostic logs',click:()=>shell.openPath(path.join(dataDir,'logs'))},
        {type:'separator'},{label:'Exit',click:()=>app.quit()}
      ]},
      {label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
      {label:'Help',submenu:[{label:'About Lox Billiard POS',click:()=>dialog.showMessageBox(window,{message:`Lox Billiard POS ${app.getVersion()}`,detail:'Your data is stored locally on this Windows account.\n\nNew PC: import the .loxbackup on first launch.\nIf this PC already started without your backup, use Lox Billiard → Replace data from backup…\n\n'+dataDir})}]}
    ]));
  }
  app.on('second-instance',()=>{if(window){window.show();window.focus();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=> {
    if(stopped)return;
    event.preventDefault();if(quitting)return;quitting=true;
    (async()=> {
      if(ready&&!smoke) {
        const result=await dialog.showMessageBox(window,{type:'question',buttons:['Keep POS open','Exit'],defaultId:0,cancelId:0,message:'Exit Lox Billiard POS?',detail:'Running table timers continue to count elapsed time. Stop or pause them in the POS if needed before exiting.'});
        if(result.response===0){quitting=false;return;}
      }
      clearInterval(backupTimer);
      status('Saving a backup and closing…');
      if(ready)try{await runtime.backup(path.join(dataDir,'backups',`exit-${Date.now()}.loxbackup`));}catch(error){await fs.appendFile(path.join(dataDir,'logs','desktop.log'),`Backup failed: ${error.message}\n`);}
      await runtime?.stop();stopped=true;app.quit();
    })().catch(error=>{dialog.showErrorBox('Could not close cleanly',error.message);quitting=false;});
  });
  app.whenReady().then(async()=> {
    window=new BrowserWindow({icon:path.join(__dirname,'icon.png'),width:1440,height:960,minWidth:1000,minHeight:700,show:!smoke,title:'Lox Billiard POS',backgroundColor:'#111827',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    window.on('close',event=>{if(!stopped){event.preventDefault();app.quit();}});
    await window.loadFile(path.join(__dirname,'splash.html'));
    attachNavigation(window);setMenu();
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    runtime=new Runtime(payload,bridge,dataDir,status);
    runtime.watchdogPath=path.join(__dirname,'watchdog.cjs');
    try {
      await runtime.initialize();
      if(smoke)runtime.env.LOX_SMOKE_TEST='1';
      if(!runtime.state.ready) {
        let backup=smoke?arg('--backup'):undefined;
        if(!backup) {
          const chosen=await dialog.showOpenDialog(window,{
            title:'Import your Lox Billiard backup',
            message:'Choose the .loxbackup file from your other PC or USB drive.',
            buttonLabel:'Import my data',
            properties:['openFile'],
            filters:[
              {name:'Lox Billiard backup',extensions:['loxbackup']},
              {name:'All files',extensions:['*']},
            ],
          });
          if(chosen.canceled){
            await dialog.showMessageBox(window,{
              type:'info',
              message:'Backup required',
              detail:'Lox Billiard POS needs a .loxbackup file on first setup.\n\nCopy the backup onto this PC, open the app again, and choose Import my data.\n\nIf this PC already ran without your backup, close the app, rename the folder %APPDATA%\\Lox Billiard POS, then open the app again.',
            });
            await runtime.stop();stopped=true;app.quit();return;
          }
          backup=chosen.filePaths[0];
        }
        await runtime.restore(backup);
      }
      await runtime.startWeb();ready=true;setMenu();
      if(smoke) {
        if(!app.isPackaged) {
          const cookie=JSON.parse(await runtime.run(path.join(payload,'php','php.exe'),runtime.phpArgs([path.join(__dirname,'tests','session.php')])));
          await session.defaultSession.cookies.set({url:runtime.origin,name:cookie.name,value:cookie.value,httpOnly:true,sameSite:'lax'});
        }
        const checks=[];
        const routes=app.isPackaged?['/login']:['/dashboard','/tables','/checkouts','/overview','/admin/products','/cash-register','/admin/users'];
        for(const route of routes) {
          await window.loadURL(runtime.origin+route);
          await new Promise(resolve=>setTimeout(resolve,900));
          const info=await window.webContents.executeJavaScript(`({title:document.title,path:location.pathname,text:document.body.innerText.slice(0,300),rendered:!!document.querySelector('#app')?.children.length})`);
          if(info.path!==route||!info.rendered)throw new Error(`Desktop page failed: ${route}: ${JSON.stringify(info)}`);
          checks.push({route,title:info.title,rendered:info.rendered});
        }
        await window.loadURL(runtime.origin+(app.isPackaged?'/login':'/dashboard'));
        await new Promise(resolve=>setTimeout(resolve,900));
        await fs.writeFile(path.join(dataDir,'desktop-preview.png'),(await window.webContents.capturePage()).toPNG());
        await fs.writeFile(path.join(dataDir,'smoke-result.json'),JSON.stringify({ok:true,pages:checks},null,2));
        app.quit();
      }else{
        await window.loadURL(runtime.origin+'/login');
        backupTimer=setInterval(()=>runtime.backup(path.join(dataDir,'backups',`automatic-${Date.now()}.loxbackup`)).catch(error=>fs.appendFile(path.join(dataDir,'logs','desktop.log'),`Backup failed: ${error.message}\n`)),60*60*1000);
      }
    }catch(error){
      await fs.mkdir(path.join(dataDir,'logs'),{recursive:true});
      await fs.writeFile(path.join(dataDir,'logs','startup-error.log'),error.stack||error.message);
      if(smoke){await fs.writeFile(path.join(dataDir,'smoke-result.json'),JSON.stringify({ok:false,error:error.message}));}
      else await dialog.showMessageBox(window,{type:'error',message:'Lox Billiard POS could not start',detail:error.message+'\n\nYour existing data has not been overwritten. Logs: '+path.join(dataDir,'logs')});
      await runtime.stop();stopped=true;app.exit(1);
    }
  });
}
