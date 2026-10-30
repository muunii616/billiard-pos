<?php

namespace App\Console\Commands;

use App\Support\DatabaseBackup;
use App\Support\EncryptedOffsiteBackup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class BackupOffsite extends Command
{
    protected $signature = 'pos:backup-offsite';

    protected $description = 'Create a verified local backup and encrypted offsite copy';

    public function handle(DatabaseBackup $local, EncryptedOffsiteBackup $offsite): int
    {
        try {
            $backup = $offsite->copy($local->create());
            Log::info('Verified encrypted offsite POS backup created.', [
                'created_at' => $backup['created_at'],
                'bytes' => $backup['bytes'],
                'sha256' => $backup['sha256'],
            ]);
            $this->info('Verified encrypted offsite backup created: '.basename($backup['encrypted']));

            return self::SUCCESS;
        } catch (Throwable $exception) {
            Log::critical('Encrypted offsite POS backup failed.', ['exception' => $exception]);
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}
