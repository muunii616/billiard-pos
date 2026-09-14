<?php

use App\Models\User;
use Illuminate\Support\Facades\Route;

it('does not expose public registration routes', function () {
    expect(Route::has('register'))->toBeFalse()->and(Route::has('register.store'))->toBeFalse();
    $this->get('/register')->assertNotFound();
    $this->post('/register', [
        'name' => 'Uninvited', 'email' => 'uninvited@example.com',
        'password' => 'password', 'password_confirmation' => 'password',
    ])->assertNotFound();
    expect(User::count())->toBe(0);
});

it('allows an administrator to create a staff account', function () {
    $this->actingAs(User::factory()->create(['role' => 'admin']))
        ->post('/admin/users', ['name' => 'Staff', 'email' => 'staff@example.com', 'password' => 'password', 'password_confirmation' => 'password', 'role' => 'employee'])
        ->assertRedirect();
    $this->assertDatabaseHas('users', ['email' => 'staff@example.com', 'role' => 'employee']);
});
