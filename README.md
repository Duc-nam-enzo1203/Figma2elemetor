# ⚡ F2E Bridge — Figma to Elementor (Free & Pro, v3 + v4, Zero Limits)

**F2E Bridge** là hệ thống cầu nối tự chủ (Self-hosted) giúp chuyển đổi thiết kế từ **Figma (gói Free Starter)** sang **WordPress Elementor (Free & Pro)** mà **không tốn credit** (như UIChemy) và **không bị khóa giới hạn 6–20 requests/tháng của Figma REST API**.

---

## 🌟 Điểm Nổi Bật

1. **Miễn phí 100% & Không giới hạn số lần xuất:**
   - Thay vì gọi Figma REST API Tier 1 (bị giới hạn 6–20 lần/tháng trên tài khoản Figma Free), F2E Bridge chạy dưới dạng **Figma Desktop Plugin** đọc trực tiếp cây thiết kế (`figma.currentPage.selection`) và cắt ảnh/SVG bằng CPU cục bộ.
2. **3 Phương Thức Chuyển Đổi Linh Hoạt:**
   - **① Copy & Paste Trực Tiếp (`Ctrl+V`):** Bấm 1 nút trên Figma Plugin rồi bấm `Ctrl+V` thẳng vào màn hình Elementor Editor đang mở (tự động upload ảnh Base64 lên Media Library).
   - **② Live Push & Incremental Re-sync:** Đẩy trực tiếp từ Figma lên một hoặc nhiều website WordPress qua REST API kèm cơ chế **Incremental Re-sync** (ghi nhớ `_f2e_node_id` để cập nhật đúng phần tử khi sửa thiết kế trên Figma mà không làm mất nội dung khác trên trang).
   - **③ Xuất File Dự Phòng (`.f2e.json` / `.json`):** Xuất gói Bundle đầy đủ (kèm ảnh Base64, SVG, Design Tokens) hoặc file Elementor Template `.json` chuẩn để upload thủ công khi host chặn CORS/Firewall.
3. **Hỗ Trợ Song Song Elementor v3 & Elementor v4:**
   - **Elementor v3 (Mặc định):** Flexbox Container & CSS Grid Container.
   - **Elementor v4 (Tùy chọn):** Atomic Widgets (`e-flexbox`, `e-heading`, `e-paragraph`, `e-button`, `e-image`, `e-svg`) kèm class-based responsive variants.
4. **Hệ Sinh Thái Widget Elementor Free + Pro (Nhận diện 3 lớp):**
   - **Lớp 1 — Gắn thẻ trực tiếp (UI Tagging):** Chọn loại widget cho từng layer ngay trên giao diện Figma Plugin (lưu bền vững bằng `setPluginData`).
   - **Lớp 2 — Quy ước đặt tên (Naming Convention):** Đặt tiền tố trong tên layer trên Figma như `[btn]`, `[form]`, `[nav]`, `[accordion]`, `[tabs]`, `[carousel]`, `[gallery]`, `[price-table]`, `[cta]`, `[flip-box]`, `[slides]`, `[loop-grid]`, `[skip]`.
   - **Lớp 3 — Tự động đoán thông minh (Smart Heuristics):** Tự nhận diện Heading (`H1`–`H6`), Text Editor, Button, Image, Icon (Inline SVG), Divider, Spacer, Icon Box, Image Box, Social Icons, Gallery, Form, Nav Menu.
5. **Tối Ưu Bố Cục Không Có Auto-Layout & Responsive Kép:**
   - **Auto-Layout Fixer:** Nút *"Fix & Optimize Layout"* ngay trên Figma Plugin tự động gom các nhóm Vector rời rạc thành Icon và chuyển các Frame thiết kế tự do sang Figma Auto-Layout.
   - **Virtual Auto-Layout Fallback:** Ngay cả khi quên bật Auto-Layout, bộ trích xuất vẫn tự động phân tích tọa độ để suy luận `row`/`column`/`grid`, `gap`, và `padding`.
   - **Responsive 1 Frame & 3 Frames:** Tự động sinh thông số `_tablet` và `_mobile` từ 1 Frame Desktop, đồng thời hỗ trợ ghép 3 Frame (Desktop + Tablet + Mobile) thành 1 trang Elementor duy nhất.
6. **Quản Lý Hình Ảnh & Global Design System:**
   - Tự động xuất nhóm Vector thành **Inline SVG** (đã qua bộ lọc bảo mật `AssetStore::sanitizeSvg`) và ảnh Raster (**PNG/JPG 1x/2x**) kèm mã băm **SHA-256** chống trùng lặp tuyệt đối trong WordPress Media Library.
   - Đồng bộ Figma Color Variables & Text Styles vào **Elementor Global Colors & Global Fonts (`__globals__`)**.

---

## 📂 Cấu Trúc Thư Mục Dự Án

```text
c:\Figma2elementor\
├── packages/
│   ├── figma-plugin/                  # Plugin chạy trên Figma Desktop
│   │   ├── manifest.json              # File manifest để import vào Figma Desktop
│   │   ├── dist/code.js               # Bản bundle hoàn chỉnh của Figma sandbox
│   │   ├── src/
│   │   │   ├── code.js                # Luồng chính của Figma Plugin
│   │   │   ├── ui/index.html          # Giao diện 4 Tab của Figma Plugin
│   │   │   ├── optimizer/             # Auto-Layout Fixer & Virtual Layout Inference
│   │   │   ├── tagging/               # Nhận diện 3 lớp cho Widget Free + Pro
│   │   │   ├── extraction/            # Trích xuất Layout, Style, Typography, SVG/Ảnh, Responsive
│   │   │   └── exporters/             # Biên dịch sang Elementor v3, v4 Atomic, và Clipboard Ctrl+V
│   │   └── tests/plugin.test.mjs      # Unit Tests cho Figma Plugin
│   │
│   └── wordpress-plugin/              # Plugin cài trên WordPress (F2E Bridge)
│       ├── figma-to-elementor-bridge.php
│       ├── admin/
│       │   ├── views/dashboard.php    # Trang quản trị Token & Upload file thủ công
│       │   └── js/editor-bridge.js    # Tích hợp Paste Ctrl+V & Auto-upload ảnh trong Elementor Editor
│       ├── src/
│       │   ├── Api/                   # REST API (/wp-json/f2e-bridge/v1/*) & CORS Policy
│       │   ├── Security/              # Quản lý & xác thực Bearer Connection Token
│       │   ├── Media/                 # SHA-256 Deduplicated Asset Store & SVG Sanitizer
│       │   └── Elementor/             # GlobalStyles, TranspilerV3, TranspilerV4, DocumentWriter (Re-sync)
│       └── tests/transpiler-test.php  # Unit Tests cho WordPress Plugin
└── _references/                       # Các repo tham khảo đã clone
```

---

## 🚀 Hướng Dẫn Cài Đặt & Sử Dụng

### Bước 1: Cài Đặt Figma Plugin (Trên Figma Desktop)
1. Mở ứng dụng **Figma Desktop** và mở một file thiết kế bất kỳ.
2. Trên thanh menu trên cùng, chọn **Plugins** → **Development** → **Import plugin from manifest...**
3. Trỏ tới file:
   `c:\Figma2elementor\packages\figma-plugin\manifest.json`
4. Chạy plugin bằng cách vào **Plugins** → **Development** → **F2E Bridge — Figma to Elementor (Free & Pro)**.

### Bước 2: Cài Đặt WordPress Plugin
1. Copy thư mục `c:\Figma2elementor\packages\wordpress-plugin` vào thư mục `wp-content/plugins/figma-to-elementor-bridge` của website WordPress (hoặc nén thư mục `wordpress-plugin` thành file `.zip` rồi vào **WP Admin → Plugins → Add New → Upload Plugin**).
2. Kích hoạt plugin **F2E Bridge — Figma to Elementor (Free & Pro)**.
3. Trong menu quản trị WordPress, mở **F2E Bridge** để lấy **WordPress Site URL** và **Connection Token** (hoặc dùng khu vực **Import File Thủ Công**).

### Bước 3: Chuyển Đổi Thiết Kế Từ Figma Sang Elementor
- **Cách 1 (Nhanh nhất — Copy & Paste `Ctrl+V`):**
  1. Chọn một Frame trên Figma.
  2. Trong tab **1. Copy & Export** của Figma Plugin, bấm **⚡ Copy Elementor JSON (Dán Ctrl+V vào Editor)**.
  3. Mở trang Elementor Editor trên trình duyệt và bấm `Ctrl+V` (hoặc chuột phải chọn *Paste from other site*).
- **Cách 2 (Đẩy trực tiếp — Live Push & Re-sync):**
  1. Mở tab **2. Live Push WP** trên Figma Plugin, bấm **+ Thêm Web** rồi dán **Site URL** và **Connection Token** từ WordPress.
  2. Chọn đích lưu (**WP Page** hoặc **Elementor Template / Theme Builder Header, Footer, Single, Loop Item**).
  3. Bấm **🚀 Push Selection sang WordPress**. Khi bạn chỉnh sửa thiết kế trên Figma, chỉ cần chọn lại trang đó và bấm Push với chế độ **Incremental Re-sync** để cập nhật đúng các phần tử đã sửa!
- **Cách 3 (Xuất file `.f2e.json` / `.json`):**
  1. Trong tab **1. Copy & Export**, bấm **📥 Tải Gói F2E Bundle Đầy Đủ (.f2e.json)** hoặc **📄 Tải Elementor v3 (.json)**.
  2. Vào **WP Admin → F2E Bridge** (đối với file `.f2e.json`) hoặc **Elementor → Templates → Import Templates** (đối với file `.json`) để tải lên.

---

## 🧪 Phát Triển & Kiểm Thử

Khi bạn chỉnh sửa mã nguồn của Figma Plugin trong `packages/figma-plugin/src/`, hãy chạy lệnh dưới đây để đóng gói lại `dist/code.js` và chạy bộ kiểm thử tự động:

```bash
cd c:\Figma2elementor\packages\figma-plugin
node scripts/build.mjs
node --test tests/plugin.test.mjs
```
