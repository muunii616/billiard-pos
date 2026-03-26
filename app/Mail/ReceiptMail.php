<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ReceiptMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $receiptNumber,
        public string $date,
        public string $time,
        public string $tableName,
        public ?string $customerEmail,
        public array $lineItems,
        public float $grandTotal
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your receipt ' . $this->receiptNumber,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.receipt',
        );
    }
}
