<?php
// Test harness only. This file is excluded from the Windows installer.
if (PHP_SAPI !== 'cli' || getenv('LOX_SMOKE_TEST') !== '1') exit(1);
$base = getenv('LOX_APP_DIR');
require $base.'/vendor/autoload.php';
$app = require $base.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$user = App\Models\User::where('role','admin')->firstOrFail();
$session = $app->make('session')->driver();
$session->start();
Illuminate\Support\Facades\Auth::login($user);
$session->save();
$cookieName = config('session.cookie');
$encrypter = $app->make('encrypter');
$value = Illuminate\Cookie\CookieValuePrefix::create($cookieName,$encrypter->getKey()).$session->getId();
echo json_encode(['name'=>$cookieName,'value'=>$encrypter->encrypt($value,false)]);
