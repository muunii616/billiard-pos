<?php

use App\Support\DatabaseBackup;
use App\Support\EncryptedOffsiteBackup;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\TestCase;

uses(TestCase::class);

beforeEach(function () {
    $directory = storage_path('framework/testing/operations-'.Str::uuid());
    File::ensureDirectoryExists($directory);
    config([
        'operations.backup.directory' => $directory,
        'operations.backup.minimum_free_bytes' => 0,
        'operations.backup.dump_binary' => 'mariadb-dump',
        'operations.backup.timeout_seconds' => 30,
        'operations.offsite_backup.directory' => null,
        'operations.health_token' => 'test-health-token',
    ]);
    $this->artisan('migrate:fresh', ['--force' => true])->assertSuccessful();
});

afterEach(function () {
    $directory = config('operations.backup.directory');
    if (str_starts_with($directory, storage_path('framework/testing/operations-'))) {
        File::deleteDirectory($directory);
    }
});

test('it creates a verified database backup and manifest', function () {
    $this->artisan('pos:backup')->assertSuccessful();

    $manifests = File::glob(config('operations.backup.directory').DIRECTORY_SEPARATOR.'pos-*.json');
    expect($manifests)->toHaveCount(1);

    $manifest = json_decode(File::get($manifests[0]), true, flags: JSON_THROW_ON_ERROR);
    $snapshot = dirname($manifests[0]).DIRECTORY_SEPARATOR.$manifest['database'];

    expect(is_file($snapshot))->toBeTrue()
        ->and(hash_file('sha256', $snapshot))->toBe($manifest['sha256'])
        ->and($manifest['database_driver'])->toBe(DB::connection()->getDriverName())
        ->and($manifest['timezone'])->toBe('Asia/Ulaanbaatar')
        ->and($manifest['migrations'])->not->toBeEmpty();

    app(DatabaseBackup::class)->verifyArtifact($snapshot, $manifest['database_driver']);
});

test('the deep health endpoint requires its token and reports backup readiness', function () {
    $this->artisan('pos:backup')->assertSuccessful();

    $this->getJson('/up')->assertNotFound();
    $this->withToken('wrong')->getJson('/up')->assertNotFound();
    $this->withToken('test-health-token')->getJson('/up')
        ->assertOk()
        ->assertJsonPath('status', 'healthy')
        ->assertJsonPath('checks.database', true)
        ->assertJsonPath('checks.migrations', true)
        ->assertJsonPath('checks.storage', true)
        ->assertJsonPath('checks.disk', true)
        ->assertJsonPath('checks.backup', true);

    $manifestPath = File::glob(config('operations.backup.directory').DIRECTORY_SEPARATOR.'pos-*.json')[0];
    $manifest = json_decode(File::get($manifestPath), true, flags: JSON_THROW_ON_ERROR);
    File::put(dirname($manifestPath).DIRECTORY_SEPARATOR.$manifest['database'], 'corrupt');

    $this->withToken('test-health-token')->getJson('/up')
        ->assertServiceUnavailable()
        ->assertJsonPath('checks.backup', false);
});

test('it creates a decryptable encrypted offsite copy without storing the key', function () {
    $local = app(DatabaseBackup::class)->create();
    $offsiteDirectory = config('operations.backup.directory').DIRECTORY_SEPARATOR.'offsite';
    $key = random_bytes(32);
    config([
        'operations.offsite_backup.directory' => $offsiteDirectory,
        'operations.offsite_backup.encryption_key' => base64_encode($key),
    ]);

    $offsite = app(EncryptedOffsiteBackup::class)->copy($local);
    $restored = $offsiteDirectory.DIRECTORY_SEPARATOR.'restored.'.pathinfo($local['database'], PATHINFO_EXTENSION);
    app(EncryptedOffsiteBackup::class)->decrypt($offsite['manifest'], $restored);
    $ciphertext = File::get($offsite['encrypted']);
    $plaintext = openssl_decrypt(
        $ciphertext,
        $offsite['cipher'],
        $key,
        OPENSSL_RAW_DATA,
        base64_decode($offsite['nonce'], true),
        base64_decode($offsite['tag'], true),
    );

    expect(hash('sha256', $plaintext))->toBe($local['sha256'])
        ->and(hash_file('sha256', $restored))->toBe($local['sha256'])
        ->and(hash_file('sha256', $offsite['encrypted']))->toBe($offsite['sha256'])
        ->and(File::get($offsite['manifest']))->not->toContain(base64_encode($key));
});

test('backup retention removes expired known backups but preserves unknown files', function () {
    $directory = config('operations.backup.directory');
    config(['operations.backup.retention' => [
        'hourly' => 2,
        'daily' => 2,
        'weekly' => 2,
        'monthly' => 2,
    ]]);

    foreach (range(0, 14) as $daysAgo) {
        $name = sprintf('pos-%02d', $daysAgo);
        $snapshot = $name.'.sqlite';
        File::put($directory.DIRECTORY_SEPARATOR.$snapshot, 'snapshot');
        File::put($directory.DIRECTORY_SEPARATOR.$name.'.json', json_encode([
            'created_at' => now('UTC')->subDays($daysAgo)->toIso8601String(),
            'database_driver' => 'sqlite',
            'database' => $snapshot,
            'sha256' => hash_file('sha256', $directory.DIRECTORY_SEPARATOR.$snapshot),
        ], JSON_THROW_ON_ERROR));
    }
    File::put($directory.DIRECTORY_SEPARATOR.'pos-unknown.json', '{invalid');

    app(DatabaseBackup::class)->prune();

    $remaining = File::glob($directory.DIRECTORY_SEPARATOR.'pos-*.sqlite');
    expect(count($remaining))->toBeLessThan(15)
        ->and(is_file($directory.DIRECTORY_SEPARATOR.'pos-00.sqlite'))->toBeTrue()
        ->and(is_file($directory.DIRECTORY_SEPARATOR.'pos-unknown.json'))->toBeTrue();
});

test('it rejects an incomplete MySQL or MariaDB dump', function () {
    $path = config('operations.backup.directory').DIRECTORY_SEPARATOR.'invalid.sql';
    File::put($path, '-- dump exited without writing tables');

    expect(fn () => app(DatabaseBackup::class)->verifyArtifact($path, 'mariadb'))
        ->toThrow(RuntimeException::class, 'contains no table definitions');
});
