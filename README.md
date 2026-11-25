<div align="center">

# ⚡ F2E Bridge — Figma to Elementor

**Chuyển đổi thiết kế Figma sang WordPress Elementor (v3 Flexbox/Grid & v4 Atomic) — Tự chủ 100%, chuẩn Dev Mode CSS, không giới hạn lượt xuất.**

[![Figma Plugin](https://img.shields.io/badge/Figma-Desktop%20Plugin-F24E1E?logo=figma&logoColor=white)](packages/figma-plugin/manifest.json)
[![WordPress](https://img.shields.io/badge/WordPress-6.4%2B-21759B?logo=wordpress&logoColor=white)](packages/wordpress-plugin/figma-to-elementor-bridge.php)
[![PHP](https://img.shields.io/badge/PHP-8.0%2B-777BB4?logo=php&logoColor=white)](packages/wordpress-plugin/figma-to-elementor-bridge.php)
[![Elementor](https://img.shields.io/badge/Elementor-v3%20%26%20v4%20Atomic-92003B?logo=elementor&logoColor=white)](packages/figma-plugin/src/exporters/elementor-compiler.js)
[![Widgets](https://img.shields.io/badge/Widgets-88%20Free%20%2B%20Pro-16A34A)](packages/figma-plugin/src/tagging/widget-resolver.js)
[![Self-Hosted](https://img.shields.io/badge/Hosting-Self--Hosted%20%7C%20Zero%20Limits-0F172A)](#-kiến-trúc--luồng-xử-lý)

[Tổng quan](#-tổng-quan) · [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống) · [Tính năng nổi bật](#-tính-năng-nổi-bật) · [Cài đặt nhanh](#-cài-đặt-nhanh) · [Cấu trúc dự án](#-cấu-trúc-dự-án) · [Kiểm thử](#-phát-triển--kiểm-thử)

</div>

---

## 📖 Tổng quan

**F2E Bridge** là bộ công cụ tự chủ (Self-hosted) kết nối trực tiếp **Figma Desktop** với **WordPress / Elementor**. Thay vì phụ thuộc vào Figma REST API (bị giới hạn rate-limit trên gói Free Starter) hoặc các dịch vụ SaaS tính phí theo credit, F2E Bridge trích xuất trực tiếp cây layer, ảnh raster, SVG và mã CSS Dev Mode ngay trên máy trạm của bạn, sau đó biên dịch sang cấu trúc Elementor chỉnh sửa được hoàn toàn.

```text
Figma Selection
   │
   ├─► 1. Layout & Responsive   (Auto-Layout / Virtual Inference + Desktop·Tablet·Mobile)
   ├─► 2. 3-Layer Widget Engine (Override → [tag]/Naming → Heuristics + Gemini Vision AI)
   ├─► 3. Dev Mode CSS & Tokens (getCSSAsync() + Global Colors / Typography)
   └─► 4. Fidelity Auto-Healer  (Kiểm định & tự sửa layout, icon-box, container trước xuất)
          │
          ▼
   Elementor v3 (Flexbox / Grid) │ Elementor v4 (Atomic) │ Ctrl+V │ Live Push │ .f2e.json
```

---

## ⚙️ Yêu cầu hệ thống

| Thành phần | Phiên bản / Điều kiện | Ghi chú |
|---|---|---|
| **WordPress** | `6.4+` | Cần kích hoạt REST API |
| **PHP** | `8.0+` (khuyên dùng `8.2+`) | Yêu cầu `DOMDocument` / `libxml` để sanitize SVG |
| **Elementor** | `3.x` (Free) hoặc `4.x` (Atomic) | Hỗ trợ cả Flexbox/Grid Container và Atomic Widgets |
| **Elementor Pro** | Tùy chọn | Mở khóa đầy đủ Form, Nav Menu, Flip Box, Slides, Loop Grid, CTA |
| **Figma** | Mọi gói (kể cả Free Starter) | Chạy qua **Figma Desktop** (Development Plugin) |

---

## ✨ Tính năng nổi bật

| Nhóm chức năng | Chi tiết kỹ thuật |
|---|---|
| **Chạy cục bộ, Zero Limits** | Không cần Figma PAT hay credit SaaS; cắt ảnh PNG/JPG/WebP (1x/2x) và inline SVG trực tiếp qua Figma Plugin API. |
| **Dev Mode CSS Engine** | Khai thác `node.getCSSAsync()`, giải biến `var(--token, fallback)`, giữ nguyên gradient đa điểm dừng, bo góc từng phía, box/inner shadow, `backdrop-filter`, `background-clip: text` và **Border Gradient Dual-Clipping**. |
| **Chuẩn hóa Container** | Hỗ trợ Flexbox (`row` / `column` / `wrap`) & CSS Grid; giữ đúng kích thước `FIXED` (`px`), `HUG` (`auto`/`none`), `FILL` (`grow`/`stretch`); tự động unwrap container bọc thừa để làm sạch DOM. |
| **88 Widget & 3-Layer Resolver** | Bao phủ **88** loại phần tử Elementor Free + Pro (`flip-box`, `nested-accordion`, `nested-tabs`, `form`, `nav-menu`, `price-table`, `slides`, `testimonial`, `icon-box`, v.v.) qua 3 tầng: Tag UI → Tiền tố `[btn]`/`[form]` → Heuristics + Gemini Vision AI. |
| **Fidelity Verifier & Auto-Healer** | Tự động phát hiện và sửa các lỗi thường gặp trước khi xuất: chặn `__globals__` ảo ghi đè màu/font, chuyển `icon-box` chứa inline SVG phức tạp sang Flexbox Container `[HTML SVG + Text]`, cân cột multi-column row, chống rớt chữ trên wrapper `HUG`. |
| **Design System Sync** | Quét Figma Color Variables & Text Styles, ánh xạ sang Elementor Global Colors & Global Fonts và đồng bộ 1-click lên Site Settings. |
| **3 Kênh Xuất Bản** | **(1) Copy & Paste (`Ctrl+V`)** trực tiếp vào Elementor Editor; **(2) Live Push & Incremental Re-sync** qua REST API theo `_f2e_node_id`; **(3) Offline Bundle** `.f2e.json` / `.json`. |
| **Quản lý Media & Bảo mật** | Chống trùng lặp ảnh bằng **SHA-256** (`AssetStore`), tự động gộp background nhiều lớp (Composite Background Baking), làm sạch SVG chống XSS (`AssetStore::sanitizeSvg`), xác thực kết nối bằng Token + CORS Policy. |

---

## 🚀 Cài đặt nhanh

### 1. Cài đặt WordPress Plugin
1. Copy thư mục [`packages/wordpress-plugin`](packages/wordpress-plugin) vào `wp-content/plugins/f2e-bridge` (hoặc nén thành file `.zip` rồi tải lên tại **WP Admin → Plugins → Add New → Upload Plugin**).
2. Kích hoạt plugin **F2E Bridge — Figma to Elementor (Free & Pro)**.
3. Mở menu **F2E Bridge** trong WP Admin để lấy **Site URL** và **Connection Token**.

### 2. Cài đặt Figma Plugin
1. Mở ứng dụng **Figma Desktop** và mở file thiết kế bất kỳ.
2. Chọn **Plugins → Development → Import plugin from manifest...** và trỏ tới [`packages/figma-plugin/manifest.json`](packages/figma-plugin/manifest.json).
3. Chạy plugin từ **Plugins → Development → F2E Bridge — Figma to Elementor (Free & Pro)**.

### 3. Chuyển đổi trong 4 bước
1. **Bước 1 — Bố cục & Responsive:** Tối ưu Frame bằng *Fix & Optimize Layout* (không phá vỡ thiết kế gốc) và chọn chế độ Responsive.
2. **Bước 2 — Widget & AI:** Kiểm tra hoặc gắn lại loại widget trên cây Layer (hỗ trợ gắn thẻ nhanh, tiền tố `[tag]`, hoặc phân tích bằng Gemini Vision AI).
3. **Bước 3 — Design System:** Xem trước và đồng bộ Global Colors / Typography lên WordPress Site Settings.
4. **Bước 4 — Xuất bản:**
   - **Nhanh nhất:** Bấm **Sao chép Elementor JSON (`Ctrl + V`)**, sang Elementor Editor và bấm `Ctrl+V`.
   - **Đồng bộ trực tiếp:** Dùng **Live Push** để đẩy vào Page / Theme Builder Template và **Re-sync** khi thiết kế thay đổi.
   - **Ngoại tuyến:** Tải `.f2e.json` hoặc `.json` để import thủ công qua WP Admin / Elementor Templates.

---

## 📁 Cấu trúc dự án

```text
packages/
├── figma-plugin/
│   ├── manifest.json                 # Figma Desktop Plugin manifest (figma + dev)
│   ├── dist/code.js                  # Sandbox bundle đã build
│   ├── scripts/build.mjs             # Bundler tạo dist/code.js & src/ui/index.html
│   ├── src/
│   │   ├── extraction/               # Trích xuất IR, Dev Mode CSS, ảnh & SVG
│   │   ├── optimizer/                # Virtual Auto-Layout & Non-destructive Analyzer
│   │   ├── tagging/                  # 3-Layer Widget Resolver (88 widgets)
│   │   ├── exporters/                # Elementor v3/v4 Compiler, Pro Widgets, Fidelity Verifier
│   │   └── ui/                       # Giao diện 4-step stepper & Live Dev Mode CSS Inspector
│   └── tests/                        # E2E schema, image pipeline & compiler tests
└── wordpress-plugin/
    ├── figma-to-elementor-bridge.php # Bootstrap plugin WordPress (WP 6.4+, PHP 8.0+)
    ├── admin/                        # Trang quản trị F2E Bridge & Import thủ công
    ├── src/
    │   ├── API/                      # REST endpoints, TokenAuth, CorsPolicy
    │   ├── Elementor/                # TranspilerV3, TranspilerV4, DocumentWriter, GlobalStyles
    │   └── Media/                    # AssetStore (SHA-256 deduplication & SVG sanitizer)
    └── tests/                        # PHP unit/integration tests & editor-bridge tests
```

---

## 🧪 Phát triển & Kiểm thử

Sau khi chỉnh sửa mã nguồn trong `packages/figma-plugin/src/` hoặc `packages/wordpress-plugin/src/`, chạy build và kiểm thử toàn bộ:

```bash
# 1. Build Figma plugin bundle (dist/code.js + src/ui/index.html)
npm run build

# 2. Chạy toàn bộ Node.js test suite (Figma plugin + Editor Bridge)
npm test

# 3. Chạy PHP test suite cho Transpiler, AssetStore, Auth & REST API
php packages/wordpress-plugin/tests/transpiler-test.php
```

---

## 🔒 Bảo mật & Quyền riêng tư

- Không lưu trữ bất kỳ URL, Connection Token hay API key mặc định nào trong mã nguồn repository.
- Mọi kết nối **Live Push** xác thực qua Token với chính sách CORS kiểm soát origin chặt chẽ (`CorsPolicy`).
- Toàn bộ Inline SVG đi qua `AssetStore::sanitizeSvg` để loại bỏ script, event handler và CSS độc hại trước khi lưu vào Media Library.

---

<div align="center">
  <sub>Phát hành theo giấy phép <strong>GPL-2.0-or-later</strong> · Figma, WordPress và Elementor là thương hiệu thuộc sở hữu của các chủ sở hữu tương ứng.</sub>
</div>
