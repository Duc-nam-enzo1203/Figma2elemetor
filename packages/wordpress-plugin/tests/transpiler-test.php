<?php
/**
 * Standalone CLI Unit Test Suite for F2E Bridge WordPress Plugin.
 * Tests TranspilerV3 (Containers + Free & Pro Widgets + Auto-Responsive),
 * TranspilerV4 (Atomic Widgets), AssetStore SVG Sanitizer, and DocumentWriter Incremental Re-sync.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

// Minimal WordPress function stubs for standalone testing
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field(string $str): string
    {
        return trim(strip_tags($str));
    }
}

require_once __DIR__ . '/../src/Media/AssetStore.php';
require_once __DIR__ . '/../src/Elementor/GlobalStyles.php';
require_once __DIR__ . '/../src/Elementor/TranspilerV3.php';
require_once __DIR__ . '/../src/Elementor/TranspilerV4.php';
require_once __DIR__ . '/../src/Elementor/DocumentWriter.php';

use F2EBridge\Elementor\DocumentWriter;
use F2EBridge\Elementor\GlobalStyles;
use F2EBridge\Elementor\TranspilerV3;
use F2EBridge\Elementor\TranspilerV4;
use F2EBridge\Media\AssetStore;

$passed = 0;
$failed = 0;

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

echo "\nSummary: {$passed} passed, {$failed} failed.\n";
exit($failed > 0 ? 1 : 0);
