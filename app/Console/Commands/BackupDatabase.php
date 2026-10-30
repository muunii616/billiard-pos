<?php

namespace App\Console\Commands;

use App\Support\DatabaseBackup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class BackupDatabase extends Command
{
    protected $signature = 'pos:backup {--directory= : Override the configured local backup directory}';

    protected $description = 'Create and verify a transaction-safe database backup';

    public function handle(DatabaseBackup $backups): int
    {
        try {
            $backup = $backups->create($this->option('directory') ?: null);
            Log::info('Verified local POS backup created.', [
                'created_at' => $backup['created_at'],
                'bytes' => $backup['bytes'],
                'sha256' => $backup['sha256'],
            ]);
            $this->info('Verified backup created: '.basename($backup['snapshot']));

            return self::SUCCESS;
        } catch (Throwable $exception) {
            Log::error('Local POS backup failed.', ['exception' => $exception]);
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}
