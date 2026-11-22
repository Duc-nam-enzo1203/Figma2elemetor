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
$assetWarnings = isset($_GET['asset_warnings']) ? (int) $_GET['asset_warnings'] : 0;

$hasElementor = defined('ELEMENTOR_VERSION');
$elVersion = $hasElementor ? (string) ELEMENTOR_VERSION : 'Chưa kích hoạt';
$hasPro = defined('ELEMENTOR_PRO_VERSION');
$isLocalHttp = str_starts_with($siteUrl, 'http://') && !str_contains($siteUrl, 'localhost') && !str_contains($siteUrl, '127.0.0.1');

$errLabels = [
    'no_file' => 'Chưa chọn file để tải lên.',
    'file_too_large' => 'File vượt quá giới hạn tối đa 15 MB.',
    'upload_error' => 'Quá trình tải file lên máy chủ bị gián đoạn hoặc lỗi PHP upload.',
    'invalid_json' => 'File JSON không hợp lệ hoặc bị hỏng cấu trúc.',
    'empty_payload' => 'File JSON không chứa phần tử Elementor hoặc node Figma hợp lệ nào.',
    'not_found' => 'Không tìm thấy bài viết hoặc template mục tiêu với ID đã nhập.',
    'save_failed' => 'Không thể lưu dữ liệu vào WordPress.',
    'forbidden' => 'Bạn không có quyền ghi đè bài viết mục tiêu này.',
];
$errText = $errLabels[$err] ?? $err;
?>
<style>
  .f2e-admin-wrap {
    max-width: 1040px;
    margin: 20px 20px 40px 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    color: #0f172a;
  }
  .f2e-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 20px;
  }
  .f2e-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .f2e-logo-mark {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: #0f172a;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .f2e-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .f2e-title-row h1 {
    margin: 0;
    padding: 0;
    font-size: 20px;
    font-weight: 700;
    line-height: 28px;
    color: #0f172a;
  }
  .f2e-version-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #e2e8f0;
  }
  .f2e-subtitle {
    margin: 4px 0 0 0;
    font-size: 13px;
    line-height: 20px;
    color: #475569;
  }
  .f2e-status-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .f2e-status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    font-size: 12px;
    font-weight: 500;
    color: #334155;
  }
  .f2e-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #16a34a;
    flex-shrink: 0;
  }
  .f2e-dot.warn {
    background: #d97706;
  }
  .f2e-alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 10px;
    margin-bottom: 20px;
    font-size: 13px;
    line-height: 20px;
  }
  .f2e-alert.success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }
  .f2e-alert.error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }
  .f2e-alert.warn {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
    margin-top: 12px;
    margin-bottom: 0;
    display: block;
    font-size: 12px;
  }
  .f2e-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
    gap: 20px;
    align-items: start;
  }
  .f2e-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .f2e-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }
  .f2e-card-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #0f172a;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .f2e-card-head h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #0f172a;
  }
  .f2e-card-desc {
    margin: 0 0 20px 0;
    font-size: 13px;
    line-height: 20px;
    color: #475569;
  }
  .f2e-field {
    margin-bottom: 16px;
  }
  .f2e-field label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    margin-bottom: 6px;
  }
  .f2e-input-group {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .f2e-input,
  .f2e-select {
    width: 100%;
    height: 36px;
    padding: 0 12px;
    font-size: 13px;
    color: #0f172a;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    box-sizing: border-box;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .f2e-input:focus,
  .f2e-select:focus {
    outline: none;
    border-color: #16a34a;
    background: #ffffff;
    box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.14);
  }
  .f2e-input.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
  }
  .f2e-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    text-decoration: none;
    white-space: nowrap;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  .f2e-btn-primary {
    background: #16a34a;
    color: #ffffff;
  }
  .f2e-btn-primary:hover {
    background: #15803d;
    color: #ffffff;
  }
  .f2e-btn-secondary {
    background: #ffffff;
    color: #334155;
    border-color: #cbd5e1;
  }
  .f2e-btn-secondary:hover {
    background: #f8fafc;
    border-color: #94a3b8;
    color: #0f172a;
  }
  .f2e-btn-icon {
    width: 36px;
    padding: 0;
    flex-shrink: 0;
  }
  .f2e-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .f2e-dropzone {
    position: relative;
    border: 1.5px dashed #cbd5e1;
    border-radius: 10px;
    background: #f8fafc;
    padding: 16px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .f2e-dropzone:hover,
  .f2e-dropzone.dragover {
    border-color: #16a34a;
    background: #f0fdf4;
  }
  .f2e-dropzone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }
  .f2e-dropzone-title {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 2px;
  }
  .f2e-dropzone-sub {
    font-size: 12px;
    color: #64748b;
  }
  .f2e-divider {
    height: 1px;
    background: #e2e8f0;
    margin: 20px 0;
  }
  .f2e-steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-top: 20px;
  }
  .f2e-step {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
  }
  .f2e-step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: #f1f5f9;
    color: #0f172a;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .f2e-step h3 {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }
  .f2e-step p {
    margin: 0;
    font-size: 12px;
    line-height: 18px;
    color: #475569;
  }
</style>

<div class="f2e-admin-wrap">
    <!-- Top Header & Live Status Strip -->
    <div class="f2e-header">
        <div class="f2e-brand">
            <div class="f2e-logo-mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                    <path d="M10 6.5h4"></path>
                    <path d="M17.5 10v4"></path>
                </svg>
            </div>
            <div>
                <div class="f2e-title-row">
                    <h1>F2E Bridge</h1>
                    <span class="f2e-version-pill">v<?php echo esc_html(F2E_BRIDGE_VERSION); ?></span>
                </div>
                <p class="f2e-subtitle">Kết nối trực tiếp Figma Desktop sang Elementor v3/v4, đồng bộ Global Styles, nén WebP &amp; Re-sync không ghi đè dữ liệu.</p>
            </div>
        </div>

        <div class="f2e-status-strip">
            <div class="f2e-status-chip">
                <span class="f2e-dot <?php echo $hasElementor ? '' : 'warn'; ?>"></span>
                <span>Elementor <?php echo esc_html($elVersion); ?><?php echo $hasPro ? ' + Pro' : ''; ?></span>
            </div>
            <div class="f2e-status-chip">
                <span class="f2e-dot"></span>
                <span>WebP &amp; SVG Sanitizer</span>
            </div>
        </div>
    </div>

    <!-- Action Feedback Notices -->
    <?php if ($msg === 'token_regenerated') : ?>
        <div class="f2e-alert success" role="status">
            <span>Đã tạo Connection Token mới. Token cũ đã bị thu hồi ngay lập tức — hãy cập nhật lại trong Figma Plugin.</span>
        </div>
    <?php elseif ($msg === 'imported' && $importedPostId > 0) : ?>
        <div class="f2e-alert success" role="status">
            <span>Đã nhập thiết kế thành công vào bài viết <strong>#<?php echo esc_html((string) $importedPostId); ?></strong>.</span>
            <a href="<?php echo esc_url(admin_url('post.php?post=' . $importedPostId . '&action=elementor')); ?>" class="f2e-btn f2e-btn-primary">Mở trong Elementor</a>
        </div>
    <?php endif; ?>

    <?php if ($err !== '') : ?>
        <div class="f2e-alert error" role="alert">
            <span>Không thể hoàn tất: <?php echo esc_html($errText); ?></span>
        </div>
    <?php endif; ?>

    <?php if ($assetWarnings > 0) : ?>
        <div class="f2e-alert warn" role="status" style="margin-bottom:20px;">
            <span>Lưu ý: Có <strong><?php echo esc_html((string) $assetWarnings); ?></strong> hình ảnh/SVG không thể lưu vào Media Library trong quá trình nhập (đã bỏ qua hoặc giữ URL dự phòng).</span>
        </div>
    <?php endif; ?>

    <!-- Main 2-Column Workspace -->
    <div class="f2e-grid">
        <!-- Card 1: Live Push Connection -->
        <section class="f2e-card" aria-labelledby="f2e-card-connect">
            <div class="f2e-card-head">
                <div class="f2e-card-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                </div>
                <h2 id="f2e-card-connect">Kết nối Live Push từ Figma</h2>
            </div>
            <p class="f2e-card-desc">Dán 2 thông số bên dưới vào tab <strong>Bước 4 → Kết nối Website</strong> trên Figma Plugin để đẩy trực tiếp trang, hình ảnh WebP và Global Styles.</p>

            <div class="f2e-field">
                <label for="f2e-site-url">WordPress Site URL</label>
                <div class="f2e-input-group">
                    <input id="f2e-site-url" type="text" class="f2e-input mono" readonly value="<?php echo esc_attr($siteUrl); ?>" />
                    <button type="button" class="f2e-btn f2e-btn-secondary" data-f2e-copy="f2e-site-url">Sao chép</button>
                </div>
                <?php if ($isLocalHttp) : ?>
                    <div class="f2e-alert warn">
                        <strong>Lưu ý LocalWP (HTTP .local):</strong> Figma chạy trên HTTPS nên có thể chặn HTTP tới tên miền <code>.local</code>. Hãy dùng <code>http://localhost:PORT</code> (Router Mode: localhost) hoặc bật <strong>Trust SSL</strong> trong LocalWP để dùng <code>https://</code>.
                    </div>
                <?php endif; ?>
            </div>

            <div class="f2e-field">
                <label for="f2e-bearer-token">Connection Token (Bearer)</label>
                <div class="f2e-input-group">
                    <input id="f2e-bearer-token" type="password" class="f2e-input mono" readonly value="<?php echo esc_attr($token); ?>" autocomplete="off" />
                    <button type="button" class="f2e-btn f2e-btn-secondary f2e-btn-icon" id="f2e-toggle-token" title="Hiện / ẩn Token" aria-label="Hiện hoặc ẩn Token">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button type="button" class="f2e-btn f2e-btn-secondary" data-f2e-copy="f2e-bearer-token">Sao chép</button>
                </div>
            </div>

            <div class="f2e-divider"></div>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" onsubmit="return confirm('Tạo token mới sẽ vô hiệu hóa token cũ ngay lập tức. Bạn chắc chắn muốn tiếp tục?');">
                <input type="hidden" name="action" value="f2e_regenerate_token" />
                <?php wp_nonce_field('f2e_regenerate_token_action'); ?>
                <button type="submit" class="f2e-btn f2e-btn-secondary">Tạo lại Token (Thu hồi Token cũ)</button>
            </form>
        </section>

        <!-- Card 2: Manual Bundle / JSON Import -->
        <section class="f2e-card" aria-labelledby="f2e-card-import">
            <div class="f2e-card-head">
                <div class="f2e-card-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </div>
                <h2 id="f2e-card-import">Nhập file thủ công (.f2e.json / .json)</h2>
            </div>
            <p class="f2e-card-desc">Dùng khi máy chủ chặn CORS hoặc làm việc offline. Hỗ trợ gói đầy đủ <code>.f2e.json</code> (kèm ảnh WebP/PNG, SVG &amp; Design System) và file Elementor JSON.</p>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" enctype="multipart/form-data">
                <input type="hidden" name="action" value="f2e_upload_bundle" />
                <?php wp_nonce_field('f2e_upload_bundle_action'); ?>

                <div class="f2e-field">
                    <label for="f2e-file-input">File thiết kế (tối đa 15 MB)</label>
                    <div class="f2e-dropzone" id="f2e-dropzone">
                        <input id="f2e-file-input" type="file" name="f2e_file" accept=".json,.f2e.json,application/json" required />
                        <div class="f2e-dropzone-title" id="f2e-file-label">Kéo thả file vào đây hoặc bấm để chọn</div>
                        <div class="f2e-dropzone-sub">Hỗ trợ .f2e.json và Elementor template .json</div>
                    </div>
                </div>

                <div class="f2e-row-2">
                    <div class="f2e-field">
                        <label for="f2e-target-type">Loại đích lưu</label>
                        <select id="f2e-target-type" name="target_type" class="f2e-select">
                            <option value="page">Trang (WP Page)</option>
                            <option value="elementor_library">Elementor Template / Theme Builder</option>
                        </select>
                    </div>
                    <div class="f2e-field">
                        <label for="f2e-template-type">Loại Template</label>
                        <select id="f2e-template-type" name="template_type" class="f2e-select">
                            <option value="page">Page Template</option>
                            <option value="section">Section / Container</option>
                            <option value="header">Header (Pro)</option>
                            <option value="footer">Footer (Pro)</option>
                            <option value="single-post">Single Post (Pro)</option>
                            <option value="loop-item">Loop Item (Pro)</option>
                        </select>
                    </div>
                </div>

                <div class="f2e-row-2">
                    <div class="f2e-field">
                        <label for="f2e-el-version">Chuẩn Elementor</label>
                        <select id="f2e-el-version" name="elementor_version" class="f2e-select">
                            <option value="v3" selected>Elementor v3 (Flexbox &amp; Grid)</option>
                            <option value="v4">Elementor v4 (Atomic)</option>
                        </select>
                    </div>
                    <div class="f2e-field">
                        <label for="f2e-post-id">ID bài viết (0 = Tạo mới)</label>
                        <input id="f2e-post-id" type="number" name="target_post_id" value="0" min="0" class="f2e-input" />
                    </div>
                </div>

                <div class="f2e-field">
                    <label for="f2e-page-layout">Page Layout (Elementor)</label>
                    <select id="f2e-page-layout" name="page_layout" class="f2e-select">
                        <option value="elementor_canvas" selected>Elementor Canvas (Toàn màn hình, ẩn Header/Footer)</option>
                        <option value="elementor_header_footer">Elementor Full Width (Giữ Header/Footer theme)</option>
                        <option value="default">Default (Theo Site Settings)</option>
                        <option value="elementor_theme">Theme</option>
                    </select>
                </div>

                <button type="submit" class="f2e-btn f2e-btn-primary" style="width:100%;">Tải lên &amp; Chuyển đổi sang Elementor</button>
            </form>
        </section>
    </div>

    <!-- 3-Step Quick Onboarding Strip -->
    <div class="f2e-steps" aria-label="Hướng dẫn nhanh">
        <div class="f2e-step">
            <span class="f2e-step-num">1</span>
            <h3>Cài Figma Plugin</h3>
            <p>Trong Figma Desktop, chọn <strong>Plugins → Development → Import plugin from manifest</strong> và trỏ tới <code>manifest.json</code>.</p>
        </div>
        <div class="f2e-step">
            <span class="f2e-step-num">2</span>
            <h3>Kết nối 1 lần</h3>
            <p>Sao chép <strong>Site URL</strong> và <strong>Bearer Token</strong> ở trên dán vào Figma Plugin. Hỗ trợ kết nối nhiều website cùng lúc.</p>
        </div>
        <div class="f2e-step">
            <span class="f2e-step-num">3</span>
            <h3>Push hoặc Ctrl + V</h3>
            <p>Chọn Frame trên Figma rồi bấm <strong>Live Push</strong> (khuyên dùng cho nhiều section) hoặc <strong>Copy JSON</strong> rồi dán <code>Ctrl + V</code> vào Elementor.</p>
        </div>
    </div>
</div>

<script>
(function () {
  document.querySelectorAll('[data-f2e-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-f2e-copy');
      var inp = document.getElementById(id);
      if (!inp) return;
      var val = inp.value;
      var done = function () {
        var orig = btn.textContent;
        btn.textContent = 'Đã chép';
        setTimeout(function () { btn.textContent = orig; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(done).catch(function () {});
      } else {
        var prevType = inp.type;
        inp.type = 'text';
        inp.select();
        document.execCommand('copy');
        inp.type = prevType;
        done();
      }
    });
  });

  var toggleBtn = document.getElementById('f2e-toggle-token');
  var tokenInp = document.getElementById('f2e-bearer-token');
  if (toggleBtn && tokenInp) {
    toggleBtn.addEventListener('click', function () {
      tokenInp.type = tokenInp.type === 'password' ? 'text' : 'password';
    });
  }

  var fileInp = document.getElementById('f2e-file-input');
  var fileLbl = document.getElementById('f2e-file-label');
  var dropzone = document.getElementById('f2e-dropzone');
  if (fileInp && fileLbl && dropzone) {
    fileInp.addEventListener('change', function () {
      if (fileInp.files && fileInp.files[0]) {
        var f = fileInp.files[0];
        var kb = Math.max(1, Math.round(f.size / 1024));
        fileLbl.textContent = f.name + ' (' + kb + ' KB)';
      }
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropzone.addEventListener(evt, function () { dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function () {
      dropzone.classList.remove('dragover');
    });
  }
})();
</script>
