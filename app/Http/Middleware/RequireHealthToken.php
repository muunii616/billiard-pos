<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireHealthToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('operations.health_token');
        if (is_string($expected) && $expected !== '' && hash_equals($expected, (string) $request->bearerToken())) {
            return $next($request);
        }

        if (! $expected && app()->environment(['local', 'testing'])) {
            return $next($request);
        }

        abort(404);
    }
}
