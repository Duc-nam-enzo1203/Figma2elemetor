<?php

declare(strict_types=1);

namespace F2EBridge\Api;

use F2EBridge\Elementor\DocumentWriter;
use F2EBridge\Elementor\GlobalStyles;
use F2EBridge\Elementor\TranspilerV3;
use F2EBridge\Elementor\TranspilerV4;
use F2EBridge\Media\AssetStore;
use F2EBridge\Security\TokenAuth;

/**
 * WordPress REST API Controller (`/wp-json/f2e-bridge/v1/*`)
 * - `GET  /status`        — Site info, Elementor Free/Pro version, existing Pages & Templates list
 * - `POST /assets`        — Upload SHA-256 deduplicated Raster & SVG assets
 * - `POST /design-system` — Sync Figma Color Variables & Text Styles to Elementor Active Kit
 * - `POST /import`        — Compile & Save/Re-sync `f2e.document` into WP Page or Elementor Library
 */
final class RestController
{
    public const NAMESPACE = 'f2e-bridge/v1';

    public function __construct(
        private readonly TokenAuth $auth = new TokenAuth(),
        private readonly AssetStore $assets = new AssetStore(),
        private readonly GlobalStyles $globalStyles = new GlobalStyles(),
        private readonly DocumentWriter $writer = new DocumentWriter()
    ) {
    }

    public function registerRoutes(): void
    {
        register_rest_route(self::NAMESPACE, '/status', [
            'methods' => 'GET',
            'callback' => [$this, 'handleStatus'],
            'permission_callback' => [$this, 'authorizeRequest'],
        ]);

        register_rest_route(self::NAMESPACE, '/assets', [
            'methods' => 'POST',
            'callback' => [$this, 'handleUploadAsset'],
            'permission_callback' => [$this, 'authorizeRequest'],
        ]);

        register_rest_route(self::NAMESPACE, '/design-system', [
            'methods' => 'POST',
            'callback' => [$this, 'handleSyncDesignSystem'],
            'permission_callback' => [$this, 'authorizeRequest'],
        ]);

        register_rest_route(self::NAMESPACE, '/import', [
            'methods' => 'POST',
            'callback' => [$this, 'handleImport'],
            'permission_callback' => [$this, 'authorizeRequest'],
        ]);
    }

    public function authorizeRequest($request): bool
    {
        if (function_exists('current_user_can') && current_user_can('edit_posts')) {
            return true;
        }
        $header = method_exists($request, 'get_header') ? $request->get_header('authorization') : ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        if ($this->auth->verifyBearerHeader(is_string($header) ? $header : null)) {
            if (function_exists('wp_set_current_user')) {
                wp_set_current_user($this->auth->getPairedUserId());
            }
            return true;
        }
        return false;
    }

    public function handleStatus($request)
    {
        $pages = [];
        $templates = [];

        if (function_exists('get_posts')) {
            foreach (get_posts(['post_type' => 'page', 'post_status' => ['publish', 'draft'], 'numberposts' => 50]) as $p) {
                $pages[] = ['id' => (int) $p->ID, 'title' => (string) $p->post_title, 'status' => (string) $p->post_status];
            }
            foreach (get_posts(['post_type' => 'elementor_library', 'post_status' => ['publish', 'draft'], 'numberposts' => 50]) as $t) {
                $templates[] = ['id' => (int) $t->ID, 'title' => (string) $t->post_title, 'status' => (string) $t->post_status];
            }
        }

        return rest_ensure_response([
            'success' => true,
            'data' => [
                'siteName' => function_exists('get_bloginfo') ? (string) get_bloginfo('name') : 'WordPress Site',
                'bridgeVersion' => defined('F2E_BRIDGE_VERSION') ? F2E_BRIDGE_VERSION : '1.0.0',
                'elementorVersion' => defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '3.27.0',
                'hasPro' => defined('ELEMENTOR_PRO_VERSION'),
                'pages' => $pages,
                'templates' => $templates,
            ],
        ]);
    }

    public function handleUploadAsset($request)
    {
        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];
        $sha256 = (string) ($params['sha256'] ?? '');
        $base64 = (string) ($params['base64'] ?? '');
        $mime = (string) ($params['mime'] ?? 'image/png');
        $name = (string) ($params['name'] ?? 'Figma Asset');

        if ($base64 === '') {
            return new \WP_Error('missing_base64', 'Missing asset base64 payload.', ['status' => 400]);
        }

        $stored = $this->assets->storeBase64Asset($sha256, $base64, $mime, $name);
        if ($stored === null) {
            return new \WP_Error('upload_failed', 'Could not store asset in Media Library.', ['status' => 500]);
        }

        return rest_ensure_response([
            'success' => true,
            'data' => $stored,
        ]);
    }

    public function handleSyncDesignSystem($request)
    {
        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];
        $colors = is_array($params['colors'] ?? null) ? $params['colors'] : [];
        $typography = is_array($params['typography'] ?? null) ? $params['typography'] : [];

        $report = $this->globalStyles->sync($colors, $typography);
        return rest_ensure_response([
            'success' => true,
            'data' => $report,
        ]);
    }

    public function handleImport($request)
    {
        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];
        $result = $this->processBundleOrTemplateArray($params, $params);
        return rest_ensure_response([
            'success' => true,
            'data' => $result,
        ]);
    }

    /**
     * Handles both Live Push requests, `.f2e.json` full bundles, and standard Elementor `.json` files.
     *
     * @param array<string,mixed> $payload
     * @param array<string,mixed> $options
     * @return array<string,mixed>
     */
    public function processBundleOrTemplateArray(array $payload, array $options = []): array
    {
        $attachmentMap = is_array($payload['attachmentMap'] ?? null) ? $payload['attachmentMap'] : [];

        // 1. If payload is an F2E Bundle with embedded Base64 assets, store them first
        if (is_array($payload['assets'] ?? null)) {
            foreach ($payload['assets'] as $asset) {
                if (!is_array($asset) || empty($asset['base64'])) {
                    continue;
                }
                $sha = (string) ($asset['sha256'] ?? '');
                $mime = (string) ($asset['mime'] ?? 'image/png');
                $stored = $this->assets->storeBase64Asset($sha, (string) $asset['base64'], $mime, (string) ($payload['document']['title'] ?? 'Figma Asset'));
                if ($stored !== null && $sha !== '') {
                    $attachmentMap[$sha] = ['id' => $stored['id'], 'url' => $stored['url']];
                }
            }
        }

        // 2. Sync design tokens if embedded in bundle
        if (is_array($payload['document']['tokens'] ?? null)) {
            $tokens = $payload['document']['tokens'];
            $colors = is_array($tokens['colors'] ?? null) ? $tokens['colors'] : [];
            $typo = is_array($tokens['typography'] ?? null) ? $tokens['typography'] : [];
            if ($colors !== [] || $typo !== []) {
                $this->globalStyles->sync($colors, $typo);
            }
        }

        $elVersion = (string) ($options['elementorVersion'] ?? $payload['elementorVersion'] ?? 'v3');
        $title = (string) ($options['title'] ?? $payload['title'] ?? $payload['document']['title'] ?? 'Figma Import');

        // 3. Prefer client-compiled high-fidelity Elementor v3/v4 elements when provided,
        // or transpile the IR document on the server
        if (is_array($payload['content'] ?? null) && $payload['content'] !== []) {
            $elements = $payload['content'];
        } elseif (is_array($payload['elements'] ?? null) && $payload['elements'] !== []) {
            $elements = $payload['elements'];
        } elseif (is_array($payload['document'] ?? null) && isset($payload['document']['nodes'])) {
            if ($elVersion === 'v4') {
                $transpiler = new TranspilerV4();
                $elements = $transpiler->transpile($payload['document'], $attachmentMap);
            } else {
                $transpiler = new TranspilerV3(new GlobalStyles(), $this->assets);
                $elements = $transpiler->transpile($payload['document'], $attachmentMap);
            }
        } else {
            $elements = [];
        }

        return $this->writer->saveOrSync($elements, [
            'title' => $title,
            'targetType' => $options['targetType'] ?? $payload['targetType'] ?? 'page',
            'templateType' => $options['templateType'] ?? $payload['templateType'] ?? 'page',
            'targetPostId' => (int) ($options['targetPostId'] ?? $payload['targetPostId'] ?? 0),
            'postStatus' => $options['postStatus'] ?? $payload['postStatus'] ?? 'draft',
            'importMode' => $options['importMode'] ?? $payload['importMode'] ?? 'resync',
        ]);
    }
}
