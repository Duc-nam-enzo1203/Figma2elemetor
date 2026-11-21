<?php
/**
 * WP Admin Dashboard View for F2E Bridge
 *
 * @var string $token
 * @var string $siteUrl
 */

if (!defined('ABSPATH')) {
    exit;
}

$msg = isset($_GET['f2e_msg']) ? sanitize_text_field((string) $_GET['f2e_msg']) : '';
$err = isset($_GET['f2e_err']) ? sanitize_text_field((string) $_GET['f2e_err']) : '';
$importedPostId = isset($_GET['post_id']) ? (int) $_GET['post_id'] : 0;
?>
<div class="wrap" style="max-width: 960px;">
    <h1 style="display:flex;align-items:center;gap:10px;">
        <span>⚡ F2E Bridge — Figma to Elementor (Free &amp; Pro)</span>
        <span style="font-size:12px;background:#2563eb;color:#fff;padding:3px 10px;border-radius:99px;">v<?php echo esc_html(F2E_BRIDGE_VERSION); ?></span>
    </h1>
    <p style="font-size:14px;color:#475569;">
        Cầu nối tự chủ 100% (Self-hosted) giúp chuyển thiết kế từ <strong>Figma (Free)</strong> sang <strong>Elementor v3 (Flexbox/Grid + Pro Widgets)</strong> và <strong>Elementor v4 (Atomic Widgets)</strong> không giới hạn số lượng dự án.
    </p>

    <?php if ($msg === 'token_regenerated') : ?>
        <div class="notice notice-success is-dismissible"><p>✅ Đã tạo mới Connection Token thành công!</p></div>
    <?php elseif ($msg === 'imported' && $importedPostId > 0) : ?>
        <div class="notice notice-success is-dismissible">
            <p>
                ✅ Đã import thiết kế thành công vào Post <strong>#<?php echo esc_html((string) $importedPostId); ?></strong>!
                <a href="<?php echo esc_url(admin_url('post.php?post=' . $importedPostId . '&action=elementor')); ?>" class="button button-primary" style="margin-left:10px;">Mở trong Elementor Editor</a>
            </p>
        </div>
    <?php endif; ?>

    <?php if ($err !== '') : ?>
        <div class="notice notice-error is-dismissible"><p>❌ Lỗi: <?php echo esc_html($err); ?></p></div>
    <?php endif; ?>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;">
        <!-- Card 1: Live Push Connection -->
        <div style="background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:20px;">
            <h2 style="margin-top:0;">🔗 1. Kết Nối Trực Tiếp Từ Figma Plugin (Live Push)</h2>
            <p>Sao chép 2 thông số dưới đây và dán vào tab <strong>2. Live Push WP</strong> trên Figma Plugin:</p>

            <div style="margin-bottom:14px;">
                <label style="font-weight:600;display:block;margin-bottom:4px;">WordPress Site URL:</label>
                <input type="text" readonly value="<?php echo esc_attr($siteUrl); ?>" style="width:100%;font-family:monospace;background:#f8fafc;" onclick="this.select();" />
                <?php if (str_starts_with($siteUrl, 'http://') && !str_contains($siteUrl, 'localhost') && !str_contains($siteUrl, '127.0.0.1')) : ?>
                    <p style="margin:6px 0 0 0;font-size:12px;color:#b45309;background:#fef3c7;padding:8px;border-radius:6px;border:1px solid #f59e0b;">
                        ⚠️ <strong>Lưu ý cho LocalWP ( tên miền <code>.local</code> chạy HTTP ):</strong><br>
                        Figma chạy trên nền HTTPS nên trình duyệt của Figma sẽ chặn kết nối HTTP tới tên miền <code>.local</code> (Mixed Content) trừ khi dùng <code>http://localhost:PORT</code> hoặc bật <strong>SSL (Trust)</strong> trong LocalWP.<br>
                        👉 Với LocalWP ở chế độ <em>localhost Router Mode</em>, hãy nhập <code>http://localhost:PORT</code> (ví dụ: <code>http://localhost:10040</code>) hoặc bấm nút <strong>Trust</strong> mục SSL trong LocalWP rồi dùng <code>https://...</code>
                    </p>
                <?php endif; ?>
            </div>

            <div style="margin-bottom:14px;">
                <label style="font-weight:600;display:block;margin-bottom:4px;">Connection Token (Bearer):</label>
                <input type="text" readonly value="<?php echo esc_attr($token); ?>" style="width:100%;font-family:monospace;background:#f8fafc;" onclick="this.select();" />
            </div>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="f2e_regenerate_token" />
                <?php wp_nonce_field('f2e_regenerate_token_action'); ?>
                <button type="submit" class="button button-secondary">🔄 Tạo Token Mới (Thu hồi Token cũ)</button>
            </form>
        </div>

        <!-- Card 2: Manual Upload Bundle / JSON -->
        <div style="background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:20px;">
            <h2 style="margin-top:0;">📦 2. Import File Thủ Công (.f2e.json / .json)</h2>
            <p>Nếu host chặn CORS hoặc bạn làm việc offline, hãy tải file <code>.f2e.json</code> (kèm ảnh + SVG + Tokens) từ Figma Plugin và upload tại đây:</p>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" enctype="multipart/form-data">
                <input type="hidden" name="action" value="f2e_upload_bundle" />
                <?php wp_nonce_field('f2e_upload_bundle_action'); ?>

                <div style="margin-bottom:10px;">
                    <label style="font-weight:600;display:block;margin-bottom:4px;">Chọn file (.f2e.json hoặc Elementor .json):</label>
                    <input type="file" name="f2e_file" accept=".json" required />
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                    <div>
                        <label style="font-weight:600;display:block;margin-bottom:4px;">Loại đích:</label>
                        <select name="target_type" style="width:100%;">
                            <option value="page">Trang (WP Page)</option>
                            <option value="elementor_library">Elementor Template / Theme Builder</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-weight:600;display:block;margin-bottom:4px;">Loại Template (Nếu chọn Library):</label>
                        <select name="template_type" style="width:100%;">
                            <option value="page">Page Template</option>
                            <option value="section">Section / Container</option>
                            <option value="header">Header (Elementor Pro)</option>
                            <option value="footer">Footer (Elementor Pro)</option>
                            <option value="single-post">Single Post (Elementor Pro)</option>
                            <option value="loop-item">Loop Item (Elementor Pro)</option>
                        </select>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
                    <div>
                        <label style="font-weight:600;display:block;margin-bottom:4px;">Chuẩn Elementor:</label>
                        <select name="elementor_version" style="width:100%;">
                            <option value="v3" selected>Elementor v3 (Flexbox/Grid)</option>
                            <option value="v4">Elementor v4 (Atomic)</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-weight:600;display:block;margin-bottom:4px;">ID Bài viết (0 = Tạo mới, &gt;0 = Re-sync):</label>
                        <input type="number" name="target_post_id" value="0" min="0" style="width:100%;" />
                    </div>
                </div>

                <button type="submit" class="button button-primary">📥 Upload &amp; Chuyển Đổi Sang Elementor</button>
            </form>
        </div>
    </div>
</div>
