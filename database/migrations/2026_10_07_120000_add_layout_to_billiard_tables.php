<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('billiard_tables', function (Blueprint $table) {
            $table->unsignedSmallInteger('rotation')->default(0);
            $table->unsignedInteger('sort_order')->default(0);
        });

        foreach (DB::table('billiard_tables')->orderBy('id')->pluck('id') as $index => $id) {
            DB::table('billiard_tables')->where('id', $id)->update(['sort_order' => $index + 1]);
        }
    }

    public function down(): void
    {
        Schema::table('billiard_tables', function (Blueprint $table) {
            $table->dropColumn(['rotation', 'sort_order']);
        });
    }
};
