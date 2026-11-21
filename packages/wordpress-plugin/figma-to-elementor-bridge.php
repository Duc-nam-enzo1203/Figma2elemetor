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

        // Allow SVG uploads for administrators & F2E authenticated requests
        add_filter('upload_mimes', static function (array $mimes): array {
            $mimes['svg'] = 'image/svg+xml';
            return $mimes;
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
        if (!current_user_can('edit_posts')) {
            wp_die('Unauthorized');
        }
        check_admin_referer('f2e_upload_bundle_action');

        if (empty($_FILES['f2e_file']['tmp_name']) || !is_uploaded_file($_FILES['f2e_file']['tmp_name'])) {
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=no_file'));
            exit;
        }

        $raw = file_get_contents($_FILES['f2e_file']['tmp_name']);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_err=invalid_json'));
            exit;
        }

        $targetType = isset($_POST['target_type']) ? sanitize_text_field((string) $_POST['target_type']) : 'page';
        $templateType = isset($_POST['template_type']) ? sanitize_text_field((string) $_POST['template_type']) : 'page';
        $targetPostId = isset($_POST['target_post_id']) ? (int) $_POST['target_post_id'] : 0;
        $importMode = isset($_POST['import_mode']) ? sanitize_text_field((string) $_POST['import_mode']) : 'resync';
        $elVersion = isset($_POST['elementor_version']) ? sanitize_text_field((string) $_POST['elementor_version']) : 'v3';

        $rest = new Api\RestController();
        $result = $rest->processBundleOrTemplateArray($decoded, [
            'targetType' => $targetType,
            'templateType' => $templateType,
            'targetPostId' => $targetPostId,
            'importMode' => $importMode,
            'elementorVersion' => $elVersion,
            'postStatus' => 'draft',
        ]);

        wp_safe_redirect(admin_url('admin.php?page=f2e-bridge&f2e_msg=imported&post_id=' . (int) ($result['postId'] ?? 0)));
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
