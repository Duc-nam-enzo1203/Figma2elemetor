<?php

declare(strict_types=1);

namespace F2EBridge\Media;

/**
 * SHA-256 Deduplicated Media Store & Hardened SVG Sanitizer.
 * - Stores SHA-256 hashes in `wp_postmeta` (`_f2e_sha256`) so deleting an attachment
 *   automatically cleans up metadata without bloating `wp_options` (with automatic
 *   migration from legacy `f2e_asset_sha256_*` options).
 * - Sanitizes SVG markup using DOMDocument allowlist + regex defense-in-depth
 *   (strips <script>, <foreignObject>, SMIL <animate>/<set>, event handlers, external hrefs, and dangerous CSS).
 */
final class AssetStore
{
    public const META_SHA256 = '_f2e_sha256';
    public const MAX_ASSET_BYTES = 10485760; // 10 MB safety cap per asset
    private const LEGACY_OPTION_PREFIX = 'f2e_asset_sha256_';

    /** @var array<string, bool> */
    private const ALLOWED_SVG_TAGS = [
        'svg' => true,
        'a' => true,
        'g' => true,
        'path' => true,
        'rect' => true,
        'circle' => true,
        'ellipse' => true,
        'line' => true,
        'polyline' => true,
        'polygon' => true,
        'text' => true,
        'tspan' => true,
        'textPath' => true,
        'defs' => true,
        'linearGradient' => true,
        'radialGradient' => true,
        'stop' => true,
        'clipPath' => true,
        'mask' => true,
        'pattern' => true,
        'symbol' => true,
        'use' => true,
        'title' => true,
        'desc' => true,
        'style' => true,
        'filter' => true,
        'feBlend' => true,
        'feColorMatrix' => true,
        'feComponentTransfer' => true,
        'feComposite' => true,
        'feConvolveMatrix' => true,
        'feDiffuseLighting' => true,
        'feDisplacementMap' => true,
        'feDropShadow' => true,
        'feFlood' => true,
        'feFuncA' => true,
        'feFuncB' => true,
        'feFuncG' => true,
        'feFuncR' => true,
        'feGaussianBlur' => true,
        'feMerge' => true,
        'feMergeNode' => true,
        'feMorphology' => true,
        'feOffset' => true,
        'feSpecularLighting' => true,
        'feTile' => true,
        'feTurbulence' => true,
    ];

    /** @var array<string, array{id:int,url:string}> */
    private array $memoryCache = [];
    private string $lastError = '';

    public function getLastError(): string
    {
        return $this->lastError;
    }

    /**
     * Detects real raster image MIME type directly from binary magic bytes
     * (handles VP8/VP8L/VP8X WebP even on PHP builds where getimagesizefromstring lacks WebP support).
     */
    private static function detectRasterMime(string $bytes): string
    {
        $len = strlen($bytes);
        if ($len >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') {
            return 'image/webp';
        }
        if ($len >= 8 && substr($bytes, 0, 8) === "\x89PNG\r\n\x1a\n") {
            return 'image/png';
        }
        if ($len >= 3 && substr($bytes, 0, 3) === "\xFF\xD8\xFF") {
            return 'image/jpeg';
        }
        if ($len >= 6 && (str_starts_with($bytes, 'GIF87a') || str_starts_with($bytes, 'GIF89a'))) {
            return 'image/gif';
        }
        if (function_exists('getimagesizefromstring')) {
            $imgInfo = @getimagesizefromstring($bytes);
            if (is_array($imgInfo) && !empty($imgInfo['mime'])) {
                $m = strtolower((string) $imgInfo['mime']);
                if (in_array($m, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], true)) {
                    return $m;
                }
            }
        }
        return '';
    }

    /**
     * Normalizes attachment URL scheme to match home_url() (e.g. https vs http).
     */
    private static function normalizeAttachmentUrl(string $url): string
    {
        if ($url === '' || str_starts_with($url, 'data:')) {
            return $url;
        }
        if (function_exists('home_url')) {
            $home = (string) home_url();
            $homeScheme = parse_url($home, PHP_URL_SCHEME);
            $isSsl = ($homeScheme === 'https') || (function_exists('is_ssl') && is_ssl());
            $targetScheme = $isSsl ? 'https' : ($homeScheme === 'http' ? 'http' : null);
            if ($targetScheme !== null) {
                if (function_exists('set_url_scheme')) {
                    return (string) set_url_scheme($url, $targetScheme);
                }
                return (string) preg_replace('#^https?://#i', $targetScheme . '://', $url);
            }
        }
        return $url;
    }

    /**
     * Extracts integer width/height from SVG markup via DOMDocument (attributes with viewBox fallback).
     *
     * @return array{width:int,height:int}
     */
    private static function extractSvgDimensions(string $svgXml): array
    {
        if (!class_exists(\DOMDocument::class) || trim($svgXml) === '') {
            return ['width' => 0, 'height' => 0];
        }
        $dom = new \DOMDocument();
        $prevErrors = libxml_use_internal_errors(true);
        $flags = defined('LIBXML_NONET') ? (LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING) : 0;
        $loaded = @$dom->loadXML($svgXml, $flags);
        libxml_clear_errors();
        libxml_use_internal_errors($prevErrors);
        if (!$loaded || $dom->documentElement === null) {
            return ['width' => 0, 'height' => 0];
        }

        $root = $dom->documentElement;
        $parseDim = static function (string $val): float {
            if (preg_match('/^\s*(\d+(?:\.\d+)?)\s*(?:px|pt)?\s*$/i', $val, $m) === 1) {
                return (float) $m[1];
            }
            return 0.0;
        };

        $w = $parseDim((string) $root->getAttribute('width'));
        $h = $parseDim((string) $root->getAttribute('height'));

        if ($w <= 0.0 || $h <= 0.0) {
            $vb = trim((string) $root->getAttribute('viewBox'));
            if ($vb !== '') {
                $parts = preg_split('/[\s,]+/', $vb);
                if (is_array($parts) && count($parts) === 4 && is_numeric($parts[2]) && is_numeric($parts[3])) {
                    $vbW = (float) $parts[2];
                    $vbH = (float) $parts[3];
                    if ($w <= 0.0 && $vbW > 0.0) {
                        $w = $vbW;
                    }
                    if ($h <= 0.0 && $vbH > 0.0) {
                        $h = $vbH;
                    }
                }
            }
        }

        return [
            'width' => $w > 0.0 ? (int) round($w) : 0,
            'height' => $h > 0.0 ? (int) round($h) : 0,
        ];
    }

    /**
     * Returns an existing attachment `{id, url}` for the given SHA-256 hash if it still exists in WP.
     *
     * @return array{id:int,url:string}|null
     */
    public function findBySha256(string $sha256): ?array
    {
        $cleanHash = strtolower(trim($sha256));
        if (preg_match('/^[a-f0-9]{64}$/', $cleanHash) !== 1) {
            return null;
        }

        if (isset($this->memoryCache[$cleanHash])) {
            return $this->memoryCache[$cleanHash];
        }

        // 1. Primary lookup via wp_postmeta (`_f2e_sha256`), excluding trashed/missing attachments
        if (function_exists('get_posts')) {
            $matches = get_posts([
                'post_type' => 'attachment',
                'post_status' => ['inherit', 'publish', 'private'],
                'meta_key' => self::META_SHA256,
                'meta_value' => $cleanHash,
                'posts_per_page' => 5,
                'no_found_rows' => true,
            ]);
            if (is_array($matches)) {
                foreach ($matches as $match) {
                    $postId = is_object($match) ? (int) ($match->ID ?? 0) : (int) $match;
                    if ($postId <= 0) {
                        continue;
                    }
                    if (function_exists('get_post_status')) {
                        $status = get_post_status($postId);
                        if ($status === 'trash' || $status === false) {
                            continue;
                        }
                    }
                    if (function_exists('get_attached_file')) {
                        $attachedFile = get_attached_file($postId);
                        if (!is_string($attachedFile) || $attachedFile === '' || !is_file($attachedFile)) {
                            continue;
                        }
                    }
                    $url = function_exists('wp_get_attachment_url') ? (string) wp_get_attachment_url($postId) : '';
                    if ($url !== '') {
                        $url = self::normalizeAttachmentUrl($url);
                        return $this->memoryCache[$cleanHash] = ['id' => $postId, 'url' => $url];
                    }
                }
            }
        }

        // 2. Legacy fallback via wp_options (auto-migrates to wp_postmeta if found)
        if (function_exists('get_option')) {
            $legacyKey = self::LEGACY_OPTION_PREFIX . $cleanHash;
            $cached = get_option($legacyKey, null);
            if (is_array($cached) && !empty($cached['id'])) {
                $postId = (int) $cached['id'];
                $post = function_exists('get_post') ? get_post($postId) : null;
                $isValidPost = is_object($post)
                    ? (($post->post_type ?? 'attachment') === 'attachment' && ($post->post_status ?? 'inherit') !== 'trash')
                    : (is_array($post) && ($post['post_type'] ?? 'attachment') === 'attachment' && ($post['post_status'] ?? 'inherit') !== 'trash');
                $hasFile = !function_exists('get_attached_file')
                    || (is_string($f = get_attached_file($postId)) && $f !== '' && is_file($f));

                if ($isValidPost && $hasFile) {
                    $url = !empty($cached['url'])
                        ? (string) $cached['url']
                        : (function_exists('wp_get_attachment_url') ? (string) wp_get_attachment_url($postId) : '');
                    if ($url !== '') {
                        $url = self::normalizeAttachmentUrl($url);
                        if (function_exists('update_post_meta')) {
                            update_post_meta($postId, self::META_SHA256, $cleanHash);
                        }
                        if (function_exists('delete_option')) {
                            delete_option($legacyKey);
                        }
                        return $this->memoryCache[$cleanHash] = ['id' => $postId, 'url' => $url];
                    }
                }
                if (function_exists('delete_option')) {
                    delete_option($legacyKey);
                }
            }
        }

        return null;
    }

    /**
     * Stores a Base64-encoded image or SVG into the WordPress Media Library, deduplicated by SHA-256.
     *
     * @return array{id:int,url:string,reused:bool,sha256:string}|null
     */
    public function storeBase64Asset(string $sha256, string $base64, string $mime = 'image/png', string $title = 'Figma Asset'): ?array
    {
        $this->lastError = '';
        $cleanHash = strtolower(trim($sha256));
        if (preg_match('/^[a-f0-9]{64}$/', $cleanHash) === 1) {
            $existing = $this->findBySha256($cleanHash);
            if ($existing !== null) {
                return ['id' => $existing['id'], 'url' => $existing['url'], 'reused' => true, 'sha256' => $cleanHash];
            }
        }

        $trimmedInput = trim($base64);
        $bytes = null;
        $effectiveMime = strtolower(trim($mime));
        if ($effectiveMime === 'image/jpg') {
            $effectiveMime = 'image/jpeg';
        }

        if (preg_match('/^data:([^,;]+)((?:;[^;,]+)*),(.*)$/is', $trimmedInput, $m) === 1) {
            $dataMime = strtolower(trim($m[1]));
            if ($dataMime === 'image/jpg') {
                $dataMime = 'image/jpeg';
            }
            $allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
            if (!in_array($dataMime, $allowedMimes, true)) {
                $this->lastError = 'Unsupported data URI MIME type: ' . $dataMime;
                return null;
            }
            $effectiveMime = $dataMime;
            $paramsPart = $m[2];
            $payload = $m[3];
            $isBase64Encoded = preg_match('/;\s*base64\s*(?:;|$)/i', $paramsPart) === 1;

            if ($isBase64Encoded) {
                $cleanB64 = preg_replace('/\s+/', '', $payload) ?? $payload;
                $decoded = base64_decode($cleanB64, true);
                if (is_string($decoded) && $decoded !== '') {
                    $bytes = $decoded;
                }
            } elseif ($effectiveMime === 'image/svg+xml') {
                $trimmedPayload = ltrim($payload);
                $decodedSvg = str_starts_with($trimmedPayload, '<') ? $payload : rawurldecode($payload);
                if ($decodedSvg !== '') {
                    $bytes = $decodedSvg;
                }
            } else {
                $this->lastError = 'Non-base64 data URI is only supported for SVG assets';
                return null;
            }
        } else {
            if ($effectiveMime === 'image/svg+xml') {
                $trimmedRaw = ltrim($trimmedInput);
                if (str_starts_with($trimmedRaw, '<svg') || str_starts_with($trimmedRaw, '<?xml')) {
                    $bytes = $trimmedInput;
                } elseif (str_starts_with($trimmedRaw, '%3C') || str_starts_with($trimmedRaw, '%3c')) {
                    $bytes = rawurldecode($trimmedInput);
                } else {
                    $cleanB64 = preg_replace('/\s+/', '', $trimmedInput) ?? $trimmedInput;
                    $decoded = base64_decode($cleanB64, true);
                    if (is_string($decoded) && $decoded !== '') {
                        $bytes = $decoded;
                    }
                }
            } else {
                $cleanB64 = preg_replace('/\s+/', '', $trimmedInput) ?? $trimmedInput;
                $decoded = base64_decode($cleanB64, true);
                if (is_string($decoded) && $decoded !== '') {
                    $bytes = $decoded;
                }
            }
        }

        if (!is_string($bytes) || $bytes === '') {
            $this->lastError = 'Invalid or empty base64 payload';
            return null;
        }
        if (strlen($bytes) > self::MAX_ASSET_BYTES) {
            $this->lastError = 'Asset exceeds 10 MB limit (' . round(strlen($bytes) / 1048576, 1) . ' MB)';
            return null;
        }

        if ($cleanHash === '' || preg_match('/^[a-f0-9]{64}$/', $cleanHash) !== 1) {
            $cleanHash = hash('sha256', $bytes);
            $existing = $this->findBySha256($cleanHash);
            if ($existing !== null) {
                return ['id' => $existing['id'], 'url' => $existing['url'], 'reused' => true, 'sha256' => $cleanHash];
            }
        }

        $mime = $effectiveMime;
        $ext = match ($mime) {
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/svg+xml' => 'svg',
            default => 'png',
        };

        if ($ext === 'svg') {
            $bytes = self::sanitizeSvg($bytes);
            if ($bytes === '') {
                $this->lastError = 'SVG rejected by sanitizer (empty or invalid XML)';
                return null;
            }
        } else {
            // Verify real raster image magic bytes to block polyglot HTML/script uploads
            $detectedMime = self::detectRasterMime($bytes);
            if ($detectedMime === '') {
                $this->lastError = 'Invalid raster image signature for MIME ' . $mime;
                return null;
            }
            $mime = $detectedMime;
            $ext = match ($detectedMime) {
                'image/jpeg' => 'jpg',
                'image/webp' => 'webp',
                'image/gif' => 'gif',
                default => 'png',
            };
        }

        if (!function_exists('wp_upload_bits') || !function_exists('wp_insert_attachment')) {
            $fallback = [
                'id' => 0,
                'url' => 'data:' . $mime . ';base64,' . base64_encode($bytes),
            ];
            $this->memoryCache[$cleanHash] = $fallback;
            return [
                'id' => $fallback['id'],
                'url' => $fallback['url'],
                'reused' => false,
                'sha256' => $cleanHash,
            ];
        }

        $filename = 'f2e-' . substr($cleanHash, 0, 16) . '.' . $ext;
        $upload = wp_upload_bits($filename, null, $bytes);
        if (!empty($upload['error']) || empty($upload['file'])) {
            $this->lastError = 'wp_upload_bits failed for ' . $filename . ': ' . (string) ($upload['error'] ?? 'unknown');
            return null;
        }

        $postTitle = function_exists('sanitize_text_field')
            ? sanitize_text_field($title . ' (' . substr($cleanHash, 0, 8) . ')')
            : trim(strip_tags($title . ' (' . substr($cleanHash, 0, 8) . ')'));

        $attachmentId = (int) wp_insert_attachment([
            'post_mime_type' => $mime,
            'post_title' => $postTitle,
            'post_content' => '',
            'post_status' => 'inherit',
        ], $upload['file']);

        if ($attachmentId <= 0) {
            if (is_file((string) $upload['file'])) {
                @unlink((string) $upload['file']);
            }
            $this->lastError = 'wp_insert_attachment failed for ' . $filename;
            return null;
        }

        if ($ext !== 'svg') {
            if (!function_exists('wp_generate_attachment_metadata') && defined('ABSPATH') && is_file(ABSPATH . 'wp-admin/includes/image.php')) {
                require_once ABSPATH . 'wp-admin/includes/image.php';
            }
            if (function_exists('wp_generate_attachment_metadata') && function_exists('wp_update_attachment_metadata')) {
                $meta = wp_generate_attachment_metadata($attachmentId, $upload['file']);
                if (is_array($meta)) {
                    wp_update_attachment_metadata($attachmentId, $meta);
                }
            }
        } elseif (function_exists('wp_update_attachment_metadata')) {
            $dims = self::extractSvgDimensions($bytes);
            $meta = [
                'file' => function_exists('_wp_relative_upload_path')
                    ? _wp_relative_upload_path($upload['file'])
                    : basename((string) $upload['file']),
                'filesize' => strlen($bytes),
            ];
            if ($dims['width'] > 0 && $dims['height'] > 0) {
                $meta['width'] = $dims['width'];
                $meta['height'] = $dims['height'];
            }
            wp_update_attachment_metadata($attachmentId, $meta);
        }

        $url = self::normalizeAttachmentUrl((string) ($upload['url'] ?? ''));
        if (function_exists('update_post_meta')) {
            update_post_meta($attachmentId, self::META_SHA256, $cleanHash);
        }
        $this->memoryCache[$cleanHash] = ['id' => $attachmentId, 'url' => $url];

        return ['id' => $attachmentId, 'url' => $url, 'reused' => false, 'sha256' => $cleanHash];
    }

    /**
     * Sanitizes raw SVG markup using DOMDocument allowlist (fail-closed) + regex defense-in-depth
     * so it can be safely embedded inline or uploaded to the WordPress Media Library.
     */
    public static function sanitizeSvg(string $svg): string
    {
        if (str_starts_with($svg, "\xEF\xBB\xBF")) {
            $svg = substr($svg, 3);
        }
        $clean = trim($svg);
        if ($clean === '' || stripos($clean, '<svg') === false) {
            return '';
        }

        // Pre-pass: strip XML declarations, DOCTYPE (including internal [<!ENTITY...>] subsets), ENTITY, and comments
        $clean = preg_replace('/<\?xml.*?\?>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<!DOCTYPE[^>\[]*(?:\[[\s\S]*?\])?\s*>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<!ENTITY.*?>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<!--.*?-->/s', '', $clean) ?? $clean;

        // Ensure xmlns:xlink is declared if xlink: attributes are used so DOMDocument::loadXML parses cleanly
        if (str_contains($clean, 'xlink:') && !str_contains($clean, 'xmlns:xlink')) {
            $clean = preg_replace('/<svg\b/i', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"', $clean, 1) ?? $clean;
        }

        // Fail closed if DOMDocument is unavailable or XML fails to parse
        if (!class_exists(\DOMDocument::class)) {
            return '';
        }

        $dom = new \DOMDocument();
        $prevErrors = libxml_use_internal_errors(true);
        $flags = defined('LIBXML_NONET') ? (LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING) : 0;
        $loaded = @$dom->loadXML($clean, $flags);
        libxml_clear_errors();
        libxml_use_internal_errors($prevErrors);

        if (!$loaded || $dom->documentElement === null) {
            return '';
        }

        if ($dom->doctype !== null) {
            $dom->removeChild($dom->doctype);
        }

        $rootName = $dom->documentElement->localName ?: $dom->documentElement->nodeName;
        if (strtolower((string) $rootName) !== 'svg') {
            return '';
        }

        if (!$dom->documentElement->hasAttribute('xmlns')) {
            $dom->documentElement->setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }

        self::sanitizeDomNode($dom->documentElement);
        $serialized = $dom->saveXML($dom->documentElement);
        if (!is_string($serialized) || $serialized === '') {
            return '';
        }
        $clean = $serialized;

        // Post-pass defense-in-depth regex sanitization
        $dangerousTags = 'script|foreignObject|iframe|object|embed|animate|animateTransform|animateMotion|set|audio|video|canvas|applet|meta|link|base';
        $clean = preg_replace('/<(' . $dangerousTags . ')\b[^>]*>.*?<\/\1>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<(' . $dangerousTags . ')\b[^>]*\/?>/is', '', $clean) ?? $clean;
        // Strip on* event attributes (onclick, onload, onerror, onbegin, etc.)
        $clean = preg_replace('/\s+on[a-z0-9_]+\s*=\s*(["\']).*?\1/is', '', $clean) ?? $clean;
        $clean = preg_replace('/\s+on[a-z0-9_]+\s*=\s*[^\s>]+/is', '', $clean) ?? $clean;
        // Strip non-local href / xlink:href URIs (only #fragment IDs allowed in SVG)
        $clean = preg_replace('/\s+(?:xlink:)?href\s*=\s*(["\'])\s*(?!#)[^"\']*\1/is', '', $clean) ?? $clean;

        return trim($clean);
    }

    private static function sanitizeCss(string $css): string
    {
        $clean = preg_replace('/\/\*[\s\S]*?\*\//', '', $css) ?? $css;
        $clean = preg_replace('/@import\b[^;]*(?:;|$)/i', '', $clean) ?? $clean;
        $clean = preg_replace('/expression\s*\([^)]*\)/i', '', $clean) ?? $clean;
        $clean = preg_replace('/(?:behavior|-moz-binding)\s*:[^;]*(?:;|$)/i', '', $clean) ?? $clean;
        $clean = preg_replace('/(?:javascript|vbscript)\s*:|data\s*:\s*(?:text\/html|image\/svg)/i', '', $clean) ?? $clean;
        $clean = preg_replace_callback(
            '/url\s*\(\s*(["\']?)(.*?)\1\s*\)/i',
            static function (array $m): string {
                $target = trim($m[2]);
                return str_starts_with($target, '#') ? $m[0] : 'none';
            },
            $clean
        ) ?? $clean;
        return trim($clean);
    }

    private static function sanitizeDomNode(\DOMNode $node): void
    {
        if ($node instanceof \DOMElement) {
            // Inspect attributes in reverse order so removal is safe
            if ($node->hasAttributes()) {
                $attrs = [];
                foreach ($node->attributes as $attr) {
                    if ($attr instanceof \DOMAttr) {
                        $attrs[] = $attr;
                    }
                }
                foreach ($attrs as $attr) {
                    $attrName = strtolower($attr->nodeName);
                    $localAttrName = strtolower((string) ($attr->localName ?: $attr->nodeName));
                    $rawVal = html_entity_decode($attr->nodeValue ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
                    $normalizedVal = strtolower(preg_replace('/[\x00-\x20]+/', '', $rawVal) ?? '');

                    // Block any event handler (onload, onclick, onbegin, etc.)
                    if (str_starts_with($attrName, 'on') || str_starts_with($localAttrName, 'on')) {
                        $node->removeAttributeNode($attr);
                        continue;
                    }

                    // For href / xlink:href, strictly allow only local #fragment IDs
                    if ($localAttrName === 'href' || $attrName === 'xlink:href') {
                        $trimmedVal = trim($rawVal);
                        if ($trimmedVal === '' || !str_starts_with($trimmedVal, '#')) {
                            $node->removeAttributeNode($attr);
                        }
                        continue;
                    }

                    // Sanitize inline style="..." attributes
                    if ($localAttrName === 'style') {
                        $cleanedStyle = self::sanitizeCss($rawVal);
                        if ($cleanedStyle === '') {
                            $node->removeAttributeNode($attr);
                        } else {
                            $attr->nodeValue = $cleanedStyle;
                        }
                        continue;
                    }

                    // Block javascript:, data:text/html, vbscript:, expression(), behavior:, -moz-binding in any attribute
                    if (
                        str_contains($normalizedVal, 'javascript:') ||
                        str_contains($normalizedVal, 'vbscript:') ||
                        str_contains($normalizedVal, 'data:text/html') ||
                        str_contains($normalizedVal, 'data:image/svg') ||
                        str_contains($normalizedVal, 'expression(') ||
                        str_contains($normalizedVal, '@import') ||
                        str_contains($normalizedVal, 'behavior:') ||
                        str_contains($normalizedVal, '-moz-binding')
                    ) {
                        $node->removeAttributeNode($attr);
                        continue;
                    }

                    // Block external url(...) in presentation attributes (allow only url(#fragment))
                    if (preg_match('/url\s*\(\s*["\']?\s*(?!#)[^)]+\)/i', $rawVal) === 1) {
                        $node->removeAttributeNode($attr);
                        continue;
                    }
                }
            }

            // Sanitize inline <style> tag content
            $localTag = (string) ($node->localName ?: $node->nodeName);
            if (strtolower($localTag) === 'style') {
                $node->textContent = self::sanitizeCss((string) $node->textContent);
            }
        }

        // Recurse over children using a snapshot array so removing disallowed nodes doesn't skip siblings
        $children = [];
        foreach ($node->childNodes as $child) {
            $children[] = $child;
        }

        foreach ($children as $child) {
            if ($child instanceof \DOMElement) {
                $tagName = (string) ($child->localName ?: $child->nodeName);
                // Strip SVG namespace prefix if present
                if (str_contains($tagName, ':')) {
                    $parts = explode(':', $tagName, 2);
                    $tagName = $parts[1];
                }
                if (!isset(self::ALLOWED_SVG_TAGS[$tagName]) && !isset(self::ALLOWED_SVG_TAGS[strtolower($tagName)])) {
                    $node->removeChild($child);
                    continue;
                }
                self::sanitizeDomNode($child);
            } elseif ($child instanceof \DOMComment || $child instanceof \DOMProcessingInstruction) {
                $node->removeChild($child);
            }
        }
    }
}
