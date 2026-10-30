<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Throwable;

class EncryptedOffsiteBackup
{
    public function __construct(private DatabaseBackup $backups) {}

    public function copy(array $backup): array
    {
        $directory = config('operations.offsite_backup.directory');
        if (! is_string($directory) || $directory === '') {
            throw new RuntimeException('POS_OFFSITE_BACKUP_PATH is not configured.');
        }
        $key = $this->encryptionKey();

        File::ensureDirectoryExists($directory);
        $cipher = 'aes-256-gcm';
        $nonce = random_bytes(openssl_cipher_iv_length($cipher));
        // shortcut: encryption holds one snapshot in RAM, switch to streaming if backups approach available memory.
        $plaintext = File::get($backup['snapshot']);
        $encrypted = openssl_encrypt($plaintext, $cipher, $key, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($encrypted === false) {
            throw new RuntimeException('Backup encryption failed.');
        }

        $name = pathinfo($backup['snapshot'], PATHINFO_FILENAME);
        $encryptedPath = $directory.DIRECTORY_SEPARATOR.$name.'.enc';
        $temporaryEncrypted = $encryptedPath.'.tmp';
        $manifestPath = $directory.DIRECTORY_SEPARATOR.$name.'.json';
        $temporaryManifest = $manifestPath.'.tmp';

        try {
            File::put($temporaryEncrypted, $encrypted);
            if (! rename($temporaryEncrypted, $encryptedPath)) {
                throw new RuntimeException('Could not finalize the encrypted backup.');
            }

            $manifest = [
                'format' => 1,
                'application' => $backup['application'],
                'application_version' => $backup['application_version'],
                'created_at' => $backup['created_at'],
                'timezone' => $backup['timezone'],
                'database_driver' => $backup['database_driver'],
                'encrypted_file' => basename($encryptedPath),
                'cipher' => $cipher,
                'nonce' => base64_encode($nonce),
                'tag' => base64_encode($tag),
                'bytes' => filesize($encryptedPath),
                'sha256' => hash_file('sha256', $encryptedPath),
                'source_sha256' => $backup['sha256'],
                'migrations' => $backup['migrations'],
            ];
            File::put($temporaryManifest, json_encode(
                $manifest,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
            ).PHP_EOL);
            if (! rename($temporaryManifest, $manifestPath)) {
                throw new RuntimeException('Could not finalize the encrypted backup manifest.');
            }

            $this->prune($directory);

            return $manifest + ['manifest' => $manifestPath, 'encrypted' => $encryptedPath];
        } catch (Throwable $exception) {
            File::delete([$temporaryEncrypted, $temporaryManifest]);
            if (! is_file($manifestPath)) {
                File::delete($encryptedPath);
            }

            throw $exception;
        }
    }

    public function latest(?string $directory = null): ?array
    {
        $directory ??= config('operations.offsite_backup.directory');
        if (! is_string($directory) || $directory === '') {
            return null;
        }

        foreach (collect(File::glob($directory.DIRECTORY_SEPARATOR.'pos-*.json'))->sortDesc() as $path) {
            if ($backup = $this->readManifest($path)) {
                return $backup;
            }
        }

        return null;
    }

    public function decrypt(string $manifestPath, string $destination): string
    {
        if (is_file($destination)) {
            throw new RuntimeException('The restore destination already exists.');
        }

        $backup = $this->readManifest($manifestPath);
        if (! $backup || hash_file('sha256', $backup['encrypted']) !== $backup['sha256']) {
            throw new RuntimeException('Encrypted backup checksum verification failed.');
        }

        $plaintext = openssl_decrypt(
            File::get($backup['encrypted']),
            $backup['cipher'],
            $this->encryptionKey(),
            OPENSSL_RAW_DATA,
            base64_decode($backup['nonce'], true),
            base64_decode($backup['tag'], true),
        );
        if ($plaintext === false || hash('sha256', $plaintext) !== $backup['source_sha256']) {
            throw new RuntimeException('Encrypted backup decryption or source verification failed.');
        }

        File::ensureDirectoryExists(dirname($destination));
        $temporary = $destination.'.tmp';
        try {
            File::put($temporary, $plaintext);
            $this->backups->verifyArtifact($temporary, $backup['database_driver']);
            if (! rename($temporary, $destination)) {
                throw new RuntimeException('Could not finalize the decrypted backup.');
            }
        } catch (Throwable $exception) {
            File::delete($temporary);

            throw $exception;
        }

        return $destination;
    }

    public function prune(?string $directory = null): void
    {
        $directory ??= config('operations.offsite_backup.directory');
        $backups = collect(File::glob($directory.DIRECTORY_SEPARATOR.'pos-*.json'))
            ->map(fn (string $path) => $this->readManifest($path))
            ->filter()
            ->sortByDesc('created_at')
            ->values();
        $keep = [];

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
            foreach (array_slice($buckets, 0, config("operations.offsite_backup.retention.{$period}")) as $backup) {
                $keep[$backup['manifest']] = true;
            }
        }

        foreach ($backups as $backup) {
            if (! isset($keep[$backup['manifest']])) {
                File::delete([$backup['manifest'], $backup['encrypted']]);
            }
        }
    }

    private function readManifest(string $path): ?array
    {
        try {
            $manifest = json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR);
            $encrypted = dirname($path).DIRECTORY_SEPARATOR.basename((string) ($manifest['encrypted_file'] ?? ''));
            if (! isset($manifest['created_at'], $manifest['sha256'], $manifest['database_driver'])
                || ! is_file($encrypted)
                || ! hash_equals((string) $manifest['sha256'], hash_file('sha256', $encrypted))) {
                return null;
            }
            Carbon::parse($manifest['created_at']);

            return $manifest + ['manifest' => $path, 'encrypted' => $encrypted];
        } catch (Throwable) {
            return null;
        }
    }

    private function encryptionKey(): string
    {
        $key = base64_decode((string) config('operations.offsite_backup.encryption_key'), true);
        if ($key === false || strlen($key) !== 32) {
            throw new RuntimeException('POS_BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
        }

        return $key;
    }
}
