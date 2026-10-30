<?php

namespace App\Console\Commands;

use App\Support\EncryptedOffsiteBackup;
use Illuminate\Console\Command;
use Throwable;

class DecryptBackup extends Command
{
    protected $signature = 'pos:backup-decrypt {manifest : Encrypted backup manifest} {output : New SQL or SQLite output path}';

    protected $description = 'Verify and decrypt an offsite backup without replacing the live database';

    public function handle(EncryptedOffsiteBackup $backups): int
    {
        try {
            $output = $backups->decrypt(
                $this->argument('manifest'),
                $this->argument('output'),
            );
            $this->info('Verified backup restored to: '.$output);

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}
