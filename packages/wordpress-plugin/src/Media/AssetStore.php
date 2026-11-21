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

        // 1. Primary lookup via wp_postmeta (`_f2e_sha256`)
        if (function_exists('get_posts')) {
            $matches = get_posts([
                'post_type' => 'attachment',
                'post_status' => 'any',
                'meta_key' => self::META_SHA256,
                'meta_value' => $cleanHash,
                'posts_per_page' => 1,
                'no_found_rows' => true,
            ]);
            if (is_array($matches) && !empty($matches[0])) {
                $first = $matches[0];
                $postId = is_object($first) ? (int) ($first->ID ?? 0) : (int) $first;
                if ($postId > 0) {
                    $url = function_exists('wp_get_attachment_url') ? (string) wp_get_attachment_url($postId) : '';
                    if ($url !== '') {
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
                if (function_exists('get_post') && get_post($postId) !== null) {
                    $url = !empty($cached['url'])
                        ? (string) $cached['url']
                        : (function_exists('wp_get_attachment_url') ? (string) wp_get_attachment_url($postId) : '');
                    if (function_exists('update_post_meta')) {
                        update_post_meta($postId, self::META_SHA256, $cleanHash);
                    }
                    if (function_exists('delete_option')) {
                        delete_option($legacyKey);
                    }
                    return $this->memoryCache[$cleanHash] = ['id' => $postId, 'url' => $url];
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
     * @return array{id:int,url:string,reused:bool}|null
     */
    public function storeBase64Asset(string $sha256, string $base64, string $mime = 'image/png', string $title = 'Figma Asset'): ?array
    {
        $cleanHash = strtolower(trim($sha256));
        if (preg_match('/^[a-f0-9]{64}$/', $cleanHash) === 1) {
            $existing = $this->findBySha256($cleanHash);
            if ($existing !== null) {
                return ['id' => $existing['id'], 'url' => $existing['url'], 'reused' => true];
            }
        }

        // Strip data URI prefix if present
        if (str_contains($base64, ',')) {
            $parts = explode(',', $base64, 2);
            $base64 = $parts[1];
        }

        $bytes = base64_decode($base64, true);
        if (!is_string($bytes) || $bytes === '') {
            return null;
        }

        if ($cleanHash === '' || preg_match('/^[a-f0-9]{64}$/', $cleanHash) !== 1) {
            $cleanHash = hash('sha256', $bytes);
            $existing = $this->findBySha256($cleanHash);
            if ($existing !== null) {
                return ['id' => $existing['id'], 'url' => $existing['url'], 'reused' => true];
            }
        }

        $ext = match (strtolower($mime)) {
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/webp' => 'webp',
            'image/svg+xml' => 'svg',
            default => 'png',
        };

        if ($ext === 'svg') {
            $bytes = self::sanitizeSvg($bytes);
            if ($bytes === '') {
                return null;
            }
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
            ];
        }

        $filename = 'f2e-' . substr($cleanHash, 0, 16) . '.' . $ext;
        $upload = wp_upload_bits($filename, null, $bytes);
        if (!empty($upload['error']) || empty($upload['file'])) {
            return null;
        }

        $attachmentId = (int) wp_insert_attachment([
            'post_mime_type' => $mime,
            'post_title' => sanitize_text_field($title . ' (' . substr($cleanHash, 0, 8) . ')'),
            'post_content' => '',
            'post_status' => 'inherit',
        ], $upload['file']);

        if ($attachmentId <= 0) {
            return null;
        }

        if ($ext !== 'svg' && function_exists('wp_generate_attachment_metadata')) {
            require_once ABSPATH . 'wp-admin/includes/image.php';
            $meta = wp_generate_attachment_metadata($attachmentId, $upload['file']);
            wp_update_attachment_metadata($attachmentId, $meta);
        }

        $url = (string) $upload['url'];
        if (function_exists('update_post_meta')) {
            update_post_meta($attachmentId, self::META_SHA256, $cleanHash);
        }
        $this->memoryCache[$cleanHash] = ['id' => $attachmentId, 'url' => $url];

        return ['id' => $attachmentId, 'url' => $url, 'reused' => false];
    }

    /**
     * Sanitizes raw SVG markup using DOMDocument allowlist + regex defense-in-depth
     * so it can be safely embedded inline or uploaded to the WordPress Media Library.
     */
    public static function sanitizeSvg(string $svg): string
    {
        $clean = trim($svg);
        if ($clean === '' || stripos($clean, '<svg') === false) {
            return '';
        }

        // Pre-pass: strip XML declarations, DOCTYPE/ENTITY declarations, and comments
        $clean = preg_replace('/<\?xml.*?\?>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<!DOCTYPE.*?>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<!ENTITY.*?>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<!--.*?-->/s', '', $clean) ?? $clean;

        // Ensure xmlns:xlink is declared if xlink: attributes are used so DOMDocument::loadXML parses cleanly
        if (str_contains($clean, 'xlink:') && !str_contains($clean, 'xmlns:xlink')) {
            $clean = preg_replace('/<svg\b/i', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"', $clean, 1) ?? $clean;
        }

        // DOMDocument allowlist pass when ext-dom is available
        if (class_exists(\DOMDocument::class)) {
            $dom = new \DOMDocument();
            $prevErrors = libxml_use_internal_errors(true);
            $flags = defined('LIBXML_NONET') ? (LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING) : 0;
            $loaded = @$dom->loadXML($clean, $flags);
            libxml_clear_errors();
            libxml_use_internal_errors($prevErrors);

            if ($loaded && $dom->documentElement !== null) {
                $rootName = $dom->documentElement->localName ?: $dom->documentElement->nodeName;
                if (strtolower((string) $rootName) !== 'svg') {
                    return '';
                }
                self::sanitizeDomNode($dom->documentElement);
                $serialized = $dom->saveXML($dom->documentElement);
                if (is_string($serialized) && $serialized !== '') {
                    $clean = $serialized;
                }
            }
        }

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

                    // Block javascript:, data:text/html, vbscript:, expression() in any attribute (e.g. style, filter, fill)
                    if (
                        str_contains($normalizedVal, 'javascript:') ||
                        str_contains($normalizedVal, 'vbscript:') ||
                        str_contains($normalizedVal, 'data:text/html') ||
                        str_contains($normalizedVal, 'data:image/svg') ||
                        str_contains($normalizedVal, 'expression(') ||
                        str_contains($normalizedVal, '@import')
                    ) {
                        $node->removeAttributeNode($attr);
                        continue;
                    }
                }
            }

            // Sanitize inline <style> tag content
            $localTag = (string) ($node->localName ?: $node->nodeName);
            if (strtolower($localTag) === 'style') {
                $css = (string) $node->textContent;
                $css = preg_replace('/@import\b[^;]*;?/i', '', $css) ?? $css;
                $css = preg_replace('/expression\s*\([^)]*\)/i', '', $css) ?? $css;
                $css = preg_replace('/url\s*\(\s*["\']?\s*(?!#)[^)]+\)/i', 'none', $css) ?? $css;
                $node->textContent = $css;
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
