<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('session_items', function (Blueprint $table) {
            if (! Schema::hasColumn('session_items', 'product_name')) {
                $table->string('product_name')->nullable()->after('product_id');
            }
            if (! Schema::hasColumn('session_items', 'product_category')) {
                $table->string('product_category')->nullable()->after('product_name');
            }
        });

        Schema::table('checkout_session_items', function (Blueprint $table) {
            if (! Schema::hasColumn('checkout_session_items', 'product_name')) {
                $table->string('product_name')->nullable()->after('product_id');
            }
            if (! Schema::hasColumn('checkout_session_items', 'product_category')) {
                $table->string('product_category')->nullable()->after('product_name');
            }
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('
                UPDATE session_items si
                LEFT JOIN products p ON p.id = si.product_id
                SET
                    si.product_name = COALESCE(si.product_name, p.name),
                    si.product_category = COALESCE(si.product_category, p.category)
                WHERE si.product_name IS NULL OR si.product_category IS NULL
            ');

            DB::statement('
                UPDATE checkout_session_items csi
                LEFT JOIN products p ON p.id = csi.product_id
                SET
                    csi.product_name = COALESCE(csi.product_name, p.name),
                    csi.product_category = COALESCE(csi.product_category, p.category)
                WHERE csi.product_name IS NULL OR csi.product_category IS NULL
            ');

            DB::statement('ALTER TABLE session_items DROP FOREIGN KEY session_items_product_id_foreign');
            DB::statement('ALTER TABLE session_items MODIFY product_id BIGINT UNSIGNED NULL');
            DB::statement('ALTER TABLE session_items ADD CONSTRAINT session_items_product_id_foreign FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL');

            DB::statement('ALTER TABLE checkout_session_items DROP FOREIGN KEY checkout_session_items_product_id_foreign');
            DB::statement('ALTER TABLE checkout_session_items MODIFY product_id BIGINT UNSIGNED NULL');
            DB::statement('ALTER TABLE checkout_session_items ADD CONSTRAINT checkout_session_items_product_id_foreign FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE session_items DROP FOREIGN KEY session_items_product_id_foreign');
            DB::statement('ALTER TABLE session_items ADD CONSTRAINT session_items_product_id_foreign FOREIGN KEY (product_id) REFERENCES products(id)');

            DB::statement('ALTER TABLE checkout_session_items DROP FOREIGN KEY checkout_session_items_product_id_foreign');
            DB::statement('ALTER TABLE checkout_session_items ADD CONSTRAINT checkout_session_items_product_id_foreign FOREIGN KEY (product_id) REFERENCES products(id)');
        }

        Schema::table('session_items', function (Blueprint $table) {
            if (Schema::hasColumn('session_items', 'product_category')) {
                $table->dropColumn('product_category');
            }
            if (Schema::hasColumn('session_items', 'product_name')) {
                $table->dropColumn('product_name');
            }
        });

        Schema::table('checkout_session_items', function (Blueprint $table) {
            if (Schema::hasColumn('checkout_session_items', 'product_category')) {
                $table->dropColumn('product_category');
            }
            if (Schema::hasColumn('checkout_session_items', 'product_name')) {
                $table->dropColumn('product_name');
            }
        });
    }
};
