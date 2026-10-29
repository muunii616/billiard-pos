<?php

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\User;
use Carbon\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

test('cross midnight merges keep the latest tab date and original table and product dates', function () {
    config(['app.display_timezone' => 'Asia/Ulaanbaatar']);
    $user = User::factory()->create();
    $early = Carbon::parse('2026-10-19T15:59:00Z');
    $late = Carbon::parse('2026-10-19T16:01:00Z');
    $target = CheckoutSession::create(['status' => 'open']);
    $target->forceFill(['created_at' => $early])->save();
    $source = CheckoutSession::create(['status' => 'open']);
    $source->forceFill(['created_at' => $late])->save();
    $product = Product::create(['name' => 'Beer', 'category' => 'Beer', 'price' => 5000, 'stock_quantity' => 4]);
    $items = collect([$target, $source])->map(function ($tab) use ($product) {
        $item = CheckoutSessionItem::create([
            'checkout_session_id' => $tab->id,
            'product_id' => $product->id,
            'product_name' => $product->name,
            'quantity' => 1,
            'unit_price' => 5000,
            'total_price' => 5000,
        ]);
        $item->forceFill(['created_at' => $tab->created_at])->save();

        return $item;
    });
    $table = BilliardTable::create(['name' => 'Table 8', 'status' => 'available']);
    $session = GameSession::create([
        'checkout_session_id' => $source->id,
        'billiard_table_id' => $table->id,
        'user_id' => $user->id,
        'status' => 'completed',
        'started_at' => $early->copy()->subHour(),
        'ended_at' => $early,
        'time_total' => 5000,
        'total_minutes' => 60,
    ]);
    $sessionDates = [$session->started_at->toIso8601String(), $session->ended_at->toIso8601String()];

    $this->actingAs($user)->post(route('checkouts.merge'), [
        'target_id' => $target->id, 'source_ids' => [$source->id],
    ])->assertRedirect(route('checkouts.index'));

    expect($target->fresh()->created_at->eq($early))->toBeTrue()
        ->and($target->fresh()->latest_tab_at->eq($late))->toBeTrue()
        ->and($target->items()->count())->toBe(2)
        ->and($items[0]->fresh()->created_at->eq($early))->toBeTrue()
        ->and($items[1]->fresh()->created_at->eq($late))->toBeTrue()
        ->and($product->fresh()->stock_quantity)->toBe(4);
    $session->refresh();
    expect([$session->started_at->toIso8601String(), $session->ended_at->toIso8601String()])->toBe($sessionDates);

    // Merge the already-merged tab into an older target: its newest date must travel with it.
    $older = CheckoutSession::create(['status' => 'open']);
    $older->forceFill(['created_at' => $early->copy()->subDay()])->save();
    $this->post(route('checkouts.merge'), [
        'target_id' => $older->id, 'source_ids' => [$target->id],
    ])->assertRedirect();
    expect($older->fresh()->latest_tab_at->eq($late))->toBeTrue();

    $this->get(route('checkouts.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('checkouts/index')
        ->has('checkouts', 1)
        ->where('checkouts.0.latest_tab_at', $late->toIso8601String())
        ->where('checkouts.0.grand_total', 15000)
        ->where('checkouts.0.table_sessions.0.started_at', $session->started_at->copy()->setTimezone('Asia/Ulaanbaatar')->toIso8601String())
        ->has('checkouts.0.tab_items', 2)
    );
});

test('merging an older source never moves a newer target backwards', function () {
    $user = User::factory()->create();
    $target = CheckoutSession::create(['status' => 'open']);
    $source = CheckoutSession::create(['status' => 'open']);
    $source->forceFill(['created_at' => $target->created_at->copy()->subDays(2)])->save();

    $this->actingAs($user)->post(route('checkouts.merge'), [
        'target_id' => $target->id, 'source_ids' => [$source->id],
    ])->assertRedirect();
    expect($target->fresh()->latest_tab_at->eq($target->created_at))->toBeTrue();
});
