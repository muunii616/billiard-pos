<?php

namespace App\Http\Controllers;

use App\Support\DatabaseBackup;
use App\Support\EncryptedOffsiteBackup;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Throwable;

class HealthController extends Controller
{
    public function __invoke(DatabaseBackup $backups, EncryptedOffsiteBackup $offsite): JsonResponse
    {
        $checks = [
            'application' => true,
            'database' => false,
            'migrations' => false,
            'storage' => false,
            'disk' => false,
            'backup' => false,
        ];
        $backupAge = null;
        $offsiteAge = null;

        try {
            DB::select('SELECT 1');
            $checks['database'] = true;
            $ran = DB::table('migrations')->pluck('migration')->all();
            $required = collect(File::files(database_path('migrations')))
                ->map(fn ($file) => pathinfo($file->getFilename(), PATHINFO_FILENAME))
                ->all();
            $checks['migrations'] = array_diff($required, $ran) === [];
        } catch (Throwable) {
            // The response intentionally exposes no database exception details.
        }

        $directory = config('operations.backup.directory');
        $writablePath = is_dir($directory) ? $directory : dirname($directory);
        $checks['storage'] = is_dir($writablePath) && is_writable($writablePath);
        $freeBytes = @disk_free_space($writablePath);
        $checks['disk'] = $freeBytes !== false
            && $freeBytes >= config('operations.backup.minimum_free_bytes');

        if ($latest = $backups->latest($directory)) {
            $backupAge = (int) Carbon::parse($latest['created_at'])->diffInSeconds(now('UTC'));
            $checks['backup'] = $backupAge <= config('operations.backup.max_age_minutes') * 60;
        }

        if (config('operations.offsite_backup.directory')) {
            $checks['offsite_backup'] = false;
            if ($latest = $offsite->latest()) {
                $offsiteAge = (int) Carbon::parse($latest['created_at'])->diffInSeconds(now('UTC'));
                $checks['offsite_backup'] = $offsiteAge <= config('operations.offsite_backup.max_age_minutes') * 60;
            }
        }

        $healthy = ! in_array(false, $checks, true);

        return response()->json([
            'status' => $healthy ? 'healthy' : 'unhealthy',
            'checked_at' => now('UTC')->toIso8601String(),
            'version' => config('operations.version'),
            'checks' => $checks,
            'backup_age_seconds' => $backupAge,
            'offsite_backup_age_seconds' => $offsiteAge,
        ], $healthy ? 200 : 503);
    }
}
