<?php
/**
 * Standalone CLI Unit Test Suite for F2E Bridge WordPress Plugin.
 * Tests TranspilerV3 (Containers + Free & Pro Widgets + Auto-Responsive),
 * TranspilerV4 (Atomic Widgets), AssetStore SVG Sanitizer, and DocumentWriter Incremental Re-sync.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'phpdbg') {
    if (function_exists('http_response_code')) {
        http_response_code(403);
    }
    exit('Forbidden');
}

define('ABSPATH', __DIR__ . '/');

$GLOBALS['f2e_test_state'] = [
    'posts' => [],
    'post_meta' => [],
    'deleted_meta' => [],
    'options' => [],
    'users' => [],
    'upload_calls' => 0,
    'next_post_id' => 100,
    'files_created' => [],
    'insert_post_override' => null,
    'home_url' => 'https://thecanopyresident.local',
    'site_url' => 'http://thecanopyresident.local',
    'is_ssl' => true,
];

if (!class_exists('WP_Error')) {
    class WP_Error
    {
        public string $code;
        public string $message;
        public mixed $data;

        public function __construct(string $code = '', string $message = '', mixed $data = '')
        {
            $this->code = $code;
            $this->message = $message;
            $this->data = $data;
        }

        public function get_error_code(): string
        {
            return $this->code;
        }

        public function get_error_message(): string
        {
            return $this->message;
        }

        public function get_error_data(): mixed
        {
            return $this->data;
        }
    }
}

if (!function_exists('is_wp_error')) {
    function is_wp_error($thing): bool
    {
        return $thing instanceof WP_Error;
    }
}

if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($data)
    {
        return $data;
    }
}

// Minimal WordPress function stubs for standalone testing
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field(string $str): string
    {
        return trim(strip_tags($str));
    }
}

if (!function_exists('home_url')) {
    function home_url(string $path = ''): string
    {
        $base = rtrim((string) ($GLOBALS['f2e_test_state']['home_url'] ?? 'https://thecanopyresident.local'), '/');
        return $path !== '' ? $base . '/' . ltrim($path, '/') : $base;
    }
}

if (!function_exists('site_url')) {
    function site_url(string $path = ''): string
    {
        $base = rtrim((string) ($GLOBALS['f2e_test_state']['site_url'] ?? 'http://thecanopyresident.local'), '/');
        return $path !== '' ? $base . '/' . ltrim($path, '/') : $base;
    }
}

if (!function_exists('is_ssl')) {
    function is_ssl(): bool
    {
        return (bool) ($GLOBALS['f2e_test_state']['is_ssl'] ?? true);
    }
}

if (!function_exists('get_option')) {
    function get_option(string $key, mixed $default = false): mixed
    {
        return array_key_exists($key, $GLOBALS['f2e_test_state']['options'])
            ? $GLOBALS['f2e_test_state']['options'][$key]
            : $default;
    }
}

if (!function_exists('update_option')) {
    function update_option(string $key, mixed $val, $autoload = null): bool
    {
        $GLOBALS['f2e_test_state']['options'][$key] = $val;
        return true;
    }
}

if (!function_exists('delete_option')) {
    function delete_option(string $key): bool
    {
        unset($GLOBALS['f2e_test_state']['options'][$key]);
        return true;
    }
}

if (!function_exists('get_post')) {
    function get_post(int $postId): ?object
    {
        return $GLOBALS['f2e_test_state']['posts'][$postId] ?? null;
    }
}

if (!function_exists('get_post_status')) {
    function get_post_status(int $postId): string|false
    {
        $p = $GLOBALS['f2e_test_state']['posts'][$postId] ?? null;
        return is_object($p) ? (string) ($p->post_status ?? 'publish') : false;
    }
}

if (!function_exists('get_posts')) {
    function get_posts(array $args): array
    {
        $out = [];
        $type = $args['post_type'] ?? 'post';
        $statuses = (array) ($args['post_status'] ?? ['publish']);
        $metaKey = $args['meta_key'] ?? null;
        $metaVal = $args['meta_value'] ?? null;
        $limit = (int) ($args['posts_per_page'] ?? $args['numberposts'] ?? 10);

        foreach ($GLOBALS['f2e_test_state']['posts'] as $pid => $post) {
            if (!is_object($post) || ($post->post_type ?? '') !== $type) {
                continue;
            }
            if (!in_array('any', $statuses, true) && !in_array($post->post_status ?? '', $statuses, true)) {
                continue;
            }
            if ($metaKey !== null) {
                $actual = $GLOBALS['f2e_test_state']['post_meta'][$pid][$metaKey] ?? null;
                if ($actual !== $metaVal) {
                    continue;
                }
            }
            $out[] = $post;
            if (count($out) >= $limit) {
                break;
            }
        }
        return $out;
    }
}

if (!function_exists('wp_insert_post')) {
    function wp_insert_post(array $data, bool $wpError = false): int|WP_Error
    {
        if (isset($GLOBALS['f2e_test_state']['insert_post_override'])) {
            return $GLOBALS['f2e_test_state']['insert_post_override'];
        }
        $id = ++$GLOBALS['f2e_test_state']['next_post_id'];
        $GLOBALS['f2e_test_state']['posts'][$id] = (object) [
            'ID' => $id,
            'post_type' => $data['post_type'] ?? 'page',
            'post_status' => $data['post_status'] ?? 'draft',
            'post_title' => $data['post_title'] ?? '',
        ];
        return $id;
    }
}

if (!function_exists('get_post_meta')) {
    function get_post_meta(int $postId, string $key = '', bool $single = false): mixed
    {
        if ($key === '') {
            return $GLOBALS['f2e_test_state']['post_meta'][$postId] ?? [];
        }
        return $GLOBALS['f2e_test_state']['post_meta'][$postId][$key] ?? ($single ? '' : []);
    }
}

if (!function_exists('update_post_meta')) {
    function update_post_meta(int $postId, string $key, mixed $value): bool
    {
        $GLOBALS['f2e_test_state']['post_meta'][$postId][$key] = $value;
        return true;
    }
}

if (!function_exists('delete_post_meta')) {
    function delete_post_meta(int $postId, string $key): bool
    {
        $GLOBALS['f2e_test_state']['deleted_meta'][] = [$postId, $key];
        unset($GLOBALS['f2e_test_state']['post_meta'][$postId][$key]);
        return true;
    }
}

if (!function_exists('get_attached_file')) {
    function get_attached_file(int $postId): string|false
    {
        return $GLOBALS['f2e_test_state']['post_meta'][$postId]['_wp_attached_file'] ?? false;
    }
}

if (!function_exists('wp_get_attachment_url')) {
    function wp_get_attachment_url(int $postId): string|false
    {
        return $GLOBALS['f2e_test_state']['post_meta'][$postId]['_f2e_test_url'] ?? false;
    }
}

if (!function_exists('wp_update_attachment_metadata')) {
    function wp_update_attachment_metadata(int $postId, array $meta): bool
    {
        $GLOBALS['f2e_test_state']['post_meta'][$postId]['_wp_attachment_metadata'] = $meta;
        return true;
    }
}

if (!function_exists('current_user_can')) {
    function current_user_can(string $cap, mixed ...$args): bool
    {
        if ($cap === 'unfiltered_html') {
            return false;
        }
        return true;
    }
}

if (!function_exists('get_userdata')) {
    function get_userdata(int $userId): object|false
    {
        return $GLOBALS['f2e_test_state']['users'][$userId] ?? false;
    }
}

if (!function_exists('user_can')) {
    function user_can(object $user, string $cap): bool
    {
        return in_array($cap, $user->caps ?? [], true);
    }
}

if (!function_exists('get_users')) {
    function get_users(array $args): array
    {
        $ids = [];
        foreach ($GLOBALS['f2e_test_state']['users'] as $uid => $u) {
            if (($u->role ?? '') === ($args['role'] ?? 'administrator')) {
                $ids[] = (int) $uid;
            }
        }
        return $ids;
    }
}

require_once __DIR__ . '/../src/Media/AssetStore.php';
require_once __DIR__ . '/../src/Elementor/GlobalStyles.php';
require_once __DIR__ . '/../src/Elementor/TranspilerV3.php';
require_once __DIR__ . '/../src/Elementor/TranspilerV4.php';
require_once __DIR__ . '/../src/Elementor/DocumentWriter.php';
require_once __DIR__ . '/../src/Security/TokenAuth.php';
require_once __DIR__ . '/../src/Api/CorsPolicy.php';
require_once __DIR__ . '/../src/Api/RestController.php';

use F2EBridge\Api\CorsPolicy;
use F2EBridge\Api\RestController;
use F2EBridge\Elementor\DocumentWriter;
use F2EBridge\Elementor\GlobalStyles;
use F2EBridge\Elementor\TranspilerV3;
use F2EBridge\Elementor\TranspilerV4;
use F2EBridge\Media\AssetStore;
use F2EBridge\Security\TokenAuth;

$passed = 0;
$failed = 0;

if (!function_exists('wp_upload_bits')) {
    function wp_upload_bits($name, $deprecated, $bits)
    {
        $GLOBALS['f2e_test_state']['upload_calls']++;
        $uniqueName = uniqid('f2e_test_', true) . '-' . $name;
        $path = sys_get_temp_dir() . DIRECTORY_SEPARATOR . $uniqueName;
        file_put_contents($path, $bits);
        $GLOBALS['f2e_test_state']['files_created'][] = $path;
        return [
            'file' => $path,
            'url' => 'http://thecanopyresident.local/wp-content/uploads/' . $name,
            'error' => false,
        ];
    }
}
if (!function_exists('wp_insert_attachment')) {
    function wp_insert_attachment($args, $file)
    {
        $id = ++$GLOBALS['f2e_test_state']['next_post_id'];
        $GLOBALS['f2e_test_state']['posts'][$id] = (object) [
            'ID' => $id,
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'post_title' => $args['post_title'] ?? '',
            'post_mime_type' => $args['post_mime_type'] ?? '',
        ];
        $GLOBALS['f2e_test_state']['post_meta'][$id]['_wp_attached_file'] = $file;
        $GLOBALS['f2e_test_state']['post_meta'][$id]['_f2e_test_url'] = 'http://thecanopyresident.local/wp-content/uploads/' . basename((string) $file);
        return $id;
    }
}

function assertTrue(bool $condition, string $label): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  ✅ PASS: {$label}\n";
    } else {
        $failed++;
        echo "  ❌ FAIL: {$label}\n";
    }
}

echo "Running F2E Bridge WordPress Plugin Test Suite...\n\n";

// 1. Test Hardened DOM + Regex SVG Sanitizer
$dirtySvg = '<svg viewBox="0 0 24 24" onclick="alert(1)"><script>evil()</script><animate attributeName="href" values="javascript:alert(1)"/><use href="https://evil.example/payload.svg#icon"/><use href="#local-icon"/><a xlink:href="&#x6a;avascript:evil()"><path id="local-icon" d="M0 0h24v24H0z"/></a><style>@import url("https://evil.example/x.css"); .cls{fill:url(#grad1);background:url("https://evil.example/bg.png")}</style></svg>';
$cleanSvg = AssetStore::sanitizeSvg($dirtySvg);
assertTrue(!str_contains($cleanSvg, '<script'), 'SVG Sanitizer strips <script> tags');
assertTrue(!str_contains($cleanSvg, 'onclick'), 'SVG Sanitizer strips inline event handlers');
assertTrue(!str_contains($cleanSvg, '<animate'), 'SVG Sanitizer strips SMIL <animate> XSS vectors');
assertTrue(!str_contains($cleanSvg, 'evil.example'), 'SVG Sanitizer strips external hrefs and CSS @import / external url()');
assertTrue(!str_contains(strtolower($cleanSvg), 'javascript:'), 'SVG Sanitizer strips entity-encoded javascript: URIs');
assertTrue(str_contains($cleanSvg, 'href="#local-icon"'), 'SVG Sanitizer preserves safe local #fragment hrefs');
assertTrue(str_contains($cleanSvg, 'd="M0 0h24v24H0z"'), 'SVG Sanitizer preserves valid vector paths');

// 2. Test TranspilerV3 (Container + Heading + Pro Price Table + Pro Form + Responsive)
$sampleIr = [
    'kind' => 'f2e.document',
    'title' => 'Landing Page',
    'roots' => ['root-1'],
    'nodes' => [
        'root-1' => [
            'id' => 'root-1',
            'sourceNodeId' => '100:1',
            'widget' => 'container',
            'layout' => [
                'width' => 1280,
                'height' => 800,
                'mode' => 'flex',
                'direction' => 'row',
                'gap' => 32,
                'padding' => ['top' => 64, 'right' => 48, 'bottom' => 64, 'left' => 48],
            ],
            'style' => ['background' => '#0F172A'],
            'content' => ['name' => 'Hero Row'],
            'children' => ['h-1', 'price-1'],
        ],
        'h-1' => [
            'id' => 'h-1',
            'sourceNodeId' => '100:2',
            'widget' => 'heading',
            'text' => [
                'characters' => 'Welcome to F2E Bridge',
                'fontSize' => 48,
                'fontFamily' => 'Inter',
                'fontWeight' => '700',
                'color' => '#FFFFFF',
            ],
            'content' => ['name' => 'Main Title'],
            'children' => [],
        ],
        'price-1' => [
            'id' => 'price-1',
            'sourceNodeId' => '100:3',
            'widget' => 'price-table',
            'content' => ['name' => 'Agency Plan'],
            'children' => ['p-t1', 'p-t2', 'p-t3'],
        ],
        'p-t1' => [
            'id' => 'p-t1',
            'sourceNodeId' => '100:4',
            'widget' => 'heading',
            'text' => ['characters' => 'Agency Pro'],
            'children' => [],
        ],
        'p-t2' => [
            'id' => 'p-t2',
            'sourceNodeId' => '100:5',
            'widget' => 'heading',
            'text' => ['characters' => '$99/mo'],
            'children' => [],
        ],
        'p-t3' => [
            'id' => 'p-t3',
            'sourceNodeId' => '100:6',
            'widget' => 'text-editor',
            'text' => ['characters' => 'Unlimited Projects'],
            'children' => [],
        ],
    ],
];

$v3 = new TranspilerV3(new GlobalStyles(), new AssetStore());
$elementsV3 = $v3->transpile($sampleIr);

assertTrue(count($elementsV3) === 1, 'TranspilerV3 outputs 1 root container');
$root = $elementsV3[0];
assertTrue($root['elType'] === 'container', 'Root element is an Elementor Container');
assertTrue($root['settings']['flex_direction'] === 'row', 'Root container preserves row flex direction');
assertTrue(($root['settings']['flex_direction_mobile'] ?? '') === 'column', 'Auto-Responsive stacks multi-column row to column on mobile');
assertTrue($root['settings']['_f2e_node_id'] === '100:1', 'Root container carries _f2e_node_id for Incremental Re-sync');
assertTrue($root['elements'][0]['widgetType'] === 'heading', 'First child is a Heading widget');
assertTrue($root['elements'][0]['settings']['header_size'] === 'h1', '48px Heading resolves to h1');
assertTrue($root['elements'][1]['widgetType'] === 'price-table', 'Second child resolves to Elementor Pro Price Table widget');
assertTrue($root['elements'][1]['settings']['price'] === '99', 'Price Table extracts numeric price 99 from $99/mo');

// 3. Test TranspilerV4 (Atomic Widgets)
$v4 = new TranspilerV4();
$elementsV4 = $v4->transpile($sampleIr);
assertTrue($elementsV4[0]['widgetType'] === 'e-flexbox', 'TranspilerV4 outputs e-flexbox root');
assertTrue($elementsV4[0]['elements'][0]['widgetType'] === 'e-heading', 'TranspilerV4 maps heading to e-heading');

// 4. Test DocumentWriter Deep Recursive Incremental Re-sync (Preserving nested child IDs, links, custom_css, dynamic tags & manual WP children)
$writer = new DocumentWriter();
$existingPageTree = [
    [
        'id' => 'keep123',
        'elType' => 'container',
        'settings' => ['_title' => 'Existing Header Not In Figma'],
        'elements' => [],
    ],
    [
        'id' => 'orig777',
        'elType' => 'container',
        'settings' => [
            '_title' => 'Old Hero Row',
            '_f2e_node_id' => '100:1',
            'custom_css' => 'selector { border: 1px solid red; }',
        ],
        'elements' => [
            [
                'id' => 'child_h1_orig',
                'elType' => 'widget',
                'widgetType' => 'heading',
                'settings' => [
                    '_f2e_node_id' => '100:2',
                    'title' => 'Old Title',
                    'custom_css' => 'selector h1 { text-shadow: 0 2px 4px #000; }',
                    '__dynamic__' => ['title' => '[elementor-tag id="1"]'],
                    'link' => ['url' => 'https://example.com/special-offer', 'is_external' => true],
                ],
                'elements' => [],
            ],
            [
                'id' => 'manual_wp_shortcode',
                'elType' => 'widget',
                'widgetType' => 'shortcode',
                'settings' => [
                    'shortcode' => '[contact-form-7 id="99"]',
                ],
                'elements' => [],
            ],
        ],
    ],
];

[$mergedTree, $updatedCount, $appendedCount] = $writer->incrementalMerge($existingPageTree, $elementsV3);
assertTrue($updatedCount === 1 && $appendedCount === 0, 'Incremental Re-sync updates 1 matching node and appends 0 duplicates');
assertTrue(count($mergedTree) === 2, 'Incremental Re-sync preserves unmapped WordPress sections');
assertTrue($mergedTree[0]['id'] === 'keep123', 'Unmapped section remains untouched');
assertTrue($mergedTree[1]['id'] === 'orig777', 'Re-synced section keeps its original Elementor ID orig777');
assertTrue($mergedTree[1]['settings']['custom_css'] === 'selector { border: 1px solid red; }', 'Re-synced section preserves user custom_css');

// Verify deep recursive child reconciliation
$resyncedChildren = $mergedTree[1]['elements'];
assertTrue($resyncedChildren[0]['id'] === 'child_h1_orig', 'Deep Re-sync preserves nested child widget original Elementor ID (child_h1_orig)');
assertTrue($resyncedChildren[0]['settings']['title'] === 'Welcome to F2E Bridge', 'Deep Re-sync updates nested child widget text from Figma');
assertTrue(($resyncedChildren[0]['settings']['custom_css'] ?? '') === 'selector h1 { text-shadow: 0 2px 4px #000; }', 'Deep Re-sync preserves nested child custom_css');
assertTrue(($resyncedChildren[0]['settings']['__dynamic__']['title'] ?? '') === '[elementor-tag id="1"]', 'Deep Re-sync preserves nested child Elementor Pro __dynamic__ tags');
assertTrue(($resyncedChildren[0]['settings']['link']['url'] ?? '') === 'https://example.com/special-offer', 'Deep Re-sync preserves user-configured real link URL on child widget');
assertTrue(count($resyncedChildren) === 3 && $resyncedChildren[2]['id'] === 'manual_wp_shortcode', 'Deep Re-sync preserves manually added non-Figma WordPress widgets inside container');

// 5. Test Server-Side GlobalStyles::bindGlobalsToElements on compiled Elementor v3 elements
$globalsHelper = new GlobalStyles();
$boundElements = $globalsHelper->bindGlobalsToElements(
    $elementsV3,
    ['#0F172A' => 'branddark', '#FFFFFF' => 'purewhite'],
    ['inter|48|700' => 'heroh1']
);
assertTrue(($boundElements[0]['settings']['__globals__']['background_color'] ?? '') === 'globals/colors?id=branddark', 'GlobalStyles binds verified Active Kit color ID to container background_color');
assertTrue(($boundElements[0]['elements'][0]['settings']['__globals__']['title_color'] ?? '') === 'globals/colors?id=purewhite', 'GlobalStyles binds verified Active Kit color ID to heading title_color');
assertTrue(($boundElements[0]['elements'][0]['settings']['__globals__']['typography_typography'] ?? '') === 'globals/typography?id=heroh1', 'GlobalStyles binds verified Active Kit typography ID to heading typography');

// 6. Test Data-URI SVG (utf8/urlencoded) decoding in AssetStore & comprehensive hydration in RestController
$store = new AssetStore();
$rawSvgDataUri = 'data:image/svg+xml;utf8,' . rawurlencode('<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>');
$storedFromUtf8Svg = $store->storeBase64Asset('', $rawSvgDataUri, 'image/svg+xml', 'Test UTF8 SVG');
assertTrue($storedFromUtf8Svg !== null && $storedFromUtf8Svg['id'] > 0, 'AssetStore safely stores urlencoded UTF-8 SVG data URIs');

$rest = new \F2EBridge\Api\RestController();
$reflection = new \ReflectionClass($rest);
$method = $reflection->getMethod('hydrateCompiledElementAssets');
$method->setAccessible(true);

$testElementsToHydrate = [
    [
        'elType' => 'widget',
        'widgetType' => 'theme-site-logo',
        'settings' => [
            '_title' => 'Site Logo',
            'custom_image' => ['id' => '', 'url' => $rawSvgDataUri],
            'bg_image' => ['id' => '', 'url' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='],
            'slides' => [
                ['background_image' => ['id' => '', 'url' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==']],
            ],
            'gallery' => [
                ['id' => '', 'url' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='],
            ],
        ],
        'elements' => [],
    ],
];
$hydratedList = $method->invoke($rest, $testElementsToHydrate, 'Test Element');
assertTrue(!empty($hydratedList[0]['settings']['custom_image']['id']), 'RestController hydrates custom_image data-uri');
assertTrue(!empty($hydratedList[0]['settings']['bg_image']['id']), 'RestController hydrates bg_image data-uri');
assertTrue(!empty($hydratedList[0]['settings']['slides'][0]['background_image']['id']), 'RestController hydrates slides[].background_image data-uri');
assertTrue(!empty($hydratedList[0]['settings']['gallery'][0]['id']), 'RestController hydrates gallery[].id data-uri');

// 7. Security Audit Regression Tests (F2E-SEC-03 & F2E-SEC-06)
$xxeSvg = '<!DOCTYPE svg [ <!ENTITY lol "lololol"> ]><svg viewBox="0 0 24 24"><path d="M0 0h24v24"/></svg>';
$cleanXxeSvg = AssetStore::sanitizeSvg($xxeSvg);
assertTrue(!str_contains($cleanXxeSvg, 'DOCTYPE') && !str_contains($cleanXxeSvg, 'ENTITY') && str_contains($cleanXxeSvg, 'd="M0 0h24v24"'), 'AssetStore strips bracketed DOCTYPE/ENTITY subsets from SVG');

$polyglotHtmlAsPng = base64_encode('<html><body><script>alert(1)</script></body></html>');
$rejectedPolyglot = $store->storeBase64Asset('', $polyglotHtmlAsPng, 'image/png', 'Fake PNG');
assertTrue($rejectedPolyglot === null, 'AssetStore rejects polyglot HTML/script disguised as image/png');

$sanitizeMethod = $reflection->getMethod('sanitizeCompiledElementHtml');
$sanitizeMethod->setAccessible(true);
$dirtyHtmlElements = [
    [
        'id' => 'html01',
        'elType' => 'widget',
        'widgetType' => 'html',
        'settings' => [
            'html' => '<div onclick="evil()"><script>alert(1)</script><svg viewBox="0 0 10 10"><script>x()</script><path d="M1 1"/></svg></div>',
        ],
        'elements' => [],
    ],
];
$cleanHtmlElements = $sanitizeMethod->invoke($rest, $dirtyHtmlElements);
$cleanHtmlOut = (string) ($cleanHtmlElements[0]['settings']['html'] ?? '');
assertTrue(!str_contains($cleanHtmlOut, '<script') && !str_contains($cleanHtmlOut, 'onclick') && str_contains($cleanHtmlOut, 'd="M1 1"'), 'RestController sanitizes inline HTML/SVG widgets before writing _elementor_data');

// ── 8. M2 Regression Tests: AssetStore (Data URIs, SVG Fail-Closed, Metadata, Dedup, URL Scheme) ──
$tinyPngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
$tinyPngUri = 'data:image/png;base64,' . $tinyPngB64;
$tinyPngHash = hash('sha256', base64_decode($tinyPngB64));
$tinyWebpBytes = "RIFF\x1a\x00\x00\x00WEBP" . str_repeat("\x00", 18);
$tinyWebpUri = 'data:image/webp;base64,' . base64_encode($tinyWebpBytes);
$tinyGifBytes = "GIF89a\x01\x00\x01\x00\x00\x00\x00;";
$tinyGifUri = 'data:image/gif;base64,' . base64_encode($tinyGifBytes);

$svgXml1 = '<svg width="48px" height="32" viewBox="0 0 48 32"><path d="M0 0h48v32H0z"/></svg>';
$svgBase64Uri = 'data:image/svg+xml;base64,' . base64_encode($svgXml1);
$storedB64Svg = $store->storeBase64Asset('', $svgBase64Uri, 'image/png', 'Base64 SVG');
assertTrue($storedB64Svg !== null && $storedB64Svg['id'] > 0 && str_starts_with($storedB64Svg['url'], 'https://'), 'AssetStore stores data:image/svg+xml;base64 even when default mime=image/png and normalizes URL to https');
$svgMeta1 = $GLOBALS['f2e_test_state']['post_meta'][$storedB64Svg['id']]['_wp_attachment_metadata'] ?? [];
assertTrue(($svgMeta1['width'] ?? 0) === 48 && ($svgMeta1['height'] ?? 0) === 32, 'AssetStore populates SVG width/height metadata from attributes');

$svgXml2 = '<svg width="100%" viewBox="0, 0, 120, 60"><rect width="120" height="60"/></svg>';
$storedBareSvg = $store->storeBase64Asset('', 'data:image/svg+xml,' . $svgXml2, 'image/png', 'Bare SVG');
assertTrue($storedBareSvg !== null && $storedBareSvg['id'] > 0, 'AssetStore stores bare RFC2397 data:image/svg+xml,<svg...>');
$svgMeta2 = $GLOBALS['f2e_test_state']['post_meta'][$storedBareSvg['id']]['_wp_attachment_metadata'] ?? [];
assertTrue(($svgMeta2['width'] ?? 0) === 120 && ($svgMeta2['height'] ?? 0) === 60, 'AssetStore extracts SVG dimensions from comma-separated viewBox when width is %');

$storedCharsetSvg = $store->storeBase64Asset('', 'data:image/svg+xml;charset=utf-8,' . rawurlencode('<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>'), 'image/png', 'Charset SVG');
assertTrue($storedCharsetSvg !== null && $storedCharsetSvg['id'] > 0, 'AssetStore stores data:image/svg+xml;charset=utf-8,...');

$storedWebp = $store->storeBase64Asset('', $tinyWebpUri, 'image/png', 'WebP Override');
assertTrue($storedWebp !== null && str_ends_with($storedWebp['url'], '.webp'), 'AssetStore honors data:image/webp MIME over default image/png');

$storedGif = $store->storeBase64Asset('', $tinyGifUri, 'image/png', 'GIF Override');
assertTrue($storedGif !== null && str_ends_with($storedGif['url'], '.gif'), 'AssetStore honors data:image/gif MIME');

$rejectedHtmlDataUri = $store->storeBase64Asset('', 'data:text/html;base64,' . base64_encode('<h1>XSS</h1>'), 'image/png', 'HTML URI');
assertTrue($rejectedHtmlDataUri === null, 'AssetStore rejects non-image data:text/html data URIs');
$reusedWebp = $store->storeBase64Asset($storedWebp['sha256'], $tinyWebpUri, 'image/webp', 'WebP Reuse');
assertTrue($reusedWebp !== null && $reusedWebp['reused'] === true && $store->getLastError() === '', 'AssetStore resets lastError on reused SHA-256 asset hit');

// SVG fail-closed, BOM, auto-xmlns, CSS hardening
assertTrue(AssetStore::sanitizeSvg('<svg><unclosed></svg>') === '', 'AssetStore::sanitizeSvg fails closed on malformed XML');
$bomSvg = "\xEF\xBB\xBF" . '<svg viewBox="0 0 16 16"><style>/*comment*/.a{behavior:url(https://evil.example/x.htc);fill:url(https://evil.example/img.png)}</style><rect style="filter:url(https://evil.example/f.svg#x);fill:red" width="10" height="10"/></svg>';
$cleanBomSvg = AssetStore::sanitizeSvg($bomSvg);
assertTrue($cleanBomSvg !== '' && str_contains($cleanBomSvg, 'xmlns="http://www.w3.org/2000/svg"') && !str_contains($cleanBomSvg, 'evil.example') && !str_contains($cleanBomSvg, 'behavior:'), 'AssetStore::sanitizeSvg handles UTF-8 BOM, adds xmlns, and strips CSS comments/behavior/external url() in <style> and style=');

// findBySha256 skips trashed or missing-file attachments, and normalizes URL
$trashedSha = hash('sha256', 'trashed-asset-bytes');
$GLOBALS['f2e_test_state']['posts'][901] = (object) ['ID' => 901, 'post_type' => 'attachment', 'post_status' => 'trash'];
$GLOBALS['f2e_test_state']['post_meta'][901] = [
    AssetStore::META_SHA256 => $trashedSha,
    '_wp_attached_file' => $GLOBALS['f2e_test_state']['files_created'][0],
    '_f2e_test_url' => 'http://thecanopyresident.local/wp-content/uploads/trashed.png',
];
$freshStore = new AssetStore();
assertTrue($freshStore->findBySha256($trashedSha) === null, 'AssetStore::findBySha256 excludes trashed attachments');

$missingFileSha = hash('sha256', 'missing-disk-file');
$GLOBALS['f2e_test_state']['posts'][902] = (object) ['ID' => 902, 'post_type' => 'attachment', 'post_status' => 'inherit'];
$GLOBALS['f2e_test_state']['post_meta'][902] = [
    AssetStore::META_SHA256 => $missingFileSha,
    '_wp_attached_file' => sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'nonexistent-file-xyz.png',
    '_f2e_test_url' => 'http://thecanopyresident.local/wp-content/uploads/missing.png',
];
assertTrue($freshStore->findBySha256($missingFileSha) === null, 'AssetStore::findBySha256 excludes attachments missing on disk');

$validLookupSha = hash('sha256', 'valid-disk-file');
$GLOBALS['f2e_test_state']['posts'][903] = (object) ['ID' => 903, 'post_type' => 'attachment', 'post_status' => 'inherit'];
$GLOBALS['f2e_test_state']['post_meta'][903] = [
    AssetStore::META_SHA256 => $validLookupSha,
    '_wp_attached_file' => $GLOBALS['f2e_test_state']['files_created'][0],
    '_f2e_test_url' => 'http://thecanopyresident.local/wp-content/uploads/valid.png',
];
$foundValid = $freshStore->findBySha256($validLookupSha);
assertTrue($foundValid !== null && $foundValid['id'] === 903 && str_starts_with($foundValid['url'], 'https://'), 'AssetStore::findBySha256 returns active file-backed attachment with https normalized URL');

// ── 9. TokenAuth & CorsPolicy Tests ──
$GLOBALS['f2e_test_state']['users'] = [
    5 => (object) ['ID' => 5, 'role' => 'subscriber', 'caps' => ['read']],
    7 => (object) ['ID' => 7, 'role' => 'administrator', 'caps' => ['upload_files', 'edit_pages', 'manage_options']],
];
$GLOBALS['f2e_test_state']['options'][TokenAuth::OPTION_USER_ID] = 5; // demoted user
$tokenAuth = new TokenAuth();
assertTrue($tokenAuth->getPairedUserId() === 7, 'TokenAuth::getPairedUserId falls back to capable administrator when paired user lacks upload_files/edit_pages');

$cors = new CorsPolicy();
assertTrue($cors->resolveAllowedOrigin('null') === 'null', 'CorsPolicy allows Origin: null');
assertTrue($cors->resolveAllowedOrigin('https://www.figma.com') === 'https://www.figma.com', 'CorsPolicy allows https://www.figma.com');
assertTrue($cors->resolveAllowedOrigin('https://figma.com') === 'https://figma.com', 'CorsPolicy allows https://figma.com');
assertTrue($cors->resolveAllowedOrigin('http://thecanopyresident.local') === 'http://thecanopyresident.local', 'CorsPolicy allows matching site_url/home_url across http/https');
assertTrue($cors->resolveAllowedOrigin('https://evil.example') === '', 'CorsPolicy rejects unknown origin with empty string (never null)');

// ── 10. RestController T1-T7 Hydration, Batch, Bundle & Sanitization Tests ──
// T1: SVG base64 & charset=utf-8 hydration
$t1Elements = [
    [
        'id' => 't1_img',
        'elType' => 'widget',
        'widgetType' => 'image',
        'settings' => [
            'image' => ['id' => 0, 'url' => $svgBase64Uri],
            'custom_image' => ['id' => 0, 'url' => 'data:image/svg+xml;charset=utf-8,' . rawurlencode('<svg viewBox="0 0 10 10"><path d="M0 0h10v10"/></svg>')],
            'selected_icon' => ['value' => $svgBase64Uri, 'library' => 'svg'],
        ],
        'elements' => [],
    ],
];
$t1Out = $method->invoke($rest, $t1Elements, 'T1');
assertTrue(($t1Out[0]['settings']['image']['id'] ?? 0) > 0 && str_ends_with((string) ($t1Out[0]['settings']['image']['url'] ?? ''), '.svg'), 'T1: RestController hydrates data:image/svg+xml;base64 on image widget');
assertTrue(($t1Out[0]['settings']['custom_image']['id'] ?? 0) > 0, 'T1: RestController hydrates data:image/svg+xml;charset=utf-8 on custom_image');
assertTrue(is_array($t1Out[0]['settings']['selected_icon']['value'] ?? null) && ($t1Out[0]['settings']['selected_icon']['value']['id'] ?? 0) > 0, 'T1: RestController hydrates selected_icon (library=svg) to {id, url}');

// T2: gallery, wp_gallery, carousel, Pro/hover/overlay keys, slides[].image, inline <svg> selected_icon
$t2Elements = [
    [
        'id' => 't2_all',
        'elType' => 'container',
        'settings' => [
            'background_overlay_image' => ['id' => 0, 'url' => $tinyPngUri],
            'background_hover_image' => ['id' => 0, 'url' => $tinyWebpUri],
            '_background_hover_image' => ['id' => 0, 'url' => $tinyPngUri],
            'background_a_image' => ['id' => 0, 'url' => $tinyPngUri],
            'background_b_image' => ['id' => 0, 'url' => $tinyPngUri],
            'wp_gallery' => [['id' => 0, 'url' => $tinyPngUri]],
            'carousel' => [['id' => 0, 'url' => $tinyWebpUri]],
            'slides' => [['image' => ['id' => 0, 'url' => $tinyPngUri]]],
            'icon_list' => [['selected_icon' => ['value' => $svgBase64Uri, 'library' => 'svg']]],
            'selected_icon' => ['value' => '<svg viewBox="0 0 12 12"><path d="M1 1h10"/></svg>', 'library' => 'svg'],
        ],
        'elements' => [],
    ],
];
$t2Out = $method->invoke($rest, $t2Elements, 'T2');
$t2s = $t2Out[0]['settings'];
assertTrue(
    ($t2s['background_overlay_image']['id'] ?? 0) > 0
    && ($t2s['background_hover_image']['id'] ?? 0) > 0
    && ($t2s['_background_hover_image']['id'] ?? 0) > 0
    && ($t2s['background_a_image']['id'] ?? 0) > 0
    && ($t2s['background_b_image']['id'] ?? 0) > 0
    && ($t2s['wp_gallery'][0]['id'] ?? 0) > 0
    && ($t2s['carousel'][0]['id'] ?? 0) > 0
    && ($t2s['slides'][0]['image']['id'] ?? 0) > 0
    && ($t2s['icon_list'][0]['selected_icon']['value']['id'] ?? 0) > 0
    && ($t2s['selected_icon']['value']['id'] ?? 0) > 0,
    'T2: RestController hydrates wp_gallery, carousel, overlay/hover/flip-box images, slides[].image, and inline SVG selected_icon'
);

// T3: Elementor v4 (both F2E flat & 4.4.1 Image_Prop_Type / Svg_Src_Prop_Type / Background_Prop_Type)
$t3Elements = [
    [
        'id' => 't3_flex',
        'elType' => 'e-flexbox',
        'widgetType' => 'e-flexbox',
        'settings' => [],
        'styles' => [
            'e-flex-1' => [
                'variants' => [[
                    'meta' => ['breakpoint' => 'desktop', 'state' => null],
                    'props' => [
                        'background' => [
                            '$$type' => 'background',
                            'value' => [
                                'background-overlay' => [
                                    '$$type' => 'background-overlay',
                                    'value' => [[
                                        '$$type' => 'background-image-overlay',
                                        'value' => [
                                            'image' => [
                                                '$$type' => 'image',
                                                'value' => [
                                                    'src' => ['$$type' => 'image-src', 'value' => ['id' => null, 'url' => ['$$type' => 'url', 'value' => $tinyPngUri]]],
                                                    'size' => ['$$type' => 'string', 'value' => 'full'],
                                                ],
                                            ],
                                        ],
                                    ]],
                                ],
                            ],
                        ],
                        'backgroundImage' => ['$$type' => 'image', 'value' => ['id' => 0, 'url' => $tinyWebpUri]],
                    ],
                ]],
            ],
        ],
        'elements' => [
            [
                'id' => 't3_img_flat',
                'elType' => 'widget',
                'widgetType' => 'e-image',
                'settings' => ['image' => ['$$type' => 'image', 'value' => ['id' => 0, 'url' => $tinyPngUri]]],
                'elements' => [],
            ],
            [
                'id' => 't3_img_441',
                'elType' => 'widget',
                'widgetType' => 'e-image',
                'settings' => [
                    'image' => [
                        '$$type' => 'image',
                        'value' => [
                            'src' => ['$$type' => 'image-src', 'value' => ['id' => null, 'url' => ['$$type' => 'url', 'value' => $tinyWebpUri]]],
                            'size' => ['$$type' => 'string', 'value' => 'full'],
                        ],
                    ],
                ],
                'elements' => [],
            ],
            [
                'id' => 't3_svg',
                'elType' => 'widget',
                'widgetType' => 'e-svg',
                'settings' => [
                    'svg' => ['$$type' => 'svg-src', 'value' => ['id' => null, 'url' => ['$$type' => 'url', 'value' => $svgBase64Uri]]],
                ],
                'elements' => [],
            ],
        ],
    ],
];
$t3Out = $method->invoke($rest, $t3Elements, 'T3');
$v4FlatImg = $t3Out[0]['elements'][0]['settings']['image']['value'];
$v4OfficialSrc = $t3Out[0]['elements'][1]['settings']['image']['value']['src']['value'];
$v4SvgSrc = $t3Out[0]['elements'][2]['settings']['svg']['value'];
$v4BgOverlaySrc = $t3Out[0]['styles']['e-flex-1']['variants'][0]['props']['background']['value']['background-overlay']['value'][0]['value']['image']['value']['src']['value'];
$v4BgFlat = $t3Out[0]['styles']['e-flex-1']['variants'][0]['props']['backgroundImage']['value'];
assertTrue(($v4FlatImg['id'] ?? 0) > 0 && str_starts_with((string) ($v4FlatImg['url'] ?? ''), 'https://'), 'T3: RestController hydrates F2E flat v4 e-image');
assertTrue(($v4OfficialSrc['id']['value'] ?? 0) > 0 && $v4OfficialSrc['url'] === null, 'T3: RestController hydrates Elementor 4.4.1 e-image enforcing ($has_id xor $has_url)');
assertTrue(($v4SvgSrc['id']['value'] ?? 0) > 0 && str_ends_with((string) ($v4SvgSrc['url']['value'] ?? ''), '.svg'), 'T3: RestController hydrates Elementor 4.4.1 e-svg');
assertTrue(($v4BgOverlaySrc['id']['value'] ?? 0) > 0 && ($v4BgFlat['id'] ?? 0) > 0, 'T3: RestController hydrates v4 styles background-image-overlay and backgroundImage');

// T4: Request-scoped $dataUriCache deduplication
$uniquePng = base64_encode(substr(base64_decode($tinyPngB64), 0) . 't4'); // wait: keep valid PNG signature + unique chunk? Use valid unique PNG via minimal IDAT? No, use fresh AssetStore + unique GIF bytes!
$t4Gif = 'data:image/gif;base64,' . base64_encode("GIF89a\x02\x00\x02\x00\x00\x00\x00;");
$uploadsBeforeT4 = $GLOBALS['f2e_test_state']['upload_calls'];
$t4Rest = new RestController();
$t4Ref = (new \ReflectionClass($t4Rest))->getMethod('hydrateCompiledElementAssets');
$t4Ref->setAccessible(true);
$t4Out = $t4Ref->invoke($t4Rest, [
    ['id' => 'd1', 'settings' => ['image' => ['id' => 0, 'url' => $t4Gif]], 'elements' => []],
    ['id' => 'd2', 'settings' => ['background_image' => ['id' => 0, 'url' => $t4Gif]], 'elements' => []],
    ['id' => 'd3', 'settings' => ['custom_image' => ['id' => 0, 'url' => $t4Gif]], 'elements' => []],
], 'T4');
$uploadsAfterT4 = $GLOBALS['f2e_test_state']['upload_calls'];
assertTrue(
    ($uploadsAfterT4 - $uploadsBeforeT4) === 1
    && $t4Out[0]['settings']['image']['id'] === $t4Out[1]['settings']['background_image']['id']
    && $t4Out[1]['settings']['background_image']['id'] === $t4Out[2]['settings']['custom_image']['id'],
    'T4: RestController $dataUriCache deduplicates 3 identical inline Data URIs to 1 upload'
);

// T5: .f2e.json bundle $attachmentMap resolution + assetErrors propagation
$t5GifBytes = "GIF89a\x03\x00\x03\x00\x00\x00\x00;";
$t5GifSha = hash('sha256', $t5GifBytes);
$t5Bundle = [
    'kind' => 'f2e.bundle',
    'elementorVersion' => 'v3',
    'document' => [
        'title' => 'Bundle Test',
        'nodes' => [
            'n1' => ['id' => 'n1', 'sourceNodeId' => '200:1', 'widget' => 'image', 'image' => ['sha256' => $t5GifSha]],
        ],
    ],
    'assets' => [
        ['sha256' => $t5GifSha, 'mime' => 'image/gif', 'base64' => base64_encode($t5GifBytes), 'name' => 'Good GIF'],
        ['sha256' => str_repeat('a', 64), 'mime' => 'image/png', 'base64' => base64_encode('<script>bad</script>'), 'name' => 'Polyglot'],
        ['sha256' => str_repeat('b', 64), 'mime' => 'image/png', 'base64' => '', 'name' => 'Empty'],
    ],
    'elementorV3' => [
        'content' => [[
            'id' => 'b1',
            'elType' => 'widget',
            'widgetType' => 'image',
            'settings' => [
                '_f2e_node_id' => '200:1',
                'image' => ['id' => 0, 'url' => 'f2e-asset://' . $t5GifSha],
            ],
            'elements' => [],
        ]],
    ],
];
$t5Result = $rest->processBundleOrTemplateArray($t5Bundle);
$t5SavedJson = json_decode((string) ($GLOBALS['f2e_test_state']['post_meta'][$t5Result['postId']]['_elementor_data'] ?? '[]'), true);
assertTrue(
    count($t5Result['assetErrors'] ?? []) === 2
    && ($t5SavedJson[0]['settings']['image']['id'] ?? 0) > 0
    && str_ends_with((string) ($t5SavedJson[0]['settings']['image']['url'] ?? ''), '.gif'),
    'T5: processBundleOrTemplateArray resolves f2e-asset:// via $attachmentMap and surfaces 2 assetErrors'
);

// T6: handleUploadAssetsBatch error reporting
$t6GifBytes = "GIF89a\x04\x00\x04\x00\x00\x00\x00;";
$t6Sha = hash('sha256', $t6GifBytes);
$mockBatchReq = new class(['assets' => [
    ['sha256' => $t6Sha, 'mime' => 'image/gif', 'base64' => base64_encode($t6GifBytes)],
    ['sha256' => str_repeat('c', 64), 'mime' => 'image/png', 'base64' => base64_encode('<html>nope</html>')],
    ['sha256' => str_repeat('d', 64), 'mime' => 'image/png', 'base64' => ''],
]]) {
    public function __construct(private array $params) {}
    public function get_json_params(): array { return $this->params; }
};
$t6Resp = $rest->handleUploadAssetsBatch($mockBatchReq);
assertTrue(
    ($t6Resp['data']['count'] ?? 0) === 1
    && isset($t6Resp['data']['attachmentMap'][$t6Sha])
    && count($t6Resp['data']['errors'] ?? []) === 2,
    'T6: handleUploadAssetsBatch returns count=1, attachmentMap, and 2 structured errors'
);

// T7: handleImport status codes & sanitizeCompiledElementHtml hardening
$emptyReq = new class { public function get_json_params(): array { return []; } };
$t7Empty = $rest->handleImport($emptyReq);
assertTrue(is_wp_error($t7Empty) && ($t7Empty->get_error_data()['status'] ?? 0) === 400, 'T7: handleImport rejects empty payload with 400 WP_Error');

$missingPostReq = new class {
    public function get_json_params(): array {
        return ['targetPostId' => 999999, 'content' => [['id' => 'x', 'elType' => 'widget', 'widgetType' => 'heading', 'settings' => ['title' => 'Hi'], 'elements' => []]]];
    }
};
$t7Missing = $rest->handleImport($missingPostReq);
assertTrue(is_wp_error($t7Missing) && ($t7Missing->get_error_data()['status'] ?? 0) === 404, 'T7: handleImport returns 404 WP_Error for nonexistent targetPostId');

$t7Sanitized = $sanitizeMethod->invoke($rest, [[
    'id' => 'sec1',
    'elType' => 'widget',
    'widgetType' => 'html',
    'settings' => [
        'html' => '<iframe src="https://evil.example"></iframe><a href="vbscript:msgbox(1)">x</a>',
        'custom_css' => 'selector { color: red; }</style><script>alert(1)</script>',
        'editor' => '<p>Hello</p><iframe src="x"></iframe>',
    ],
    'elements' => [],
]]);
assertTrue(
    !str_contains($t7Sanitized[0]['settings']['html'], '<iframe')
    && !str_contains($t7Sanitized[0]['settings']['html'], 'vbscript:')
    && !str_contains(strtolower($t7Sanitized[0]['settings']['custom_css']), '</style')
    && !str_contains($t7Sanitized[0]['settings']['editor'], '<iframe'),
    'T7: sanitizeCompiledElementHtml strips <iframe>, vbscript:, and </style from custom_css & editor'
);

// ── 11. TranspilerV3 & TranspilerV4 & DocumentWriter & GlobalStyles Tests ──
$iconSvgSha = $storedB64Svg['sha256'];
$rasterSha = $storedWebp['sha256'];
$boxAttachMap = [
    $iconSvgSha => ['id' => $storedB64Svg['id'], 'url' => $storedB64Svg['url']],
    $rasterSha => ['id' => $storedWebp['id'], 'url' => $storedWebp['url']],
];
$boxIr = [
    'kind' => 'f2e.document',
    'roots' => ['ib-svg', 'ib-inline', 'ib-raster', 'img-box', 'logo-raster', 'car-1', 'acc-1', 'nav-1', 'feat-1'],
    'nodes' => [
        'ib-svg' => ['id' => 'ib-svg', 'widget' => 'icon-box', 'svg' => ['sha256' => $iconSvgSha], 'content' => ['title_text' => 'SVG Box']],
        'ib-inline' => [
            'id' => 'ib-inline',
            'widget' => 'icon-box',
            'svg' => ['markup' => '<svg viewBox="0 0 16 16"><path d="M1 1h14"/></svg>', 'width' => 24, 'height' => 24],
            'content' => ['title_text' => 'Inline <Box>', 'description_text' => 'Desc'],
        ],
        'ib-raster' => ['id' => 'ib-raster', 'widget' => 'icon-box', 'raster' => ['sha256' => $rasterSha], 'content' => ['title_text' => 'Raster Fallback']],
        'img-box' => [
            'id' => 'img-box',
            'widget' => 'image-box',
            'raster' => ['sha256' => $rasterSha, 'dataUri' => $tinyWebpUri],
            'content' => ['title_text' => 'Pre-populated Title', 'description_text' => 'Desc'],
            'text' => ['color' => '#112233', 'fontSize' => 20, 'fontFamily' => 'Inter', 'fontWeight' => '600'],
        ],
        'logo-raster' => ['id' => 'logo-raster', 'widget' => 'site-logo', 'raster' => ['sha256' => $rasterSha], 'layout' => ['width' => 140]],
        'car-1' => [
            'id' => 'car-1',
            'widget' => 'media-carousel',
            'children' => ['car-img1', 'car-bg2'],
        ],
        'car-img1' => ['id' => 'car-img1', 'widget' => 'container', 'raster' => ['sha256' => $rasterSha]],
        'car-bg2' => ['id' => 'car-bg2', 'widget' => 'container', 'style' => ['backgroundImage' => $rasterSha]],
        'acc-1' => [
            'id' => 'acc-1',
            'widget' => 'nested-accordion',
            'content' => ['accordionItems' => [['title' => 'Q1', 'body' => 'Use <script> & "quotes"']]],
            'children' => ['acc-div', 'acc-extra'],
        ],
        'acc-div' => ['id' => 'acc-div', 'widget' => 'divider'],
        'acc-extra' => ['id' => 'acc-extra', 'widget' => 'text-editor', 'text' => ['characters' => 'Extra']],
        'nav-1' => ['id' => 'nav-1', 'widget' => 'nav-menu', 'content' => ['menuItems' => ['Home <1>', 'About']]],
        'feat-1' => ['id' => 'feat-1', 'widget' => 'theme-post-featured-image', 'image' => ['sha256' => $rasterSha]],
    ],
];
$v3BoxOut = $v3->transpile($boxIr, $boxAttachMap);
assertTrue(
    ($v3BoxOut[0]['settings']['selected_icon']['library'] ?? '') === 'svg'
    && ($v3BoxOut[0]['settings']['selected_icon']['value']['id'] ?? 0) === $storedB64Svg['id'],
    'TranspilerV3 icon-box uploaded SVG uses {id, url} format for Elementor Icons_Manager'
);
assertTrue(
    !is_string($v3BoxOut[1]['settings']['selected_icon']['value'] ?? null)
    && !str_contains((string) json_encode($v3BoxOut[1]['settings']['selected_icon'] ?? ''), '<svg'),
    'TranspilerV3 icon-box inline SVG never puts raw <svg> inside selected_icon.value'
);
assertTrue(
    $v3BoxOut[2]['widgetType'] === 'image-box' && ($v3BoxOut[2]['settings']['image']['id'] ?? 0) === $storedWebp['id'],
    'TranspilerV3 icon-box with raster-only falls back to image-box instead of library=svg'
);
assertTrue(
    ($v3BoxOut[3]['settings']['image']['id'] ?? 0) === $storedWebp['id']
    && ($v3BoxOut[3]['settings']['title_color'] ?? '') === '#112233',
    'TranspilerV3 image-box preserves Media Library {id, url} (no dataUri overwrite) and honors title_color when title_text pre-populated'
);
assertTrue(
    ($v3BoxOut[4]['settings']['image']['id'] ?? 0) === $storedWebp['id'],
    'TranspilerV3 buildSiteLogo resolves node[raster]'
);
assertTrue(
    $v3BoxOut[5]['widgetType'] === 'image-carousel'
    && count($v3BoxOut[5]['settings']['carousel'] ?? []) === 2,
    'TranspilerV3 buildGalleryOrCarousel normalizes media-carousel -> image-carousel and collects raster + style.backgroundImage'
);
$accBodyEditor = (string) ($v3BoxOut[6]['elements'][0]['elements'][0]['elements'][0]['settings']['editor'] ?? '');
assertTrue(
    count($v3BoxOut[6]['settings']['items'] ?? []) === 1
    && !str_contains($accBodyEditor, '<script>')
    && str_contains($accBodyEditor, '&lt;script&gt;'),
    'TranspilerV3 buildNestedAccordion escapes body HTML and aligns count with extractedItems'
);
assertTrue(
    $v3BoxOut[7]['elType'] === 'container'
    && !isset($v3BoxOut[7]['widgetType'])
    && str_contains((string) ($v3BoxOut[7]['elements'][0]['settings']['title'] ?? ''), '&lt;1&gt;'),
    'TranspilerV3 buildProNavMenu Free fallback escapes labels without esc_html() fatal and sets widgetType=null'
);
assertTrue(
    $v3BoxOut[8]['widgetType'] === 'image' && ($v3BoxOut[8]['settings']['image']['id'] ?? 0) === $storedWebp['id'],
    'TranspilerV3 buildNode handles theme-post-featured-image'
);

// TranspilerV4 tests
$v4WithStore = new TranspilerV4($freshStore);
$v4Ir = [
    'kind' => 'f2e.document',
    'roots' => ['v4-box'],
    'nodes' => [
        'v4-box' => [
            'id' => 'v4-box',
            'widget' => 'container',
            'style' => ['backgroundImage' => $validLookupSha],
            'children' => ['v4-logo', 'v4-icon'],
        ],
        'v4-logo' => ['id' => 'v4-logo', 'widget' => 'theme-site-logo', 'raster' => ['sha256' => $rasterSha]],
        'v4-icon' => ['id' => 'v4-icon', 'widget' => 'icon', 'svg' => ['sha256' => $iconSvgSha]],
    ],
];
$v4Out = $v4WithStore->transpile($v4Ir, $boxAttachMap);
$v4FlexBg = $v4Out[0]['styles'][array_key_first($v4Out[0]['styles'])]['variants'][0]['props']['backgroundImage']['value'] ?? [];
assertTrue(($v4FlexBg['id'] ?? 0) === 903, 'TranspilerV4 resolves e-flexbox backgroundImage via AssetStore::findBySha256');
assertTrue(
    $v4Out[0]['elements'][0]['widgetType'] === 'e-image'
    && ($v4Out[0]['elements'][0]['settings']['image']['value']['id'] ?? 0) === $storedWebp['id'],
    'TranspilerV4 maps theme-site-logo and resolves raster attachment'
);
assertTrue(
    $v4Out[0]['elements'][1]['widgetType'] === 'e-svg'
    && ($v4Out[0]['elements'][1]['settings']['svg']['value']['id'] ?? 0) === $storedB64Svg['id'],
    'TranspilerV4 populates settings[svg] on e-svg'
);

// DocumentWriter tests: missing targetPostId, wp_insert_post 0, cache meta deletion
$missingTargetRes = $writer->saveOrSync($elementsV3, ['targetPostId' => 888888]);
assertTrue(is_wp_error($missingTargetRes) && ($missingTargetRes->get_error_data()['status'] ?? 0) === 404, 'DocumentWriter::saveOrSync returns 404 WP_Error when explicit targetPostId does not exist');

$GLOBALS['f2e_test_state']['insert_post_override'] = 0;
$failedInsertRes = $writer->saveOrSync($elementsV3, ['title' => 'Fail Insert']);
$GLOBALS['f2e_test_state']['insert_post_override'] = null;
assertTrue(is_wp_error($failedInsertRes) && ($failedInsertRes->get_error_data()['status'] ?? 0) === 500, 'DocumentWriter::saveOrSync returns 500 WP_Error when wp_insert_post returns 0');

$GLOBALS['f2e_test_state']['deleted_meta'] = [];
$okSave = $writer->saveOrSync($elementsV3, ['title' => 'Cache Clear Test']);
$deletedKeys = array_map(static fn (array $pair): string => $pair[1], array_filter($GLOBALS['f2e_test_state']['deleted_meta'], static fn (array $pair): bool => $pair[0] === $okSave['postId']));
assertTrue(
    in_array('_elementor_css', $deletedKeys, true) && in_array('_elementor_element_cache', $deletedKeys, true),
    'DocumentWriter::saveOrSync deletes _elementor_css and _elementor_element_cache on saved postId'
);

// GlobalStyles tests: missing kit, invalid/empty colors, fontSize <= 0, deterministic non-ASCII slugs
$GLOBALS['f2e_test_state']['options']['elementor_active_kit'] = 77777; // nonexistent kit
$missingKitSync = $globalsHelper->sync([['name' => 'Primary', 'value' => '#111111']], []);
assertTrue(($missingKitSync['kitId'] ?? -1) === 0, 'GlobalStyles::sync returns kitId=0 when Active Kit post does not exist');

$kitId = 555;
$GLOBALS['f2e_test_state']['options']['elementor_active_kit'] = $kitId;
$GLOBALS['f2e_test_state']['posts'][$kitId] = (object) ['ID' => $kitId, 'post_type' => 'elementor_library', 'post_status' => 'publish'];
$GLOBALS['f2e_test_state']['post_meta'][$kitId][GlobalStyles::KIT_META_KEY] = [
    'system_colors' => [['_id' => 'primary', 'title' => 'Primary', 'color' => '#123456']],
];
$globalsHelper->sync(
    [
        ['name' => 'Primary', 'role' => 'primary', 'value' => ''],
        ['name' => 'Bad Color', 'value' => 'not-a-color'],
        ['name' => 'Màu Chính', 'value' => '#00AA55'],
    ],
    [
        ['name' => 'Zero Font', 'fontFamily' => 'Inter', 'fontSize' => 0, 'fontWeight' => '400'],
    ]
);
$globalsHelper->sync(
    [['name' => 'Màu Chính', 'value' => '#00AA55']],
    []
);
$kitAfter = $GLOBALS['f2e_test_state']['post_meta'][$kitId][GlobalStyles::KIT_META_KEY];
assertTrue(($kitAfter['system_colors'][0]['color'] ?? '') === '#123456', 'GlobalStyles::sync does not overwrite system_colors with empty value');
assertTrue(count($kitAfter['custom_colors'] ?? []) === 1, 'GlobalStyles::sync rejects invalid colors and uses deterministic non-ASCII slugs (no duplicates on re-sync)');
assertTrue(!isset($kitAfter['custom_typography'][0]['typography_font_size']), 'GlobalStyles::sync omits typography_font_size when fontSize <= 0');

// Cleanup temp files created during test run
foreach ($GLOBALS['f2e_test_state']['files_created'] as $tmpFile) {
    if (is_file($tmpFile)) {
        @unlink($tmpFile);
    }
}

echo "\nSummary: {$passed} passed, {$failed} failed.\n";
exit($failed > 0 ? 1 : 0);
