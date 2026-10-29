<?php

namespace App\Http\Responses;

use Laravel\Fortify\Contracts\LoginResponse;
use Laravel\Fortify\Contracts\TwoFactorLoginResponse;

class RegisterLoginResponse implements LoginResponse, TwoFactorLoginResponse
{
    public function toResponse($request)
    {
        $request->session()->forget(['url.intended', 'register.continued']);

        return $request->wantsJson()
            ? response()->json(['two_factor' => false, 'redirect' => route('cash-register.index', absolute: false)])
            : redirect()->route('cash-register.index');
    }
}
