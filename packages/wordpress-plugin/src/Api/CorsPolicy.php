<?php

declare(strict_types=1);

namespace F2EBridge\Api;

/**
 * Handles CORS headers for Figma Desktop Plugin iframe requests.
 * Figma plugin UI runs inside a sandboxed iframe with Origin: `null`.
 */
final class CorsPolicy
{
    public function register(): void
    {
        add_action('init', [$this, 'handlePreflight'], 1);
        add_filter('rest_pre_serve_request', [$this, 'addRestCorsHeaders'], 10, 4);
    }

    public function handlePreflight(): void
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        $restRoute = $_GET['rest_route'] ?? '';
        $isF2e = str_contains((string) $uri, '/f2e-bridge/v1') || str_starts_with((string) $restRoute, '/f2e-bridge/v1');
        if (!$isF2e) {
            return;
        }

        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-WP-Nonce, Idempotency-Key');
        header('Access-Control-Max-Age: 86400');

        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            status_header(204);
            exit;
        }
    }

    public function addRestCorsHeaders(bool $served, $result, $request, $server): bool
    {
        $route = method_exists($request, 'get_route') ? (string) $request->get_route() : '';
        if (str_starts_with($route, '/f2e-bridge/v1')) {
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
            header('Access-Control-Allow-Headers: Authorization, Content-Type, X-WP-Nonce, Idempotency-Key');
        }
        return $served;
    }
}
