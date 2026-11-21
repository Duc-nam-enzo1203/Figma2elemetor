<?php

declare(strict_types=1);

namespace F2EBridge\Media;

/**
 * SHA-256 Deduplicated Media Store & SVG Sanitizer.
 * - Prevents duplicate uploads when re-syncing a Figma frame multiple times.
 * - Sanitizes SVG markup (strips <script>, event handlers, foreignObject, javascript: URIs).
 */
final class AssetStore
{
    private const OPTION_PREFIX = 'f2e_asset_sha256_';

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
        if (!function_exists('get_option')) {
            return null;
        }
        $cached = get_option(self::OPTION_PREFIX . $cleanHash, null);
        if (is_array($cached) && !empty($cached['id'])) {
            $postId = (int) $cached['id'];
            if (function_exists('get_post') && get_post($postId) !== null) {
                $url = !empty($cached['url']) ? (string) $cached['url'] : (string) wp_get_attachment_url($postId);
                return ['id' => $postId, 'url' => $url];
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
            return [
                'id' => 0,
                'url' => 'data:' . $mime . ';base64,' . base64_encode($bytes),
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
        update_option(self::OPTION_PREFIX . $cleanHash, ['id' => $attachmentId, 'url' => $url], false);

        return ['id' => $attachmentId, 'url' => $url, 'reused' => false];
    }

    /**
     * Sanitizes raw SVG markup so it can be safely embedded inline or uploaded.
     */
    public static function sanitizeSvg(string $svg): string
    {
        $clean = trim($svg);
        if ($clean === '' || !str_contains($clean, '<svg')) {
            return '';
        }
        // Remove XML/DOCTYPE headers, <script>, <foreignObject>, <iframe>, <object>, <embed>
        $clean = preg_replace('/<\?xml.*?\?>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<!DOCTYPE.*?>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<(script|foreignObject|iframe|object|embed)\b[^>]*>.*?<\/\1>/is', '', $clean) ?? $clean;
        $clean = preg_replace('/<(script|foreignObject|iframe|object|embed)\b[^>]*\/?>/is', '', $clean) ?? $clean;
        // Strip on* event attributes (onclick, onload, onerror, etc.)
        $clean = preg_replace('/\s+on[a-z]+\s*=\s*(["\']).*?\1/is', '', $clean) ?? $clean;
        $clean = preg_replace('/\s+on[a-z]+\s*=\s*[^\s>]+/is', '', $clean) ?? $clean;
        // Strip javascript: / data:text/html URIs
        $clean = preg_replace('/(href|xlink:href)\s*=\s*(["\'])\s*(javascript:|data:text\/html).*?\2/is', '', $clean) ?? $clean;

        return trim($clean);
    }
}
