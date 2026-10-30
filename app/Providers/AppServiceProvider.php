<?php

namespace App\Providers;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\AuditContext;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(AuditContext::class, fn () => new AuditContext);
    }

    public function boot(): void
    {
        Date::use(CarbonImmutable::class);

        if (config('app.force_https')) {
            URL::forceScheme('https');
        }

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );

        foreach (['created', 'updated', 'deleted'] as $event) {
            Event::listen("eloquent.{$event}: *", function (string $name, array $payload) use ($event) {
                if (($payload[0] ?? null) instanceof Model) {
                    app(AuditContext::class)->record($payload[0], $event);
                }
            });
        }

        Event::listen(Login::class, fn (Login $event) => $this->auditAuthentication(
            'auth.login',
            'authenticated',
            $event->user,
            ['role' => $event->user->role],
        ));
        Event::listen(Logout::class, fn (Logout $event) => $this->auditAuthentication(
            'auth.logout',
            'logged_out',
            $event->user,
        ));
        Event::listen(Failed::class, fn (Failed $event) => $this->auditAuthentication(
            'auth.login.failed',
            'rejected',
            $event->user,
            ['identifier_sha256' => hash('sha256', strtolower((string) ($event->credentials['email'] ?? 'unknown')))],
        ));
    }

    private function auditAuthentication(string $action, string $event, ?User $user, ?array $after = null): void
    {
        if (! Schema::hasTable('audit_logs')) {
            return;
        }

        AuditLog::create([
            'request_id' => (string) Str::uuid(),
            'user_id' => $user?->id,
            'action' => $action,
            'event' => $event,
            'auditable_type' => User::class,
            'auditable_id' => $user?->id,
            'after' => $after,
            'ip_address' => request()?->ip(),
            'created_at' => now('UTC'),
        ]);
    }
}
