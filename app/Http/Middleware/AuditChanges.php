<?php

namespace App\Http\Middleware;

use App\Support\AuditContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuditChanges
{
    public function __construct(private AuditContext $audit) {}

    public function handle(Request $request, Closure $next): Response
    {
        $this->audit->begin($request);

        try {
            return $next($request);
        } finally {
            $this->audit->end();
        }
    }
}
