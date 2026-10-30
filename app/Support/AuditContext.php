<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class AuditContext
{
    private ?array $context = null;

    public function begin(Request $request): void
    {
        $reason = collect(['reason', 'variance_reason', 'note'])
            ->map(fn (string $key) => trim((string) $request->input($key, '')))
            ->first(fn (string $value) => $value !== '');

        $this->context = [
            'request_id' => (string) Str::uuid(),
            'user_id' => $request->user()?->id,
            'action' => $request->route()?->getName() ?? $request->method().' '.$request->path(),
            'reason' => $reason ?: null,
            'ip_address' => $request->ip(),
        ];
    }

    public function end(): void
    {
        $this->context = null;
    }

    public function record(Model $model, string $event): void
    {
        if (! $this->context || $model instanceof AuditLog) {
            return;
        }

        [$before, $after] = match ($event) {
            'created' => [null, $this->safe($model, $model->getAttributes())],
            'deleted' => [$this->safe($model, $model->getAttributes()), null],
            default => $this->updatedValues($model),
        };

        if ($before === [] && $after === []) {
            return;
        }

        AuditLog::create($this->context + [
            'event' => $event,
            'auditable_type' => $model::class,
            'auditable_id' => $model->getKey() !== null ? (string) $model->getKey() : null,
            'before' => $before,
            'after' => $after,
            'created_at' => now('UTC'),
        ]);
    }

    private function updatedValues(Model $model): array
    {
        $changes = Arr::except($model->getChanges(), ['updated_at']);
        $keys = array_keys($changes);

        return [
            $this->safe($model, Arr::only($model->getRawOriginal(), $keys)),
            $this->safe($model, $changes),
        ];
    }

    private function safe(Model $model, array $attributes): array
    {
        return Arr::except($attributes, $model->getHidden());
    }
}
