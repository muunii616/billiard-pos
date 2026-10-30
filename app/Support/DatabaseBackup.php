<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PDO;
use RuntimeException;
use Symfony\Component\Process\Process;
use Throwable;

class DatabaseBackup
{
    public function create(?string $directory = null): array
    {
        $connection = DB::connection();
        $driver = $connection->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb', 'sqlite'], true)) {
            throw new RuntimeException("Database backups do not support the {$driver} driver.");
        }

        $directory ??= config('operations.backup.directory');
        File::ensureDirectoryExists($directory);

        $name = 'pos-'.now('UTC')->format('Ymd-His').'-'.Str::lower((string) Str::ulid());
        $extension = $driver === 'sqlite' ? 'sqlite' : 'sql';
        $snapshot = $directory.DIRECTORY_SEPARATOR.$name.'.'.$extension;
        $temporarySnapshot = $snapshot.'.tmp';
        $manifest = $directory.DIRECTORY_SEPARATOR.$name.'.json';
        $temporaryManifest = $manifest.'.tmp';

        try {
            if ($driver === 'sqlite') {
                $quotedPath = $connection->getPdo()->quote($temporarySnapshot);
                $connection->unprepared('VACUUM INTO '.$quotedPath);
            } else {
                $this->dumpMysql($connection->getConfig(), $temporarySnapshot);
            }

            $this->verifyArtifact($temporarySnapshot, $driver);
            if (! rename($temporarySnapshot, $snapshot)) {
                throw new RuntimeException('Could not finalize the database backup.');
            }

            $payload = [
                'format' => 1,
                'application' => config('app.name'),
                'application_version' => config('operations.version'),
                'created_at' => now('UTC')->toIso8601String(),
                'timezone' => PosDate::timezone(),
                'database_driver' => $driver,
                'database' => basename($snapshot),
                'bytes' => filesize($snapshot),
                'sha256' => hash_file('sha256', $snapshot),
                'migrations' => DB::table('migrations')->orderBy('batch')->orderBy('migration')->pluck('migration')->all(),
            ];

            File::put($temporaryManifest, json_encode(
                $payload,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
            ).PHP_EOL);
            if (! rename($temporaryManifest, $manifest)) {
                throw new RuntimeException('Could not finalize the backup manifest.');
            }

            $this->prune($directory);

            return $payload + ['manifest' => $manifest, 'snapshot' => $snapshot];
        } catch (Throwable $exception) {
            File::delete([$temporarySnapshot, $temporaryManifest]);
            if (! is_file($manifest)) {
                File::delete($snapshot);
            }

            throw $exception;
        }
    }

    public function latest(?string $directory = null): ?array
    {
        $directory ??= config('operations.backup.directory');

        foreach (collect(File::glob($directory.DIRECTORY_SEPARATOR.'pos-*.json'))->sortDesc() as $path) {
            if ($backup = $this->readManifest($path)) {
                return $backup;
            }
        }

        return null;
    }

    public function prune(?string $directory = null): void
    {
        $directory ??= config('operations.backup.directory');
        $backups = collect(File::glob($directory.DIRECTORY_SEPARATOR.'pos-*.json'))
            ->map(fn (string $path) => $this->readManifest($path))
            ->filter()
            ->sortByDesc('created_at')
            ->values();
        $retention = config('operations.backup.retention');
        $keep = [];

        foreach ($backups->take($retention['hourly']) as $backup) {
            $keep[$backup['manifest']] = true;
        }

        foreach ([
            ['daily', 'Y-m-d'],
            ['weekly', 'o-W'],
            ['monthly', 'Y-m'],
        ] as [$period, $format]) {
            $buckets = [];
            foreach ($backups as $backup) {
                $bucket = Carbon::parse($backup['created_at'])->utc()->format($format);
                $buckets[$bucket] ??= $backup;
            }
            foreach (array_slice($buckets, 0, $retention[$period]) as $backup) {
                $keep[$backup['manifest']] = true;
            }
        }

        foreach ($backups as $backup) {
            if (! isset($keep[$backup['manifest']])) {
                File::delete([$backup['manifest'], $backup['snapshot']]);
            }
        }
    }

    public function verifyArtifact(string $snapshot, string $driver): void
    {
        if (! is_file($snapshot) || filesize($snapshot) === 0) {
            throw new RuntimeException('The database backup is empty or missing.');
        }

        if ($driver === 'sqlite') {
            $pdo = new PDO('sqlite:'.$snapshot, options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            if ($pdo->query('PRAGMA integrity_check')->fetchColumn() !== 'ok') {
                throw new RuntimeException('SQLite integrity verification failed.');
            }

            return;
        }

        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            throw new RuntimeException("Database backup verification does not support the {$driver} driver.");
        }

        $handle = fopen($snapshot, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Could not read the database backup.');
        }

        $hasSql = false;
        try {
            while (($line = fgets($handle)) !== false) {
                if (str_contains(strtoupper($line), 'CREATE TABLE')) {
                    $hasSql = true;
                    break;
                }
            }
        } finally {
            fclose($handle);
        }

        if (! $hasSql) {
            throw new RuntimeException('The MySQL/MariaDB backup contains no table definitions.');
        }
    }

    private function dumpMysql(array $config, string $destination): void
    {
        $database = (string) ($config['database'] ?? '');
        if ($database === '') {
            throw new RuntimeException('The database name is not configured.');
        }

        $arguments = [
            (string) config('operations.backup.dump_binary'),
            '--host='.(string) ($config['host'] ?? '127.0.0.1'),
            '--port='.(string) ($config['port'] ?? 3306),
            '--user='.(string) ($config['username'] ?? ''),
            '--single-transaction',
            '--quick',
            '--skip-lock-tables',
            '--routines',
            '--events',
            '--triggers',
            '--hex-blob',
            '--default-character-set=utf8mb4',
            '--result-file='.$destination,
        ];
        if (! empty($config['unix_socket'])) {
            $arguments[] = '--socket='.(string) $config['unix_socket'];
        }
        $arguments[] = $database;

        $process = new Process(
            $arguments,
            base_path(),
            ['MYSQL_PWD' => (string) ($config['password'] ?? '')],
            null,
            (float) config('operations.backup.timeout_seconds'),
        );
        $process->run();

        if (! $process->isSuccessful()) {
            File::delete($destination);
            throw new RuntimeException('Database dump failed: '.trim($process->getErrorOutput()));
        }
    }

    private function readManifest(string $path): ?array
    {
        try {
            $manifest = json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR);
            $snapshot = dirname($path).DIRECTORY_SEPARATOR.basename((string) ($manifest['database'] ?? ''));
            if (! isset($manifest['created_at'], $manifest['sha256'], $manifest['database_driver'])
                || ! is_file($snapshot)
                || ! hash_equals((string) $manifest['sha256'], hash_file('sha256', $snapshot))) {
                return null;
            }
            Carbon::parse($manifest['created_at']);

            return $manifest + ['manifest' => $path, 'snapshot' => $snapshot];
        } catch (Throwable) {
            return null;
        }
    }
}
