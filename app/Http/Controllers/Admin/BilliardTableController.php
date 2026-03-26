<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BilliardTable;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BilliardTableController extends Controller
{
    public function index(): Response
    {
        $tables = BilliardTable::orderBy('id')->get();

        return Inertia::render('admin/tables', [
            'tables' => $tables,
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        BilliardTable::create([
            'name' => $data['name'],
            'status' => 'available',
        ]);

        return redirect()->back();
    }

    public function update(Request $request, BilliardTable $table)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'status' => ['sometimes', 'required', 'string', 'in:available,running,paused,maintenance'],
        ]);

        $table->update($data);

        return redirect()->back();
    }

    public function destroy(BilliardTable $table)
    {
        // Only allow deleting tables that are not currently running/paused.
        if ($table->status === 'running' || $table->status === 'paused') {
            return redirect()->back()->withErrors(['table' => 'Cannot delete a table with an active session.']);
        }

        $table->delete();

        return redirect()->back();
    }
}
