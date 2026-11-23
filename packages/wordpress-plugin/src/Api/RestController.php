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

    /** @var array<string, array{id:int,url:string}> */
    private array $dataUriCache = [];

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

        register_rest_route(self::NAMESPACE, '/assets/batch', [
            'methods' => 'POST',
            'callback' => [$this, 'handleUploadAssetsBatch'],
            'permission_callback' => [$this, 'authorizeRequest'],
        ]);

        register_rest_route(self::NAMESPACE, '/design-system', [
            'methods' => 'POST',
            'callback' => [$this, 'handleSyncDesignSystem'],
            'permission_callback' => [$this, 'authorizeAdminRequest'],
        ]);

        register_rest_route(self::NAMESPACE, '/import', [
            'methods' => 'POST',
            'callback' => [$this, 'handleImport'],
            'permission_callback' => [$this, 'authorizeRequest'],
        ]);
    }

    public function authorizeRequest($request)
    {
        if (function_exists('current_user_can') && current_user_can('edit_pages')) {
            return true;
        }
        return $this->authorizeBearer($request);
    }

    public function authorizeAdminRequest($request)
    {
        if (function_exists('current_user_can') && current_user_can('manage_options')) {
            return true;
        }
        return $this->authorizeBearer($request);
    }

    private function authorizeBearer($request)
    {
        if ($this->auth->isRateLimited()) {
            if (class_exists('\WP_Error')) {
                return new \WP_Error('rate_limited', 'Too many failed authentication attempts. Try again later.', ['status' => 429]);
            }
            return false;
        }
        $header = method_exists($request, 'get_header') ? $request->get_header('authorization') : ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        if ($this->auth->verifyBearerHeader(is_string($header) ? $header : null)) {
            if (function_exists('wp_set_current_user')) {
                $pairedUserId = $this->auth->getPairedUserId();
                if ($pairedUserId > 0) {
                    wp_set_current_user($pairedUserId);
                }
            }
            return true;
        }
        return false;
    }

    public function handleStatus($request)
    {
        $pages = [];
        $templates = [];
        $search = method_exists($request, 'get_param') ? trim((string) ($request->get_param('search') ?? '')) : '';

        if (function_exists('get_posts')) {
            $pageQuery = [
                'post_type' => 'page',
                'post_status' => ['publish', 'draft', 'private'],
                'numberposts' => 250,
                'orderby' => 'modified',
                'order' => 'DESC',
            ];
            if ($search !== '') {
                $pageQuery['s'] = $search;
            }
            foreach (get_posts($pageQuery) as $p) {
                $pages[] = ['id' => (int) $p->ID, 'title' => (string) $p->post_title, 'status' => (string) $p->post_status];
            }

            $tplQuery = [
                'post_type' => 'elementor_library',
                'post_status' => ['publish', 'draft', 'private'],
                'numberposts' => 250,
                'orderby' => 'modified',
                'order' => 'DESC',
            ];
            if ($search !== '') {
                $tplQuery['s'] = $search;
            }
            foreach (get_posts($tplQuery) as $t) {
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
            $reason = $this->assets->getLastError();
            $msg = 'Could not store asset in Media Library' . ($reason !== '' ? ' (' . $reason . ')' : '.');
            return new \WP_Error('upload_failed', $msg, ['status' => 500]);
        }

        return rest_ensure_response([
            'success' => true,
            'data' => $stored,
        ]);
    }

    public function handleUploadAssetsBatch($request)
    {
        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];
        $rawAssets = $params['assets'] ?? null;
        $truncated = is_array($rawAssets) && count($rawAssets) > 50;
        $items = is_array($rawAssets) ? array_slice($rawAssets, 0, 50) : [];
        $defaultName = (string) ($params['name'] ?? 'Figma Asset');
        $attachmentMap = [];
        $errors = [];

        foreach ($items as $idx => $item) {
            if (!is_array($item) || empty($item['base64'])) {
                $errors[] = [
                    'index' => (int) $idx,
                    'sha256' => is_array($item) ? (string) ($item['sha256'] ?? '') : '',
                    'code' => 'missing_base64',
                    'message' => 'Missing asset base64 payload.',
                ];
                continue;
            }
            $sha256 = trim((string) ($item['sha256'] ?? ''));
            $mime = (string) ($item['mime'] ?? 'image/png');
            $name = (string) ($item['name'] ?? $defaultName);
            $stored = $this->assets->storeBase64Asset($sha256, (string) $item['base64'], $mime, $name);
            if ($stored === null) {
                $errors[] = [
                    'index' => (int) $idx,
                    'sha256' => $sha256,
                    'code' => 'upload_failed',
                    'message' => $this->assets->getLastError() ?: 'Could not store asset in Media Library.',
                ];
                continue;
            }
            $resolvedSha = $sha256 !== '' ? $sha256 : (string) ($stored['sha256'] ?? '');
            if ($resolvedSha !== '') {
                $attachmentMap[$resolvedSha] = $stored;
            } else {
                $errors[] = [
                    'index' => (int) $idx,
                    'sha256' => '',
                    'code' => 'missing_sha256',
                    'message' => 'Stored asset could not be indexed by SHA-256.',
                ];
            }
        }

        if ($truncated) {
            $errors[] = [
                'index' => 50,
                'sha256' => '',
                'code' => 'batch_limit_exceeded',
                'message' => 'Maximum 50 assets per batch request; extra items were skipped.',
            ];
        }

        return rest_ensure_response([
            'success' => true,
            'data' => [
                'attachmentMap' => $attachmentMap,
                'count' => count($attachmentMap),
                'errors' => $errors,
            ],
        ]);
    }

    public function handleSyncDesignSystem($request)
    {
        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];
        $colors = is_array($params['colors'] ?? null) ? $params['colors'] : [];
        $typography = is_array($params['typography'] ?? null) ? $params['typography'] : [];
        $themeStyles = is_array($params['themeStyles'] ?? null) ? $params['themeStyles'] : [];
        $generalSettings = is_array($params['settings'] ?? null) ? $params['settings'] : [];

        $report = $this->globalStyles->sync($colors, $typography, $themeStyles, $generalSettings);
        return rest_ensure_response([
            'success' => true,
            'data' => $report,
        ]);
    }

    public function handleImport($request)
    {
        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];
        try {
            $result = $this->processBundleOrTemplateArray($params, $params);
        } catch (\RuntimeException $e) {
            $status = (int) $e->getCode();
            if (!in_array($status, [400, 401, 403, 404, 500], true)) {
                $status = 403;
            }
            $errorCode = match ($status) {
                400 => 'invalid_payload',
                401 => 'unauthorized',
                404 => 'not_found',
                500 => 'import_failed',
                default => 'forbidden',
            };
            return new \WP_Error($errorCode, $e->getMessage(), ['status' => $status]);
        }

        if ((function_exists('is_wp_error') && is_wp_error($result)) || $result instanceof \WP_Error) {
            return $result;
        }

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
     * @return array<string,mixed>|\WP_Error
     */
    public function processBundleOrTemplateArray(array $payload, array $options = [])
    {
        $this->dataUriCache = [];
        $attachmentMap = is_array($payload['attachmentMap'] ?? null) ? $payload['attachmentMap'] : [];
        $assetErrors = [];
        $assetLookupById = [];
        $docTitle = (string) ($options['title'] ?? $payload['title'] ?? $payload['document']['title'] ?? 'Figma Asset');

        // 1. If payload is an F2E Bundle with embedded Base64 assets, store them first
        if (is_array($payload['assets'] ?? null)) {
            foreach ($payload['assets'] as $idx => $asset) {
                if (!is_array($asset) || empty($asset['base64'])) {
                    $assetErrors[] = [
                        'index' => (int) $idx,
                        'sha256' => is_array($asset) ? (string) ($asset['sha256'] ?? '') : '',
                        'assetId' => is_array($asset) ? (string) ($asset['assetId'] ?? '') : '',
                        'message' => 'Missing asset base64 payload.',
                    ];
                    continue;
                }
                $sha = trim((string) ($asset['sha256'] ?? ''));
                $mime = (string) ($asset['mime'] ?? 'image/png');
                $assetName = (string) ($asset['name'] ?? $asset['assetId'] ?? $docTitle);
                $stored = $this->assets->storeBase64Asset($sha, (string) $asset['base64'], $mime, $assetName);
                if ($stored === null) {
                    $assetErrors[] = [
                        'index' => (int) $idx,
                        'sha256' => $sha,
                        'assetId' => (string) ($asset['assetId'] ?? ''),
                        'message' => $this->assets->getLastError() ?: 'Could not store embedded bundle asset.',
                    ];
                    continue;
                }
                $resolvedSha = $sha !== '' ? $sha : (string) ($stored['sha256'] ?? '');
                $entry = ['id' => (int) $stored['id'], 'url' => (string) $stored['url']];
                if ($resolvedSha !== '') {
                    $attachmentMap[$resolvedSha] = $entry;
                }
                if (!empty($asset['assetId'])) {
                    $assetLookupById[(string) $asset['assetId']] = $entry;
                }
            }
        }

        // Build IR node lookup for precompiled bundles that omitted attachmentMap at export time
        $nodeLookup = [];
        if (is_array($payload['document']['nodes'] ?? null)) {
            foreach ($payload['document']['nodes'] as $nodeKey => $irNode) {
                if (!is_array($irNode)) {
                    continue;
                }
                $nodeLookup[(string) $nodeKey] = $irNode;
                if (!empty($irNode['id'])) {
                    $nodeLookup[(string) $irNode['id']] = $irNode;
                }
                if (!empty($irNode['sourceNodeId'])) {
                    $nodeLookup[(string) $irNode['sourceNodeId']] = $irNode;
                }
            }
        }

        // 2. Sync design tokens if embedded in bundle
        if (is_array($payload['document']['tokens'] ?? null)) {
            $tokens = $payload['document']['tokens'];
            $colors = is_array($tokens['colors'] ?? null) ? $tokens['colors'] : [];
            $typo = is_array($tokens['typography'] ?? null) ? $tokens['typography'] : [];
            $themeStyles = is_array($tokens['themeStyles'] ?? null) ? $tokens['themeStyles'] : [];
            $generalSettings = is_array($tokens['settings'] ?? null) ? $tokens['settings'] : [];
            if ($colors !== [] || $typo !== [] || $themeStyles !== [] || $generalSettings !== []) {
                $this->globalStyles->sync($colors, $typo, $themeStyles, $generalSettings);
            }
        }

        $elVersion = (string) ($options['elementorVersion'] ?? $payload['elementorVersion'] ?? 'v3');
        $title = (string) ($options['title'] ?? $payload['title'] ?? $payload['document']['title'] ?? 'Figma Import');

        // 3. Prefer client-compiled high-fidelity Elementor v3/v4 elements when provided
        // (including `.f2e.json` bundles with `elementorV3.content` / `elementorV4.content`),
        // or transpile the IR document on the server as fallback.
        if (is_array($payload['content'] ?? null) && $payload['content'] !== []) {
            $elements = $payload['content'];
        } elseif (is_array($payload['elements'] ?? null) && $payload['elements'] !== []) {
            $elements = $payload['elements'];
        } elseif ($elVersion === 'v4' && is_array($payload['elementorV4']['content'] ?? null) && $payload['elementorV4']['content'] !== []) {
            $elements = $payload['elementorV4']['content'];
        } elseif ($elVersion !== 'v4' && is_array($payload['elementorV3']['content'] ?? null) && $payload['elementorV3']['content'] !== []) {
            $elements = $payload['elementorV3']['content'];
        } elseif (is_array($payload['document'] ?? null) && isset($payload['document']['nodes'])) {
            if ($elVersion === 'v4') {
                $transpiler = new TranspilerV4($this->assets);
                $elements = $transpiler->transpile($payload['document'], $attachmentMap);
            } else {
                $transpiler = new TranspilerV3($this->globalStyles, $this->assets);
                $elements = $transpiler->transpile($payload['document'], $attachmentMap);
            }
        } else {
            $elements = [];
        }

        if ($elements === []) {
            throw new \RuntimeException('Import payload contains no Elementor elements or document nodes.', 400);
        }

        // 4. Hydrate any remaining inline Data-URI / f2e-asset:// / unmapped assets into real WP Media Library attachments,
        // sanitize inline HTML/SVG widgets, and bind verified Active Kit Global Colors & Fonts (`__globals__`) on v3 elements
        $elements = $this->hydrateCompiledElementAssets($elements, $title, $attachmentMap, $nodeLookup, $assetErrors, $assetLookupById);
        $elements = $this->sanitizeCompiledElementHtml($elements);
        if ($elVersion !== 'v4') {
            $elements = $this->globalStyles->bindGlobalsToElements($elements);
        }

        $saveResult = $this->writer->saveOrSync($elements, [
            'title' => $title,
            'targetType' => $options['targetType'] ?? $payload['targetType'] ?? 'page',
            'templateType' => $options['templateType'] ?? $payload['templateType'] ?? 'page',
            'targetPostId' => (int) ($options['targetPostId'] ?? $payload['targetPostId'] ?? 0),
            'postStatus' => $options['postStatus'] ?? $payload['postStatus'] ?? 'draft',
            'pageLayout' => $options['pageLayout'] ?? $payload['pageLayout'] ?? 'elementor_canvas',
            'importMode' => $options['importMode'] ?? $payload['importMode'] ?? 'resync',
        ]);

        if ((function_exists('is_wp_error') && is_wp_error($saveResult)) || $saveResult instanceof \WP_Error) {
            return $saveResult;
        }

        $saveResult['assetErrors'] = $assetErrors;
        return $saveResult;
    }

    public function hydrateElements(array $elements, string $title = 'Figma Asset'): array
    {
        $errors = [];
        return $this->hydrateCompiledElementAssets($elements, $title, [], [], $errors, []);
    }

    private function extractDataUriMime(string $dataUri): string
    {
        if (preg_match('/^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,/i', trim($dataUri), $m) === 1) {
            return strtolower($m[1]);
        }
        return 'image/png';
    }

    /**
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @param list<array<string,mixed>> $errors
     * @param array<string,array{id:int,url:string}> $assetLookupById
     * @return array{id:int,url:string}|null
     */
    private function hydrateMediaValue(
        string $urlOrSvg,
        string $title,
        array $attachmentMap = [],
        ?string $explicitSha = null,
        array &$errors = [],
        ?string $assetId = null,
        array $assetLookupById = []
    ): ?array {
        if ($explicitSha !== null && $explicitSha !== '' && isset($attachmentMap[$explicitSha])) {
            $mapped = $attachmentMap[$explicitSha];
            if (!empty($mapped['url']) || (int) ($mapped['id'] ?? 0) > 0) {
                return ['id' => (int) ($mapped['id'] ?? 0), 'url' => (string) ($mapped['url'] ?? '')];
            }
        }
        if ($assetId !== null && $assetId !== '' && isset($assetLookupById[$assetId])) {
            $mapped = $assetLookupById[$assetId];
            if (!empty($mapped['url']) || (int) ($mapped['id'] ?? 0) > 0) {
                return ['id' => (int) ($mapped['id'] ?? 0), 'url' => (string) ($mapped['url'] ?? '')];
            }
        }

        $trimmed = trim($urlOrSvg);
        if (str_starts_with($trimmed, 'f2e-asset://')) {
            $sha = trim(substr($trimmed, 12));
            if ($sha !== '') {
                if (isset($attachmentMap[$sha])) {
                    return [
                        'id' => (int) ($attachmentMap[$sha]['id'] ?? 0),
                        'url' => (string) ($attachmentMap[$sha]['url'] ?? ''),
                    ];
                }
                $found = $this->assets->findBySha256($sha);
                if ($found !== null) {
                    return $found;
                }
            }
            return null;
        }

        if (str_starts_with($trimmed, 'data:image/') || str_contains($trimmed, '<svg')) {
            $cacheKey = hash('sha256', $trimmed);
            if (isset($this->dataUriCache[$cacheKey])) {
                return $this->dataUriCache[$cacheKey];
            }
            $mime = str_starts_with($trimmed, 'data:image/') ? $this->extractDataUriMime($trimmed) : 'image/svg+xml';
            $stored = $this->assets->storeBase64Asset($explicitSha ?? '', $trimmed, $mime, $title);
            if ($stored !== null && (int) ($stored['id'] ?? 0) > 0 && !empty($stored['url'])) {
                return $this->dataUriCache[$cacheKey] = [
                    'id' => (int) $stored['id'],
                    'url' => (string) $stored['url'],
                ];
            }
            if ($stored === null) {
                $errors[] = [
                    'title' => $title,
                    'sha256' => $explicitSha ?? '',
                    'message' => $this->assets->getLastError() ?: 'Failed to hydrate inline asset.',
                ];
            }
            return null;
        }

        if ($trimmed === '' && $explicitSha !== null && $explicitSha !== '') {
            $found = $this->assets->findBySha256($explicitSha);
            if ($found !== null) {
                return $found;
            }
        }

        return null;
    }

    /**
     * @param array<string,mixed>|null $irNode
     * @return array{sha:string,assetId:string,fallback:string}
     */
    private function extractIrMediaHint(?array $irNode, bool $preferSvg = false): array
    {
        if (!is_array($irNode)) {
            return ['sha' => '', 'assetId' => '', 'fallback' => ''];
        }
        $order = $preferSvg ? ['svg', 'image', 'raster', 'style'] : ['image', 'raster', 'style', 'svg'];
        foreach ($order as $src) {
            if ($src === 'style') {
                $bgRef = (string) ($irNode['style']['backgroundImage'] ?? '');
                $bgData = (string) ($irNode['style']['backgroundImageDataUri'] ?? '');
                $isSha = preg_match('/^[a-f0-9]{64}$/i', $bgRef) === 1;
                if ($isSha || $bgData !== '' || str_starts_with($bgRef, 'data:image/')) {
                    return [
                        'sha' => $isSha ? strtolower($bgRef) : '',
                        'assetId' => '',
                        'fallback' => $bgData !== '' ? $bgData : (str_starts_with($bgRef, 'data:image/') ? $bgRef : ''),
                    ];
                }
                continue;
            }
            $slot = $irNode[$src] ?? null;
            if (!is_array($slot)) {
                continue;
            }
            $sha = trim((string) ($slot['sha256'] ?? ''));
            $assetId = trim((string) ($slot['assetId'] ?? ''));
            $fallback = (string) ($slot['dataUri'] ?? ($src === 'svg' ? ($slot['markup'] ?? '') : ''));
            if ($sha !== '' || $assetId !== '' || $fallback !== '') {
                return ['sha' => $sha, 'assetId' => $assetId, 'fallback' => $fallback];
            }
        }
        return ['sha' => '', 'assetId' => '', 'fallback' => ''];
    }

    /**
     * Hydrates a v4 `Image_Prop_Type` (either Elementor 4.4.1 `value.src.value` or F2E flat `value.url`/`value.id`).
     *
     * @param array<string,mixed> $imageProp
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @param list<array<string,mixed>> $errors
     * @param array<string,array{id:int,url:string}> $assetLookupById
     * @param array<string,mixed>|null $irNode
     * @return array<string,mixed>
     */
    private function hydrateV4ImageProp(
        array $imageProp,
        string $title,
        array $attachmentMap,
        array &$errors,
        array $assetLookupById,
        ?array $irNode = null
    ): array {
        if (!isset($imageProp['value']) || !is_array($imageProp['value'])) {
            return $imageProp;
        }
        $hint = $this->extractIrMediaHint($irNode, false);

        // Official Elementor 4.4.1 schema: value.src.value.{id, url}
        if (isset($imageProp['value']['src']['value']) && is_array($imageProp['value']['src']['value'])) {
            $srcVal = $imageProp['value']['src']['value'];
            $rawUrl = is_array($srcVal['url'] ?? null)
                ? (string) ($srcVal['url']['value'] ?? '')
                : (string) ($srcVal['url'] ?? '');
            $existingId = is_array($srcVal['id'] ?? null)
                ? (int) ($srcVal['id']['value'] ?? 0)
                : (int) ($srcVal['id'] ?? 0);
            $explicitSha = (string) ($srcVal['sha256'] ?? $hint['sha']);
            $targetInput = $rawUrl !== '' ? $rawUrl : ($existingId <= 0 ? $hint['fallback'] : '');
            $hydrated = $this->hydrateMediaValue($targetInput, $title, $attachmentMap, $explicitSha !== '' ? $explicitSha : null, $errors, $hint['assetId'] !== '' ? $hint['assetId'] : null, $assetLookupById);
            if ($hydrated !== null && $hydrated['id'] > 0) {
                $imageProp['value']['src']['value']['id'] = ['$$type' => 'image-attachment-id', 'value' => $hydrated['id']];
                // Elementor 4.4.1 Image_Src_Prop_Type::validate_value enforces ($has_id xor $has_url)
                $imageProp['value']['src']['value']['url'] = null;
            }
            return $imageProp;
        }

        // F2E flat v4 schema: value.{id, url}
        $rawUrl = (string) ($imageProp['value']['url'] ?? '');
        $existingId = (int) ($imageProp['value']['id'] ?? 0);
        $explicitSha = (string) ($imageProp['value']['sha256'] ?? $hint['sha']);
        $targetInput = $rawUrl !== '' ? $rawUrl : ($existingId <= 0 ? $hint['fallback'] : '');
        $hydrated = $this->hydrateMediaValue($targetInput, $title, $attachmentMap, $explicitSha !== '' ? $explicitSha : null, $errors, $hint['assetId'] !== '' ? $hint['assetId'] : null, $assetLookupById);
        if ($hydrated !== null) {
            $imageProp['value']['id'] = $hydrated['id'];
            $imageProp['value']['url'] = $hydrated['url'];
        }
        return $imageProp;
    }

    /**
     * Walks compiled Elementor elements and converts any embedded `data:image/...`, `f2e-asset://`,
     * inline `<svg>`, or `$attachmentMap`-resolved assets into deduplicated WordPress Media Library `{id, url}` attachments.
     *
     * @param list<array<string,mixed>> $elements
     * @param array<string,array{id:int,url:string}> $attachmentMap
     * @param array<string,array<string,mixed>> $nodeLookup
     * @param list<array<string,mixed>> $errors
     * @param array<string,array{id:int,url:string}> $assetLookupById
     * @return list<array<string,mixed>>
     */
    private function hydrateCompiledElementAssets(
        array $elements,
        string $defaultTitle = 'Figma Asset',
        array $attachmentMap = [],
        array $nodeLookup = [],
        array &$errors = [],
        array $assetLookupById = []
    ): array {
        $mediaKeys = [
            'image',
            'background_image',
            '_background_image',
            'background_overlay_image',
            'background_hover_image',
            '_background_hover_image',
            'background_overlay_hover_image',
            'background_a_image',
            'background_b_image',
            'custom_image',
            'bg_image',
            'testimonial_image',
            'image_overlay',
            'fallback_image',
            'poster',
        ];
        $galleryKeys = ['gallery', 'wp_gallery', 'carousel'];
        $repeaterKeys = ['slides', 'icon_list', 'features_list', 'social_icon_list', 'tabs', 'items'];

        foreach ($elements as $i => $el) {
            if (!is_array($el)) {
                continue;
            }
            $settings = is_array($el['settings'] ?? null) ? $el['settings'] : [];
            $elTitle = (string) ($settings['_title'] ?? $defaultTitle);
            $f2eId = (string) ($settings['_f2e_node_id'] ?? '');
            $irNode = ($f2eId !== '' && isset($nodeLookup[$f2eId])) ? $nodeLookup[$f2eId] : null;
            $irHint = $this->extractIrMediaHint($irNode, ($el['widgetType'] ?? '') === 'e-svg');

            // 1. Direct v3/Pro media keys
            foreach ($mediaKeys as $mediaKey) {
                if ($mediaKey === 'image' && isset($settings['image']['$$type']) && $settings['image']['$$type'] === 'image') {
                    continue; // handled in v4 block below
                }
                if (isset($settings[$mediaKey]) && is_array($settings[$mediaKey])) {
                    $url = (string) ($settings[$mediaKey]['url'] ?? '');
                    $existingId = (int) ($settings[$mediaKey]['id'] ?? 0);
                    $explicitSha = (string) ($settings[$mediaKey]['sha256'] ?? '');
                    if ($explicitSha === '' && $existingId <= 0 && ($url === '' || str_starts_with($url, 'data:image/'))) {
                        $explicitSha = ($mediaKey === 'background_image' || $mediaKey === '_background_image')
                            ? $this->extractIrMediaHint($irNode, false)['sha']
                            : $irHint['sha'];
                    }
                    $targetInput = $url !== '' ? $url : ($existingId <= 0 ? $irHint['fallback'] : '');
                    if ($targetInput !== '' || $explicitSha !== '' || ($existingId <= 0 && $irHint['assetId'] !== '')) {
                        $hydrated = $this->hydrateMediaValue(
                            $targetInput,
                            $elTitle,
                            $attachmentMap,
                            $explicitSha !== '' ? $explicitSha : null,
                            $errors,
                            $irHint['assetId'] !== '' ? $irHint['assetId'] : null,
                            $assetLookupById
                        );
                        if ($hydrated !== null) {
                            $settings[$mediaKey] = ['id' => $hydrated['id'], 'url' => $hydrated['url']];
                        }
                    }
                }
            }

            // 2. Gallery & carousel arrays (gallery, wp_gallery, carousel)
            foreach ($galleryKeys as $gKey) {
                if (!empty($settings[$gKey]) && is_array($settings[$gKey])) {
                    foreach ($settings[$gKey] as $itemIdx => $item) {
                        if (!is_array($item)) {
                            continue;
                        }
                        $url = (string) ($item['url'] ?? '');
                        $explicitSha = (string) ($item['sha256'] ?? '');
                        $hydrated = $this->hydrateMediaValue($url, $elTitle, $attachmentMap, $explicitSha !== '' ? $explicitSha : null, $errors);
                        if ($hydrated !== null) {
                            $settings[$gKey][$itemIdx]['id'] = $hydrated['id'];
                            $settings[$gKey][$itemIdx]['url'] = $hydrated['url'];
                        }
                    }
                }
            }

            // 3. Repeater lists (slides, icon_list, features_list, social_icon_list, tabs, items)
            foreach ($repeaterKeys as $listKey) {
                if (!empty($settings[$listKey]) && is_array($settings[$listKey])) {
                    foreach ($settings[$listKey] as $itemIdx => $item) {
                        if (!is_array($item)) {
                            continue;
                        }
                        if (isset($item['url']) && is_string($item['url'])) {
                            $hydrated = $this->hydrateMediaValue($item['url'], $elTitle, $attachmentMap, isset($item['sha256']) ? (string) $item['sha256'] : null, $errors);
                            if ($hydrated !== null) {
                                $settings[$listKey][$itemIdx]['id'] = $hydrated['id'];
                                $settings[$listKey][$itemIdx]['url'] = $hydrated['url'];
                            }
                        }
                        foreach (['image', 'background_image', 'bg_image'] as $subMediaKey) {
                            if (isset($item[$subMediaKey]) && is_array($item[$subMediaKey])) {
                                $subUrl = (string) ($item[$subMediaKey]['url'] ?? '');
                                $subSha = (string) ($item[$subMediaKey]['sha256'] ?? '');
                                $hydrated = $this->hydrateMediaValue($subUrl, $elTitle, $attachmentMap, $subSha !== '' ? $subSha : null, $errors);
                                if ($hydrated !== null) {
                                    $settings[$listKey][$itemIdx][$subMediaKey] = ['id' => $hydrated['id'], 'url' => $hydrated['url']];
                                }
                            }
                        }
                        foreach (['selected_icon', 'social_icon'] as $iconKey) {
                            if (isset($item[$iconKey]) && is_array($item[$iconKey]) && ($item[$iconKey]['library'] ?? '') === 'svg') {
                                $iconVal = $item[$iconKey]['value'] ?? null;
                                if (is_string($iconVal)) {
                                    $hydrated = $this->hydrateMediaValue($iconVal, $elTitle, $attachmentMap, null, $errors);
                                    if ($hydrated !== null) {
                                        $settings[$listKey][$itemIdx][$iconKey]['value'] = ['id' => $hydrated['id'], 'url' => $hydrated['url']];
                                    }
                                } elseif (is_array($iconVal) && isset($iconVal['url'])) {
                                    $hydrated = $this->hydrateMediaValue((string) $iconVal['url'], $elTitle, $attachmentMap, isset($iconVal['sha256']) ? (string) $iconVal['sha256'] : null, $errors);
                                    if ($hydrated !== null) {
                                        $settings[$listKey][$itemIdx][$iconKey]['value'] = ['id' => $hydrated['id'], 'url' => $hydrated['url']];
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 4. Top-level selected_icon with library === 'svg'
            if (isset($settings['selected_icon']) && is_array($settings['selected_icon']) && ($settings['selected_icon']['library'] ?? '') === 'svg') {
                $iconVal = $settings['selected_icon']['value'] ?? null;
                if (is_string($iconVal)) {
                    $hydrated = $this->hydrateMediaValue($iconVal, $elTitle, $attachmentMap, $irHint['sha'] !== '' ? $irHint['sha'] : null, $errors);
                    if ($hydrated !== null) {
                        $settings['selected_icon']['value'] = ['id' => $hydrated['id'], 'url' => $hydrated['url']];
                    }
                } elseif (is_array($iconVal)) {
                    $iconUrl = (string) ($iconVal['url'] ?? '');
                    $iconSha = (string) ($iconVal['sha256'] ?? $irHint['sha']);
                    $targetInput = $iconUrl !== '' ? $iconUrl : ((int) ($iconVal['id'] ?? 0) <= 0 ? $irHint['fallback'] : '');
                    $hydrated = $this->hydrateMediaValue($targetInput, $elTitle, $attachmentMap, $iconSha !== '' ? $iconSha : null, $errors, $irHint['assetId'] !== '' ? $irHint['assetId'] : null, $assetLookupById);
                    if ($hydrated !== null) {
                        $settings['selected_icon']['value'] = ['id' => $hydrated['id'], 'url' => $hydrated['url']];
                    }
                }
            }

            // 5. Elementor v4 e-image (both F2E flat schema and Elementor 4.4.1 Image_Prop_Type)
            if (isset($settings['image']) && is_array($settings['image']) && ($settings['image']['$$type'] ?? '') === 'image') {
                $settings['image'] = $this->hydrateV4ImageProp($settings['image'], $elTitle, $attachmentMap, $errors, $assetLookupById, $irNode);
            }

            // 6. Elementor v4 e-svg (settings.svg or IR svg node fallback)
            if (isset($settings['svg']) && is_array($settings['svg'])) {
                $svgHint = $this->extractIrMediaHint($irNode, true);
                if (isset($settings['svg']['value']) && is_array($settings['svg']['value'])) {
                    $svgVal = $settings['svg']['value'];
                    if (is_array($svgVal['url'] ?? null) && ($svgVal['url']['$$type'] ?? '') === 'url') {
                        $rawUrl = (string) ($svgVal['url']['value'] ?? '');
                        $existingId = is_array($svgVal['id'] ?? null) ? (int) ($svgVal['id']['value'] ?? 0) : (int) ($svgVal['id'] ?? 0);
                        $targetInput = $rawUrl !== '' ? $rawUrl : ($existingId <= 0 ? $svgHint['fallback'] : '');
                        $hydrated = $this->hydrateMediaValue($targetInput, $elTitle, $attachmentMap, $svgHint['sha'] !== '' ? $svgHint['sha'] : null, $errors, $svgHint['assetId'] !== '' ? $svgHint['assetId'] : null, $assetLookupById);
                        if ($hydrated !== null) {
                            $settings['svg']['value']['id'] = ['$$type' => 'image-attachment-id', 'value' => $hydrated['id']];
                            $settings['svg']['value']['url'] = ['$$type' => 'url', 'value' => $hydrated['url']];
                        }
                    } else {
                        $rawUrl = (string) ($svgVal['url'] ?? $svgVal['markup'] ?? $svgVal['html'] ?? '');
                        $existingId = (int) ($svgVal['id'] ?? 0);
                        $targetInput = $rawUrl !== '' ? $rawUrl : ($existingId <= 0 ? $svgHint['fallback'] : '');
                        $hydrated = $this->hydrateMediaValue($targetInput, $elTitle, $attachmentMap, $svgHint['sha'] !== '' ? $svgHint['sha'] : null, $errors, $svgHint['assetId'] !== '' ? $svgHint['assetId'] : null, $assetLookupById);
                        if ($hydrated !== null) {
                            $settings['svg']['value']['id'] = $hydrated['id'];
                            $settings['svg']['value']['url'] = $hydrated['url'];
                        }
                    }
                } else {
                    $rawUrl = (string) ($settings['svg']['url'] ?? $settings['svg']['markup'] ?? $settings['svg']['html'] ?? '');
                    $existingId = (int) ($settings['svg']['id'] ?? 0);
                    $targetInput = $rawUrl !== '' ? $rawUrl : ($existingId <= 0 ? $svgHint['fallback'] : '');
                    $hydrated = $this->hydrateMediaValue($targetInput, $elTitle, $attachmentMap, $svgHint['sha'] !== '' ? $svgHint['sha'] : null, $errors, $svgHint['assetId'] !== '' ? $svgHint['assetId'] : null, $assetLookupById);
                    if ($hydrated !== null) {
                        $settings['svg']['id'] = $hydrated['id'];
                        $settings['svg']['url'] = $hydrated['url'];
                    }
                }
            } elseif (($el['widgetType'] ?? '') === 'e-svg' && $irNode !== null) {
                $svgHint = $this->extractIrMediaHint($irNode, true);
                if ($svgHint['sha'] !== '' || $svgHint['assetId'] !== '' || $svgHint['fallback'] !== '') {
                    $hydrated = $this->hydrateMediaValue($svgHint['fallback'], $elTitle, $attachmentMap, $svgHint['sha'] !== '' ? $svgHint['sha'] : null, $errors, $svgHint['assetId'] !== '' ? $svgHint['assetId'] : null, $assetLookupById);
                    if ($hydrated !== null) {
                        $settings['svg'] = [
                            '$$type' => 'svg-src',
                            'value' => [
                                'id' => ['$$type' => 'image-attachment-id', 'value' => $hydrated['id']],
                                'url' => ['$$type' => 'url', 'value' => $hydrated['url']],
                            ],
                        ];
                    }
                }
            }

            // 7. Elementor v4 style backgrounds (`styles.*.variants[].props.background` and `props.backgroundImage`)
            if (!empty($el['styles']) && is_array($el['styles'])) {
                foreach ($el['styles'] as $classId => $styleDef) {
                    if (!is_array($styleDef) || empty($styleDef['variants']) || !is_array($styleDef['variants'])) {
                        continue;
                    }
                    foreach ($styleDef['variants'] as $vIdx => $variant) {
                        if (!is_array($variant) || empty($variant['props']) || !is_array($variant['props'])) {
                            continue;
                        }
                        $props = $variant['props'];
                        if (isset($props['background']) && is_array($props['background']) && ($props['background']['$$type'] ?? '') === 'background') {
                            $overlays = $props['background']['value']['background-overlay']['value'] ?? null;
                            if (is_array($overlays)) {
                                foreach ($overlays as $oIdx => $overlay) {
                                    if (is_array($overlay) && ($overlay['$$type'] ?? '') === 'background-image-overlay' && isset($overlay['value']['image']) && is_array($overlay['value']['image'])) {
                                        $props['background']['value']['background-overlay']['value'][$oIdx]['value']['image'] =
                                            $this->hydrateV4ImageProp($overlay['value']['image'], $elTitle, $attachmentMap, $errors, $assetLookupById, $irNode);
                                    }
                                }
                            }
                        }
                        if (isset($props['backgroundImage']) && is_array($props['backgroundImage'])) {
                            $bgType = $props['backgroundImage']['$$type'] ?? '';
                            if ($bgType === 'image') {
                                $props['backgroundImage'] = $this->hydrateV4ImageProp($props['backgroundImage'], $elTitle, $attachmentMap, $errors, $assetLookupById, $irNode);
                            } elseif ($bgType === 'url' && is_string($props['backgroundImage']['value'] ?? null)) {
                                $hydrated = $this->hydrateMediaValue((string) $props['backgroundImage']['value'], $elTitle, $attachmentMap, $irHint['sha'] !== '' ? $irHint['sha'] : null, $errors);
                                if ($hydrated !== null) {
                                    $props['backgroundImage']['value'] = $hydrated['url'];
                                }
                            }
                        }
                        $el['styles'][$classId]['variants'][$vIdx]['props'] = $props;
                    }
                }
            }

            $el['settings'] = $settings;
            if (!empty($el['elements']) && is_array($el['elements'])) {
                $el['elements'] = $this->hydrateCompiledElementAssets($el['elements'], $defaultTitle, $attachmentMap, $nodeLookup, $errors, $assetLookupById);
            }
            $elements[$i] = $el;
        }
        return $elements;
    }

    /**
     * Recursively sanitizes inline SVG/HTML widget payloads (`settings.html`, `editor`, `title`, `custom_css`)
     * to prevent Stored XSS when importing untrusted Figma files or payloads from non-admin users.
     *
     * @param list<array<string,mixed>> $elements
     * @return list<array<string,mixed>>
     */
    private function sanitizeCompiledElementHtml(array $elements): array
    {
        $allowUnfiltered = function_exists('current_user_can') && current_user_can('unfiltered_html');
        foreach ($elements as $i => $el) {
            if (!is_array($el)) {
                continue;
            }
            $settings = is_array($el['settings'] ?? null) ? $el['settings'] : [];
            if (isset($settings['html']) && is_string($settings['html']) && $settings['html'] !== '') {
                $html = $settings['html'];
                // Always sanitize embedded <svg> blocks via AssetStore::sanitizeSvg()
                $html = preg_replace_callback('/<svg\b[\s\S]*?<\/svg>/i', static function (array $m): string {
                    return AssetStore::sanitizeSvg($m[0]);
                }, $html) ?? $html;

                if (!$allowUnfiltered) {
                    $dangerousTags = 'script|iframe|object|embed|form|applet|meta|link|base';
                    $html = preg_replace('/<(' . $dangerousTags . ')\b[^>]*>[\s\S]*?<\/\1>/i', '', $html) ?? $html;
                    $html = preg_replace('/<(' . $dangerousTags . ')\b[^>]*\/?>/i', '', $html) ?? $html;
                    $html = preg_replace('/\son[a-z0-9_]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html) ?? $html;
                    $html = preg_replace('/(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i', '', $html) ?? $html;
                }
                $settings['html'] = $html;
            }

            if (!$allowUnfiltered) {
                foreach (['editor', 'title'] as $richKey) {
                    if (isset($settings[$richKey]) && is_string($settings[$richKey]) && $settings[$richKey] !== '') {
                        $val = $settings[$richKey];
                        if (function_exists('wp_kses_post')) {
                            $val = wp_kses_post($val);
                        } else {
                            $dangerousTags = 'script|iframe|object|embed|form|applet|meta|link|base';
                            $val = preg_replace('/<(' . $dangerousTags . ')\b[^>]*>[\s\S]*?<\/\1>/i', '', $val) ?? $val;
                            $val = preg_replace('/<(' . $dangerousTags . ')\b[^>]*\/?>/i', '', $val) ?? $val;
                            $val = preg_replace('/\son[a-z0-9_]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $val) ?? $val;
                            $val = preg_replace('/(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i', '', $val) ?? $val;
                        }
                        $settings[$richKey] = $val;
                    }
                }
            }

            if (isset($settings['custom_css']) && is_string($settings['custom_css']) && $settings['custom_css'] !== '') {
                $settings['custom_css'] = preg_replace('/<\s*\/\s*style\b[^>]*>/i', '', $settings['custom_css']) ?? $settings['custom_css'];
            }

            $el['settings'] = $settings;
            if (!empty($el['elements']) && is_array($el['elements'])) {
                $el['elements'] = $this->sanitizeCompiledElementHtml($el['elements']);
            }
            $elements[$i] = $el;
        }
        return $elements;
    }
}
