<?php

return [
    /*
    |--------------------------------------------------------------------------
    | POS Billing
    |--------------------------------------------------------------------------
    |
    | Table time is charged in fixed blocks staff stack at checkout.
    | The play clock is reference only and never auto-bills per minute.
    |
    */
    'time_blocks' => [
        ['minutes' => 60, 'price' => 20000, 'label' => '1 hour'],
        ['minutes' => 30, 'price' => 10000, 'label' => '30 min'],
        ['minutes' => 15, 'price' => 5000, 'label' => '15 min'],
    ],

    /*
    |--------------------------------------------------------------------------
    | POS Payment Methods
    |--------------------------------------------------------------------------
    */
    'payment_methods' => [
        'cash',
        'card',
        'transfer_qr',
    ],
];
