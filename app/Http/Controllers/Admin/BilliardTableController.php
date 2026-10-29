<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BilliardTable;
use App\Support\PosTransaction;
use Illuminate\Http\Request;

class BilliardTableController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $nextOrder = ((int) BilliardTable::query()->max('sort_order')) + 1;

        BilliardTable::create([
            'name' => $data['name'],
            'status' => 'available',
            'rotation' => 0,
            'sort_order' => $nextOrder,
        ]);

        return redirect()->back();
    }

    public function update(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            $data = $request->validate([
                'name' => ['sometimes', 'required', 'string', 'max:255'],
                'status' => ['sometimes', 'required', 'string', 'in:available,running,paused,maintenance'],
                'rotation' => ['sometimes', 'integer', 'in:0,90'],
            ]);

            if (isset($data['status']) && $data['status'] !== $table->status) {
                if (in_array($data['status'], ['running', 'paused'], true) || $table->sessions()->whereIn('status', BilliardTable::activeSessionStatuses())->exists()) {
                    return back()->withErrors(['status' => 'Use session controls to start, pause, or end play.']);
                }
            }
            $table->update($data);

            return redirect()->back();
        });
    }

    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'distinct', 'exists:billiard_tables,id'],
        ]);

        foreach ($data['ids'] as $index => $id) {
            BilliardTable::query()->whereKey($id)->update(['sort_order' => $index + 1]);
        }

        return redirect()->back();
    }

    public function destroy(BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) {
            if ($table->status === 'running' || $table->status === 'paused') {
                return redirect()->back()->withErrors(['table' => 'Cannot delete a table with an active session.']);
            }

            $table->delete();

            return redirect()->back();
        });
    }
}
