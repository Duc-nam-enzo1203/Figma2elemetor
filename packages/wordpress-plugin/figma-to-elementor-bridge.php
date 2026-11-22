<?php
/**
 * Plugin Name:       F2E Bridge — Figma to Elementor (Free & Pro)
 * Plugin URI:        https://github.com/figma-to-elementor-bridge
 * Description:       Self-hosted bridge to convert Figma designs into Elementor v3 (Flexbox/Grid + Pro Widgets) and v4 (Atomic Widgets) with SHA-256 media deduplication, Global Design System sync, and Incremental Re-sync.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            F2E Bridge
 * License:           GPL-2.0-or-later
 * Text Domain:       f2e-bridge
 */

declare(strict_types=1);

namespace F2EBridge;

if (!defined('ABSPATH')) {
    exit;
}

define('F2E_BRIDGE_VERSION', '1.0.0');
define('F2E_BRIDGE_PATH', plugin_dir_path(__FILE__));
define('F2E_BRIDGE_URL', plugin_dir_url(__FILE__));

// Zero-Composer PSR-4 Autoloader for namespace F2EBridge\
spl_autoload_register(static function (string $class): void {
    $prefix = 'F2EBridge\\';
    if (strncmp($prefix, $class, strlen($prefix)) !== 0) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $file = F2E_BRIDGE_PATH . 'src/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($file)) {
        require_once $file;
    }
});

final class Plugin
{
    private static ?self $instance = null;

    public static function instance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function boot(): void
    {
        $cors = new Api\CorsPolicy();
        $cors->register();

        $rest = new Api\RestController();
        add_action('rest_api_init', [$rest, 'registerRoutes']);

        if (is_admin()) {
            add_action('admin_menu', [$this, 'registerAdminMenu']);
            add_action('admin_post_f2e_regenerate_token', [$this, 'handleRegenerateToken']);
            add_action('admin_post_f2e_upload_bundle', [$this, 'handleManualUpload']);
        }

        // Allow SVG & WebP uploads for authorized editors/administrators & automatically sanitize SVG via AssetStore::sanitizeSvg
        add_filter('upload_mimes', static function (array $mimes): array {
            if (!function_exists('current_user_can') || current_user_can('upload_files') || current_user_can('manage_options')) {
                $mimes['svg'] = 'image/svg+xml';
                $mimes['webp'] = 'image/webp';
            }
            return $mimes;
        });

        add_filter('wp_check_filetype_and_ext', static function (array $data, string $file, string $filename, $mimes = null): array {
            if (function_exists('current_user_can') && !current_user_can('upload_files') && !current_user_can('manage_options')) {
                return $data;
            }
            $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
            if ($ext !== 'svg' && $ext !== 'webp') {
                return $data;
            }
            $expectedMime = $ext === 'svg' ? 'image/svg+xml' : 'image/webp';
            if (is_array($mimes) && !isset($mimes[$ext]) && !in_array($expectedMime, $mimes, true)) {
                return $data;
            }

            if ($ext === 'svg') {
                if ($file !== '' && is_file($file)) {
                    $raw = @file_get_contents($file);
                    if (is_string($raw) && Media\AssetStore::sanitizeSvg($raw) !== '') {
                        $data['ext'] = 'svg';
                        $data['type'] = 'image/svg+xml';
                    } else {
                        $data['ext'] = false;
                        $data['type'] = false;
                    }
                }
            } elseif ($ext === 'webp') {
                if ($file !== '' && is_file($file)) {
                    $fh = @fopen($file, 'rb');
                    $head = $fh ? @fread($fh, 16) : '';
                    if ($fh) {
                        @fclose($fh);
                    }
                    if (is_string($head) && strlen($head) >= 12 && substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP') {
                        $data['ext'] = 'webp';
                        $data['type'] = 'image/webp';
                    } else {
                        $data['ext'] = false;
                        $data['type'] = false;
                    }
                }
            }
            return $data;
        }, 10, 4);

        add_filter('wp_handle_upload_prefilter', static function (array $file): array {
            $name = strtolower((string) ($file['name'] ?? ''));
            $type = strtolower((string) ($file['type'] ?? ''));
            $tmpName = (string) ($file['tmp_name'] ?? '');
            if (($type === 'image/svg+xml' || str_ends_with($name, '.svg')) && $tmpName !== '' && is_file($tmpName)) {
                $raw = @file_get_contents($tmpName);
                $sanitized = is_string($raw) ? Media\AssetStore::sanitizeSvg($raw) : '';
                if ($sanitized === '') {
                    $file['error'] = 'Invalid or unsafe SVG file rejected by F2E Bridge SVG Sanitizer.';
                    return $file;
                }
                if (@file_put_contents($tmpName, $sanitized) === false) {
                    $file['error'] = 'Failed to write sanitized SVG.';
                    return $file;
                }
            }
            return $file;
        });

        // Enqueue Elementor Editor integration script
        add_action('elementor/editor/after_enqueue_scripts', [$this, 'enqueueEditorBridge']);
    }

    public function registerAdminMenu(): void
    {
        add_menu_page(
            'F2E Bridge (Figma to Elementor)',
            'F2E Bridge',
            'manage_options',
            'f2e-bridge',
            [$this, 'renderAdminDashboard'],
            'dashicons-layout',
            58
        );
    }

    public function renderAdminDashboard(): void
    {
        $auth = new Security\TokenAuth();
        $token = $auth->getOrCreateToken();
        $siteUrl = home_url();
        require F2E_BRIDGE_PATH . 'admin/views/dashboard.php';
    }

    public function handleRegenerateToken(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        check_admin_referer('f2e_regenerate_token_action');
        $auth = new Security\TokenAuth();
        $auth->regenerateToken();
        wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_msg=token_regenerated'));
        exit;
    }

    public function handleManualUpload(): void
    {
        if (!current_user_can('edit_pages')) {
            wp_die('Unauthorized');
        }
        check_admin_referer('f2e_upload_bundle_action');

        $fileError = isset($_FILES['f2e_file']['error']) ? (int) $_FILES['f2e_file']['error'] : UPLOAD_ERR_NO_FILE;
        if ($fileError === UPLOAD_ERR_INI_SIZE || $fileError === UPLOAD_ERR_FORM_SIZE) {
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=file_too_large'));
            exit;
        }
        if ($fileError === UPLOAD_ERR_NO_FILE) {
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=no_file'));
            exit;
        }
        if ($fileError !== UPLOAD_ERR_OK) {
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=upload_error'));
            exit;
        }
        if (empty($_FILES['f2e_file']['tmp_name']) || !is_uploaded_file($_FILES['f2e_file']['tmp_name'])) {
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=no_file'));
            exit;
        }
        if ((int) ($_FILES['f2e_file']['size'] ?? 0) > 15 * 1024 * 1024) {
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=file_too_large'));
            exit;
        }

        $raw = file_get_contents($_FILES['f2e_file']['tmp_name']);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=invalid_json'));
            exit;
        }

        $rawTargetType = isset($_POST['target_type']) ? sanitize_text_field((string) $_POST['target_type']) : 'page';
        $targetType = in_array($rawTargetType, ['page', 'elementor_library'], true) ? $rawTargetType : 'page';

        $rawTemplateType = isset($_POST['template_type']) ? sanitize_text_field((string) $_POST['template_type']) : 'page';
        $templateType = in_array($rawTemplateType, ['page', 'section', 'container', 'header', 'footer', 'single-post', 'loop-item'], true) ? $rawTemplateType : 'page';

        $targetPostId = isset($_POST['target_post_id']) ? max(0, (int) $_POST['target_post_id']) : 0;

        $rawImportMode = isset($_POST['import_mode']) ? sanitize_text_field((string) $_POST['import_mode']) : 'resync';
        $importMode = in_array($rawImportMode, ['resync', 'append', 'replace'], true) ? $rawImportMode : 'resync';

        $rawElVersion = isset($_POST['elementor_version']) ? sanitize_text_field((string) $_POST['elementor_version']) : 'v3';
        $elVersion = in_array($rawElVersion, ['v3', 'v4'], true) ? $rawElVersion : 'v3';

        $rawPageLayout = isset($_POST['page_layout']) ? sanitize_text_field((string) $_POST['page_layout']) : 'elementor_canvas';
        $pageLayout = in_array($rawPageLayout, ['default', 'elementor_canvas', 'elementor_header_footer', 'elementor_theme'], true) ? $rawPageLayout : 'elementor_canvas';

        if ($targetPostId > 0 && !current_user_can('edit_post', $targetPostId)) {
            wp_die('Unauthorized to edit target post.');
        }

        $rest = new Api\RestController();
        try {
            $result = $rest->processBundleOrTemplateArray($decoded, [
                'targetType' => $targetType,
                'templateType' => $templateType,
                'targetPostId' => $targetPostId,
                'importMode' => $importMode,
                'elementorVersion' => $elVersion,
                'pageLayout' => $pageLayout,
                'postStatus' => 'draft',
            ]);
        } catch (\RuntimeException $e) {
            $errCode = match ((int) $e->getCode()) {
                403 => 'forbidden',
                404 => 'not_found',
                400 => str_contains(strtolower($e->getMessage()), 'no elementor') ? 'empty_payload' : 'invalid_json',
                default => 'save_failed',
            };
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=' . $errCode));
            exit;
        }

        if ((function_exists('is_wp_error') && is_wp_error($result)) || $result instanceof \WP_Error) {
            $wpErrCode = method_exists($result, 'get_error_code') ? (string) $result->get_error_code() : '';
            $errParam = $wpErrCode === 'target_post_not_found' ? 'not_found' : 'save_failed';
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=' . $errParam));
            exit;
        }

        $warningCount = is_array($result['assetErrors'] ?? null) ? count($result['assetErrors']) : 0;
        $redirectUrl = admin_url('admin.php?page=f2e-bridge&f2e_msg=imported&post_id=' . (int) ($result['postId'] ?? 0));
        if ($warningCount > 0) {
            $redirectUrl .= '&asset_warnings=' . $warningCount;
        }
        wp_safe_redirect($redirectUrl);
        exit;
    }

    public function enqueueEditorBridge(): void
    {
        wp_enqueue_script(
            'f2e-editor-bridge',
            F2E_BRIDGE_URL . 'admin/js/editor-bridge.js',
            ['jquery'],
            F2E_BRIDGE_VERSION,
            true
        );
        wp_localize_script('f2e-editor-bridge', 'f2eEditorConfig', [
            'restUrl' => esc_url_raw(rest_url('f2e-bridge/v1')),
            'nonce' => wp_create_nonce('wp_rest'),
        ]);
    }
}

add_action('plugins_loaded', static function (): void {
    Plugin::instance()->boot();
});
