<?php

return [
    'health_token' => env('POS_HEALTH_TOKEN'),
    'version' => env('APP_VERSION', 'development'),

    'backup' => [
        'directory' => env('POS_BACKUP_PATH') ?: storage_path('app/backups'),
        'dump_binary' => env('POS_DB_DUMP_BINARY', 'mariadb-dump'),
        'timeout_seconds' => (int) env('POS_BACKUP_TIMEOUT_SECONDS', 300),
        'max_age_minutes' => (int) env('POS_BACKUP_MAX_AGE_MINUTES', 90),
        'minimum_free_bytes' => (int) env('POS_MINIMUM_FREE_BYTES', 2 * 1024 * 1024 * 1024),
        'retention' => [
            'hourly' => 24,
            'daily' => 7,
            'weekly' => 4,
            'monthly' => 6,
        ],
    ],

    'offsite_backup' => [
        'directory' => env('POS_OFFSITE_BACKUP_PATH'),
        'encryption_key' => env('POS_BACKUP_ENCRYPTION_KEY'),
        'max_age_minutes' => (int) env('POS_OFFSITE_BACKUP_MAX_AGE_MINUTES', 36 * 60),
        'retention' => [
            'daily' => 7,
            'weekly' => 4,
            'monthly' => 6,
        ],
    ],
];
