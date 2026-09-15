<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function index(): Response
    {
        $users = User::orderBy('name')->get()->map(fn (User $user) => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role ?? 'employee',
        ]);

        return Inertia::render('admin/users', [
            'users' => $users,
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'role' => ['required', 'string', 'in:admin,employee'],
        ]);

        User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'password' => $data['password'],
            'role' => $data['role'],
        ]);

        return redirect()->back();
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'phone' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:8', 'confirmed'],
            'role' => ['sometimes', 'required', 'string', 'in:admin,employee'],
        ]);

        if (! empty($data['password'])) {
            $data['password'] = $data['password'];
        } else {
            unset($data['password']);
        }

        $user->update($data);

        return redirect()->back();
    }

    public function destroy(Request $request, User $user)
    {
        if ($request->user()->id === $user->id) {
            return redirect()->back()->withErrors(['user' => 'You cannot delete your own account.']);
        }

        if (($user->role ?? 'employee') === 'admin') {
            $otherAdmins = User::query()
                ->where('role', 'admin')
                ->whereKeyNot($user->id)
                ->count();

            if ($otherAdmins === 0) {
                return redirect()->back()->withErrors([
                    'user' => 'You cannot delete the last admin account.',
                ]);
            }
        }

        try {
            // Free the email so a replacement account can reuse it.
            $user->email = 'deleted+'.$user->id.'.'.Str::lower(Str::random(8)).'@deleted.local';
            $user->save();
            $user->delete();
        } catch (QueryException) {
            return redirect()->back()->withErrors([
                'user' => 'Could not delete this user because it is still linked to sales or stock history.',
            ]);
        }

        return redirect()->back();
    }
}
