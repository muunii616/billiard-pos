<?php

use App\Models\AuditLog;
use App\Models\BilliardTable;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\SessionItem;
use App\Models\User;

test('a correction records its actor reason and related before and after values', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $product = Product::create([
        'name' => 'Audit Drink',
        'category' => 'Drinks',
        'price' => 3000,
        'stock_quantity' => 8,
        'low_stock_threshold' => 2,
        'is_active' => true,
    ]);
    $table = BilliardTable::create(['name' => 'Audit Table', 'status' => 'running']);
    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $admin->id,
        'status' => 'running',
        'started_at' => now()->subMinutes(10),
        'total_played_seconds' => 0,
        'time_total' => 0,
    ]);
    SessionItem::create([
        'game_session_id' => $session->id,
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_category' => $product->category,
        'quantity' => 2,
        'unit_price' => 3000,
        'total_price' => 6000,
    ]);

    $this->actingAs($admin)->postJson(route('tables.cancel-session', $table), [
        'reason' => 'Customer order was entered twice.',
        'restock' => true,
    ])->assertOk();

    $sessionAudit = AuditLog::query()
        ->where('action', 'tables.cancel-session')
        ->where('auditable_type', GameSession::class)
        ->where('auditable_id', $session->id)
        ->where('event', 'updated')
        ->firstOrFail();
    $productAudit = AuditLog::query()
        ->where('request_id', $sessionAudit->request_id)
        ->where('auditable_type', Product::class)
        ->firstOrFail();

    expect($sessionAudit->user_id)->toBe($admin->id)
        ->and($sessionAudit->reason)->toBe('Customer order was entered twice.')
        ->and($sessionAudit->before['status'])->toBe('running')
        ->and($sessionAudit->after['status'])->toBe('cancelled')
        ->and($productAudit->before['stock_quantity'])->toBe(8)
        ->and($productAudit->after['stock_quantity'])->toBe(10);
});

test('only administrators can read the audit trail', function () {
    $employee = User::factory()->create(['role' => 'employee']);
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($employee)->getJson(route('admin.audit-logs.index'))->assertForbidden();
    $this->actingAs($admin)->getJson(route('admin.audit-logs.index'))->assertOk();
});

test('login success and failure are audited without storing a plain identifier', function () {
    $user = User::factory()->create([
        'email' => 'audit-login@example.com',
        'password' => 'correct-password',
    ]);

    $this->post('/login', [
        'email' => $user->email,
        'password' => 'wrong-password',
    ])->assertSessionHasErrors();
    $this->post('/login', [
        'email' => $user->email,
        'password' => 'correct-password',
    ])->assertRedirect();

    $failed = AuditLog::where('action', 'auth.login.failed')->firstOrFail();
    $success = AuditLog::where('action', 'auth.login')->firstOrFail();

    expect($failed->after)->toHaveKey('identifier_sha256')
        ->and(json_encode($failed->after))->not->toContain($user->email)
        ->and($success->user_id)->toBe($user->id);
});
