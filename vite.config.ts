import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, mode }) => {
    const isBuild = command === 'build';
    const isProduction = mode === 'production';

    return {
        plugins: [
            laravel({
                input: ['resources/css/app.css', 'resources/js/app.tsx'],
                ssr: 'resources/js/ssr.tsx',
                refresh: true,
            }),
            react(
                isProduction
                    ? {
                          babel: {
                              plugins: ['babel-plugin-react-compiler'],
                          },
                      }
                    : {},
            ),
            tailwindcss(),
            // Avoid regenerating route TS on every local Vite boot.
            ...(isBuild
                ? [
                      wayfinder({
                          formVariants: true,
                      }),
                  ]
                : []),
            // Keep the plugin loaded so `virtual:pwa-register` resolves in local too.
            VitePWA({
                registerType: 'autoUpdate',
                injectRegister: false,
                includeAssets: [
                    'favicon.ico',
                    'favicon.svg',
                    'apple-touch-icon.png',
                    'logo-512.png',
                ],
                manifest: {
                    name: 'Lox Billiard POS',
                    short_name: 'Lox Billiard',
                    description:
                        'Desktop installable POS for billiard hall operations.',
                    theme_color: '#111827',
                    background_color: '#111827',
                    display: 'standalone',
                    start_url: '/dashboard',
                    scope: '/',
                    icons: [
                        {
                            src: '/logo-512.png',
                            sizes: '192x192',
                            type: 'image/png',
                        },
                        {
                            src: '/logo-512.png',
                            sizes: '512x512',
                            type: 'image/png',
                        },
                        {
                            src: '/logo-512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'maskable',
                        },
                    ],
                },
                workbox: {
                    navigateFallback: '/offline.html',
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                },
                devOptions: {
                    enabled: false,
                },
            }),
        ],
        esbuild: {
            jsx: 'automatic',
        },
        server: {
            warmup: {
                clientFiles: [
                    './resources/js/app.tsx',
                    './resources/js/pages/dashboard.tsx',
                    './resources/js/pages/tables/index.tsx',
                ],
            },
        },
    };
});
