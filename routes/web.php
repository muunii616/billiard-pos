<?php

use App\Http\Controllers\Admin\BilliardTableController;
use App\Http\Controllers\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\CheckoutSessionController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\OverviewController;
use App\Http\Controllers\ReceiptController;
use App\Http\Controllers\TableController;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Features;

Route::inertia('/', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::get('overview', OverviewController::class)->name('overview');

    Route::get('tables', [TableController::class, 'index'])->name('tables.index');
    Route::post('tables/{table}/start', [TableController::class, 'start'])->name('tables.start');
    Route::post('tables/{table}/pause', [TableController::class, 'pause'])->name('tables.pause');
    Route::post('tables/{table}/resume', [TableController::class, 'resume'])->name('tables.resume');
    Route::get('tables/{table}/checkout-summary', [TableController::class, 'checkoutSummary'])->name('tables.checkout-summary');
    Route::post('tables/{table}/end', [TableController::class, 'end'])->name('tables.end');
    Route::post('tables/{table}/move-to-checkout', [TableController::class, 'moveToCheckout'])->name('tables.move-to-checkout');
    Route::post('tables/{table}/items', [TableController::class, 'addItem'])->name('tables.items.add');
    Route::post('tables/{table}/items/bulk', [TableController::class, 'addItemsBulk'])->name('tables.items.bulk');
    Route::get('checkouts', [CheckoutSessionController::class, 'index'])->name('checkouts.index');
    Route::get('checkouts/options', [CheckoutSessionController::class, 'options'])->name('checkouts.options');
    Route::post('checkouts/from-products', [CheckoutSessionController::class, 'createFromProducts'])->name('checkouts.from-products');
    Route::get('checkouts/{checkout}/summary', [CheckoutSessionController::class, 'summary'])->name('checkouts.summary');
    Route::post('checkouts/{checkout}/items', [CheckoutSessionController::class, 'addItem'])->name('checkouts.items.add');
    Route::post('checkouts/{checkout}/items/bulk', [CheckoutSessionController::class, 'addItemsBulk'])->name('checkouts.items.bulk');
    Route::post('checkouts/{checkout}/complete', [CheckoutSessionController::class, 'complete'])->name('checkouts.complete');
    Route::post('checkouts/merge', [CheckoutSessionController::class, 'merge'])->name('checkouts.merge');
    Route::post('receipts/{receipt}/send-email', [ReceiptController::class, 'sendEmail'])->name('receipts.send-email');

    // Admin-only routes will use the "role:admin" middleware.
    Route::middleware('role:admin')->group(function () {
        Route::get('admin/products', [AdminProductController::class, 'index'])->name('admin.products.index');
        Route::post('admin/products', [AdminProductController::class, 'store'])->name('admin.products.store');
        Route::put('admin/products/{product}', [AdminProductController::class, 'update'])->name('admin.products.update');
        Route::delete('admin/products/{product}', [AdminProductController::class, 'destroy'])->name('admin.products.destroy');

        Route::get('admin/tables', [BilliardTableController::class, 'index'])->name('admin.tables.index');
        Route::post('admin/tables', [BilliardTableController::class, 'store'])->name('admin.tables.store');
        Route::put('admin/tables/{table}', [BilliardTableController::class, 'update'])->name('admin.tables.update');
        Route::delete('admin/tables/{table}', [BilliardTableController::class, 'destroy'])->name('admin.tables.destroy');

        Route::get('admin/users', [AdminUserController::class, 'index'])->name('admin.users.index');
        Route::post('admin/users', [AdminUserController::class, 'store'])->name('admin.users.store');
        Route::put('admin/users/{user}', [AdminUserController::class, 'update'])->name('admin.users.update');
        Route::delete('admin/users/{user}', [AdminUserController::class, 'destroy'])->name('admin.users.destroy');
    });
});

require __DIR__.'/settings.php';
