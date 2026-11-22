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

    public function resolveAllowedOrigin(?string $originHeader = null): string
    {
        $origin = trim((string) ($originHeader ?? ($_SERVER['HTTP_ORIGIN'] ?? '')));
        if ($origin === '') {
            return '';
        }
        if ($origin === 'null') {
            return 'null';
        }
        if ($origin === 'https://www.figma.com' || $origin === 'https://figma.com') {
            return $origin;
        }

        $parsedOrigin = parse_url($origin);
        if (!is_array($parsedOrigin)) {
            return '';
        }
        $originScheme = strtolower((string) ($parsedOrigin['scheme'] ?? ''));
        $originHost = strtolower((string) ($parsedOrigin['host'] ?? ''));
        $originPort = $parsedOrigin['port'] ?? null;
        if (!in_array($originScheme, ['http', 'https'], true) || $originHost === '') {
            return '';
        }

        $candidateUrls = [];
        if (function_exists('home_url')) {
            $candidateUrls[] = (string) home_url();
        }
        if (function_exists('site_url')) {
            $candidateUrls[] = (string) site_url();
        }

        foreach ($candidateUrls as $siteOrigin) {
            $siteOrigin = rtrim($siteOrigin, '/');
            if ($siteOrigin === '') {
                continue;
            }
            $parsedSite = parse_url($siteOrigin);
            if (!is_array($parsedSite)) {
                continue;
            }
            $siteHost = strtolower((string) ($parsedSite['host'] ?? ''));
            $sitePort = $parsedSite['port'] ?? null;
            if ($siteHost !== '' && $siteHost === $originHost && $sitePort === $originPort) {
                return $origin;
            }
        }

        return '';
    }

    public function handlePreflight(): void
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        $restRoute = $_GET['rest_route'] ?? '';
        $isF2e = str_contains((string) $uri, '/f2e-bridge/v1')
            || str_starts_with(ltrim((string) $restRoute, '/'), 'f2e-bridge/v1');
        if (!$isF2e) {
            return;
        }

        header('Vary: Origin');
        $allowedOrigin = $this->resolveAllowedOrigin();
        if ($allowedOrigin !== '') {
            header('Access-Control-Allow-Origin: ' . $allowedOrigin);
            header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
            header('Access-Control-Allow-Headers: Authorization, Content-Type, X-WP-Nonce, Idempotency-Key');
            header('Access-Control-Max-Age: 86400');
        }

        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            status_header(204);
            exit;
        }
    }

    public function addRestCorsHeaders(bool $served, $result, $request, $server): bool
    {
        $route = method_exists($request, 'get_route') ? (string) $request->get_route() : '';
        if (str_starts_with(ltrim($route, '/'), 'f2e-bridge/v1')) {
            header('Vary: Origin');
            $allowedOrigin = $this->resolveAllowedOrigin();
            if ($allowedOrigin !== '') {
                header('Access-Control-Allow-Origin: ' . $allowedOrigin);
                header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
                header('Access-Control-Allow-Headers: Authorization, Content-Type, X-WP-Nonce, Idempotency-Key');
            }
        }
        return $served;
    }
}
