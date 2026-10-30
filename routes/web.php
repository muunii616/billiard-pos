<?php

use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Admin\BilliardTableController;
use App\Http\Controllers\Admin\CashSessionAdminController;
use App\Http\Controllers\Admin\CheckoutAdminController;
use App\Http\Controllers\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Admin\ReceiptAdminController;
use App\Http\Controllers\Admin\TableAdminController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\CheckoutSessionController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\OverviewController;
use App\Http\Controllers\ReceiptController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\StockController;
use App\Http\Controllers\TableController;
use Illuminate\Support\Facades\Route;

Route::get('up', HealthController::class)->middleware('health.token')->name('health');
Route::inertia('/', 'welcome')->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::get('overview', OverviewController::class)->name('overview');
    Route::get('overview/download', [OverviewController::class, 'download'])->name('overview.download');
    Route::get('cash-register', RegisterController::class)->name('cash-register.index');
    Route::get('admin/products', [AdminProductController::class, 'index'])->name('admin.products.index');
    Route::get('stock', [StockController::class, 'index'])->name('stock.index');
    Route::get('stock/download', [StockController::class, 'download'])->name('stock.download');
    Route::post('admin/products/stock', [AdminProductController::class, 'adjustStock'])->middleware('audit')->name('admin.products.stock');
    Route::post('admin/products/external-use', [AdminProductController::class, 'recordExternalUse'])->middleware('audit')->name('admin.products.external-use');

    Route::get('tables', [TableController::class, 'index'])->name('tables.index');
    Route::post('tables/{table}/start', [TableController::class, 'start'])->name('tables.start');
    Route::post('tables/{table}/prepaid', [TableController::class, 'extendPrepaid'])->name('tables.prepaid.extend');
    Route::post('tables/{table}/prepaid/release', [TableController::class, 'releasePrepaid'])->name('tables.prepaid.release');
    Route::post('tables/{table}/pause', [TableController::class, 'pause'])->name('tables.pause');
    Route::post('tables/{table}/resume', [TableController::class, 'resume'])->name('tables.resume');
    Route::post('tables/{table}/alert', [TableController::class, 'setAlert'])->name('tables.alert.set');
    Route::post('tables/{table}/alert/clear', [TableController::class, 'clearAlert'])->name('tables.alert.clear');
    Route::get('tables/{table}/checkout-summary', [TableController::class, 'checkoutSummary'])->name('tables.checkout-summary');
    Route::post('tables/{table}/end', [TableController::class, 'end'])->name('tables.end');
    Route::post('tables/{table}/move-to-checkout', [TableController::class, 'moveToCheckout'])->name('tables.move-to-checkout');
    Route::post('tables/{table}/items', [TableController::class, 'addItem'])->name('tables.items.add');
    Route::post('tables/{table}/items/bulk', [TableController::class, 'addItemsBulk'])->name('tables.items.bulk');
    Route::post('tables/{table}/cancel-session', [TableAdminController::class, 'cancelSession'])->middleware('audit')->name('tables.cancel-session');
    Route::get('checkouts', [CheckoutSessionController::class, 'index'])->name('checkouts.index');
    Route::get('checkouts/options', [CheckoutSessionController::class, 'options'])->name('checkouts.options');
    Route::post('checkouts/from-products', [CheckoutSessionController::class, 'createFromProducts'])->name('checkouts.from-products');
    Route::get('checkouts/{checkout}/summary', [CheckoutSessionController::class, 'summary'])->name('checkouts.summary');
    Route::post('checkouts/{checkout}/items', [CheckoutSessionController::class, 'addItem'])->name('checkouts.items.add');
    Route::post('checkouts/{checkout}/items/bulk', [CheckoutSessionController::class, 'addItemsBulk'])->name('checkouts.items.bulk');
    Route::post('checkouts/{checkout}/complete', [CheckoutSessionController::class, 'complete'])->name('checkouts.complete');
    Route::post('checkouts/merge', [CheckoutSessionController::class, 'merge'])->name('checkouts.merge');
    Route::post('admin/checkouts/{checkout}/void', [CheckoutAdminController::class, 'void'])->middleware('audit')->name('admin.checkouts.void');
    Route::post('receipts/{receipt}/send-email', [ReceiptController::class, 'sendEmail'])->name('receipts.send-email');
    Route::get('admin/receipts/{receipt}', [ReceiptAdminController::class, 'show'])->name('admin.receipts.show');
    Route::get('admin/cash/current', [CashSessionAdminController::class, 'current'])->name('admin.cash.current');
    Route::post('admin/cash/open', [CashSessionAdminController::class, 'open'])->middleware('audit')->name('admin.cash.open');
    Route::post('admin/cash/close', [CashSessionAdminController::class, 'close'])->middleware('audit')->name('admin.cash.close');
    Route::post('admin/cash/continue', [CashSessionAdminController::class, 'continueShift'])->middleware('audit')->name('admin.cash.continue');
    Route::post('admin/cash/handover', [CashSessionAdminController::class, 'handover'])->middleware('audit')->name('admin.cash.handover');
    Route::get('admin/cash/{cashSession}/receipt', [CashSessionAdminController::class, 'receipt'])->name('admin.cash.receipt');

    // Admin-only routes will use the "role:admin" middleware.
    Route::middleware(['role:admin', 'audit'])->group(function () {
        Route::get('admin/audit-logs', AuditLogController::class)->name('admin.audit-logs.index');
        Route::post('admin/products', [AdminProductController::class, 'store'])->name('admin.products.store');
        Route::put('admin/products/{product}', [AdminProductController::class, 'update'])->name('admin.products.update');
        Route::delete('admin/products/{product}', [AdminProductController::class, 'destroy'])->name('admin.products.destroy');

        Route::post('admin/tables', [BilliardTableController::class, 'store'])->name('admin.tables.store');
        Route::put('admin/tables/reorder', [BilliardTableController::class, 'reorder'])->name('admin.tables.reorder');
        Route::put('admin/tables/{table}', [BilliardTableController::class, 'update'])->name('admin.tables.update');
        Route::delete('admin/tables/{table}', [BilliardTableController::class, 'destroy'])->name('admin.tables.destroy');

        Route::get('admin/users', [AdminUserController::class, 'index'])->name('admin.users.index');
        Route::post('admin/users', [AdminUserController::class, 'store'])->name('admin.users.store');
        Route::put('admin/users/{user}', [AdminUserController::class, 'update'])->name('admin.users.update');
        Route::delete('admin/users/{user}', [AdminUserController::class, 'destroy'])->name('admin.users.destroy');

        // Admin actions on existing pages
        Route::put('admin/checkouts/{checkout}/items', [CheckoutAdminController::class, 'updateItems'])->name('admin.checkouts.items.update');
        Route::post('admin/checkouts/{checkout}/reopen', [CheckoutAdminController::class, 'reopen'])->name('admin.checkouts.reopen');

        Route::put('admin/receipts/{receipt}', [ReceiptAdminController::class, 'update'])->name('admin.receipts.update');
        Route::post('admin/receipts/{receipt}/void', [ReceiptAdminController::class, 'void'])->name('admin.receipts.void');
        Route::get('admin/overview/export/csv', [ReceiptAdminController::class, 'exportCsv'])->name('admin.overview.export.csv');

        Route::put('admin/tables/{table}/session-items', [TableAdminController::class, 'updateSessionItems'])->name('admin.tables.session-items.update');
        Route::post('admin/tables/{table}/maintenance', [TableAdminController::class, 'setMaintenance'])->name('admin.tables.maintenance');

    });
});

require __DIR__.'/settings.php';
