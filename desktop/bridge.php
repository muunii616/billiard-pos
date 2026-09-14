<?php
// CLI-only backup/restore bridge. Never place this file inside the public directory.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

function ident(string $name): string {
    if (!preg_match('/^[a-zA-Z0-9_]+$/D', $name)) throw new RuntimeException('Invalid database identifier');
    return '`'.$name.'`';
}
function connect(bool $root = false, ?string $database = null): PDO {
    $port = (int) getenv('DB_PORT');
    if ($port < 1024 || $port > 65535) throw new RuntimeException('Invalid desktop database port');
    $dsn = "mysql:host=127.0.0.1;port=$port;charset=utf8mb4";
    if ($database !== null) $dsn .= ';dbname='.$database;
    $pdo = new PDO($dsn, $root ? 'root' : getenv('DB_USERNAME'), $root ? getenv('LOX_ROOT_PASSWORD') : getenv('DB_PASSWORD'), [
        PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_STRINGIFY_FETCHES=>true,
        PDO::ATTR_EMULATE_PREPARES=>false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}
function boot(string $base): Illuminate\Foundation\Application {
    require $base.'/vendor/autoload.php';
    $app = require $base.'/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    return $app;
}
function encodedRows(PDO $pdo, string $name, array $order): array {
    $rows = $pdo->query('SELECT * FROM '.ident($name).($order ? ' ORDER BY '.implode(',',array_map('ident',$order)) : ''))->fetchAll(PDO::FETCH_ASSOC);
    return array_map(fn($row)=>array_map(fn($v)=>$v === null ? null : base64_encode((string)$v),$row),$rows);
}
function fingerprint(array $rows): string {
    return hash('sha256',json_encode($rows, JSON_THROW_ON_ERROR));
}
function saveBackup(PDO $pdo, array $settings, string $storage, string $destination): array {
    if (file_exists($destination)) throw new RuntimeException('Backup destination already exists');
    $backup = ['format'=>'lox-billiard-backup', 'version'=>1, 'created_at'=>gmdate('c'), 'settings'=>$settings, 'tables'=>[], 'files'=>[]];
    $tables = $pdo->query('SHOW FULL TABLES')->fetchAll(PDO::FETCH_NUM);
    if ($pdo->query('SHOW TRIGGERS')->fetch()) throw new RuntimeException('Database has triggers; use a full SQL backup instead');
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    try {
        foreach ($tables as [$name,$type]) {
            if ($type !== 'BASE TABLE') throw new RuntimeException('Views require a full SQL backup');
            $schema = $pdo->query('SHOW CREATE TABLE '.ident($name))->fetch(PDO::FETCH_NUM)[1];
            if (!str_contains($schema,'ENGINE=InnoDB')) throw new RuntimeException('Consistent backups require InnoDB tables');
            $keys = $pdo->query('SHOW KEYS FROM '.ident($name)." WHERE Key_name = 'PRIMARY'")->fetchAll(PDO::FETCH_ASSOC);
            usort($keys,fn($a,$b)=>(int)$a['Seq_in_index']<=>(int)$b['Seq_in_index']);
            $order = array_column($keys,'Column_name');
            // Do not transfer login sessions, password reset tokens, queued jobs, or cache.
            $empty = in_array($name,['sessions','password_reset_tokens','cache','cache_locks','jobs','job_batches','failed_jobs'],true);
            $rows = $empty ? [] : encodedRows($pdo,$name,$order);
            $backup['tables'][$name] = ['schema'=>$schema,'order'=>$order,'rows'=>$rows,'sha256'=>fingerprint($rows)];
        }
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    if (is_dir($storage.'/app')) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($storage.'/app',FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            if (!$file->isFile() || $file->isLink() || $file->getFilename()==='.gitignore') continue;
            $relative = str_replace('\\','/',substr($file->getPathname(),strlen($storage.'/app')+1));
            $backup['files'][$relative] = base64_encode(file_get_contents($file->getPathname()));
        }
    }
    $content = gzencode(json_encode($backup,JSON_THROW_ON_ERROR),9);
    $temporary = $destination.'.partial';
    if (file_put_contents($temporary,$content,LOCK_EX)===false || !rename($temporary,$destination)) throw new RuntimeException('Could not write backup');
    return ['file'=>$destination,'tables'=>count($backup['tables']),'rows'=>array_sum(array_map(fn($t)=>count($t['rows']),$backup['tables']))];
}
function loadBackup(string $file): array {
    $decoded = gzdecode(file_get_contents($file));
    if ($decoded === false) throw new RuntimeException('Not a Lox backup');
    $backup = json_decode($decoded,true,512,JSON_THROW_ON_ERROR);
    if (($backup['format']??'')!=='lox-billiard-backup' || ($backup['version']??0)!==1) throw new RuntimeException('Unsupported backup format');
    foreach (['users','billiard_tables','game_sessions','checkout_sessions','receipts','migrations'] as $table) {
        if (!isset($backup['tables'][$table])) throw new RuntimeException('Backup is missing required tables');
    }
    foreach ($backup['tables'] as $name=>$table) {
        ident($name);
        if (!str_starts_with($table['schema'],'CREATE TABLE '.ident($name).' ') || !hash_equals($table['sha256'],fingerprint($table['rows']))) throw new RuntimeException('Backup integrity check failed');
    }
    foreach ($backup['files'] as $name=>$bytes) {
        if (!preg_match('#^(?:[a-zA-Z0-9_. -]+/)*[a-zA-Z0-9_. -]+$#D',$name) || in_array('..',explode('/',$name),true) || str_starts_with($name,'/')) throw new RuntimeException('Unsafe backup file path');
    }
    if (strlen(base64_decode(preg_replace('/^base64:/','',$backup['settings']['APP_KEY']??''),true)?:'')!==32) throw new RuntimeException('Backup is missing its application encryption key');
    return $backup;
}
function settings(): array {
    return [
        'APP_KEY'=>config('app.key'), 'APP_NAME'=>config('app.name'),
        'MAIL_MAILER'=>config('mail.default'), 'MAIL_HOST'=>config('mail.mailers.smtp.host'),
        'MAIL_PORT'=>config('mail.mailers.smtp.port'), 'MAIL_USERNAME'=>config('mail.mailers.smtp.username'),
        'MAIL_PASSWORD'=>config('mail.mailers.smtp.password'), 'MAIL_SCHEME'=>config('mail.mailers.smtp.scheme'),
        'MAIL_FROM_ADDRESS'=>config('mail.from.address'), 'MAIL_FROM_NAME'=>config('mail.from.name'),
    ];
}
try {
    $command = $argv[1]??'';
    if ($command==='export-source') {
        $app = boot(realpath($argv[2]));
        $pdo = Illuminate\Support\Facades\DB::connection()->getPdo();
        $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES,true);
        $result = saveBackup($pdo,settings(),$app->storagePath(),$argv[3]);
    } elseif ($command==='check-backup') {
        $backup = loadBackup($argv[2]);
        $result = ['tables'=>count($backup['tables']),'rows'=>array_sum(array_map(fn($t)=>count($t['rows']),$backup['tables']))];
    } elseif ($command==='ping') {
        connect(true)->query('SELECT 1'); $result = ['ok'=>true];
    } elseif ($command==='restore') {
        $backup = loadBackup($argv[2]);
        $name = getenv('DB_DATABASE');
        if (!preg_match('/^lox_[a-f0-9]{16}$/D',$name)) throw new RuntimeException('Restore requires a new isolated desktop database');
        $pdo = connect(true);
        // CREATE without IF NOT EXISTS guarantees restore can never overwrite a database.
        $pdo->exec('CREATE DATABASE '.ident($name).' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $pdo->exec('USE '.ident($name));
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        foreach ($backup['tables'] as $table) $pdo->exec($table['schema']);
        $pdo->beginTransaction();
        foreach ($backup['tables'] as $tableName=>$table) {
            if (!$table['rows']) continue;
            $columns = array_keys($table['rows'][0]);
            $stmt = $pdo->prepare('INSERT INTO '.ident($tableName).' ('.implode(',',array_map('ident',$columns)).') VALUES ('.implode(',',array_fill(0,count($columns),'?')).')');
            foreach ($table['rows'] as $row) $stmt->execute(array_map(fn($v)=>$v===null?null:base64_decode($v,true),array_values($row)));
        }
        foreach ($backup['tables'] as $tableName=>$table) {
            if (!hash_equals($table['sha256'],fingerprint(encodedRows($pdo,$tableName,$table['order'])))) throw new RuntimeException('Restored data does not match backup: '.$tableName);
        }
        $pdo->commit();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        $password = $pdo->quote(getenv('DB_PASSWORD'));
        foreach (['localhost','127.0.0.1'] as $host) {
            $account = "'lox_app'@".$pdo->quote($host);
            $pdo->exec("CREATE USER IF NOT EXISTS $account IDENTIFIED BY $password");
            $pdo->exec('GRANT ALL ON '.ident($name).".* TO $account");
        }
        $dataDir = getenv('LOX_DATA_DIR');
        foreach ($backup['files'] as $relative=>$encoded) {
            $file = $dataDir.'/storage/app/'.$relative;
            if (!is_dir(dirname($file))) mkdir(dirname($file),0700,true);
            $bytes = base64_decode($encoded,true);
            if (file_exists($file) && file_get_contents($file)!==$bytes) throw new RuntimeException('Restore file already exists with different contents');
            file_put_contents($file,$bytes);
        }
        $allowed = ['APP_KEY','APP_NAME','MAIL_MAILER','MAIL_HOST','MAIL_PORT','MAIL_USERNAME','MAIL_PASSWORD','MAIL_SCHEME','MAIL_FROM_ADDRESS','MAIL_FROM_NAME'];
        $restored = array_intersect_key($backup['settings'],array_flip($allowed));
        file_put_contents($dataDir.'/settings.json',json_encode($restored,JSON_THROW_ON_ERROR),LOCK_EX);
        $result = ['verified'=>true,'tables'=>count($backup['tables']),'rows'=>array_sum(array_map(fn($t)=>count($t['rows']),$backup['tables']))];
    } elseif ($command==='export') {
        $app = boot(getenv('LOX_APP_DIR'));
        $result = saveBackup(connect(false,getenv('DB_DATABASE')),settings(),$app->storagePath(),$argv[2]);
    } elseif ($command==='shutdown') {
        connect(true)->exec('SHUTDOWN'); $result=['ok'=>true];
    } else { throw new RuntimeException('Unknown command'); }
    echo json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES).PHP_EOL;
} catch (Throwable $e) {
    // Do not print configuration or connection passwords.
    fwrite(STDERR,get_class($e).': '.$e->getMessage().PHP_EOL);
    exit(1);
}
