# ⚡ F2E Bridge — Figma to Elementor (Free & Pro, v3 + v4, Zero Limits)

**F2E Bridge** là giải pháp chuyển đổi thiết kế tự chủ (Self-hosted) toàn diện nhất hiện nay từ **Figma (gói Free Starter)** sang **WordPress Elementor (Free & Pro)**. Hoàn toàn **miễn phí**, **không giới hạn lượt xuất**, **không tốn credit** (như UIChemy hay UiChemy Pro), và **không bị giới hạn 6–20 requests/tháng của Figma REST API**.

---

## 🌟 Tính Năng & Sức Mạnh Vượt Trội

### 1. 🎯 Tự Chủ 100% — Zero Limits & Chạy Trực Tiếp Cục Bộ
- **Không tốn chi phí:** Hoạt động độc lập không cần mua credit, không cần đăng ký gói trả phí của bất kỳ nền tảng trung gian nào.
- **Bypass giới hạn Figma REST API:** Thay vì gọi API đám mây bị bóp băng thông nghiêm ngặt (6–20 requests/tháng trên Figma Free Starter), F2E Bridge chạy trực tiếp dưới dạng **Figma Desktop Plugin**, đọc bộ nhớ cây layer và render/cắt hình ảnh, SVG hoàn toàn bằng CPU máy trạm của bạn.

---

### 2. 🎨 Figma Dev Mode CSS Engine & Độ Chuẩn Xác Tuyệt Đối (Pixel-Perfect Fidelity)
- **Khai thác Figma Dev Mode CSS:** Sử dụng bộ phân tích kết hợp `node.getCSSAsync()` cùng engine độc quyền để trích xuất chuẩn xác 100% các thuộc tính CSS như màu sắc, gradient đa điểm dừng, bóng đổ (Box Shadow nội/ngoại), bo góc từng phía, và backdrop blur.
- **Xử lý viền Linear Gradient (Border Gradient Dual-Clipping):** Do Elementor không hỗ trợ gradient cho đường viền (Border), F2E Bridge tự động phát hiện và sinh mã CSS tùy chỉnh 2 lớp tiên tiến:
  ```css
  selector {
    border: 1px solid transparent !important;
    background: #FFFFFF padding-box, linear-gradient(180deg, #64A14F 0%, #038132 100%) border-box !important;
  }
  ```
- **Chữ màu Gradient (Gradient Text):** Tự động sinh `background-clip: text` và `-webkit-text-fill-color: transparent` cho các khối Heading, Counter hoặc Text Editor.

---

### 3. 🛡️ Post-Convert Fidelity Verifier & Auto-Healer (Tự Động Sửa Lỗi Giao Diện)
- **Auto-Heal Multi-column Rows:** Tự động phát hiện các hàng ngang chứa nhiều thẻ/cột (Cards, Services, Features) và gán `flex-grow: 1; flex-basis: 0%` hoặc `min-width` phù hợp, ngăn chặn triệt để tình trạng thẻ bị co cụm hoặc tràn khung khi sang Elementor.
- **Auto-Heal SVG Icon-Box:** Tự động nhận diện cụm Vector + Tiêu đề + Nội dung để chuyển đổi thành widget **Icon Box** chuẩn hoặc cấu trúc Flexbox căn giữa hoàn hảo.
- **Bảo toàn tỷ lệ Hug / Fill Width:** Giữ nguyên vẹn tỷ lệ co giãn giữa các khối nội dung, ngăn chặn hiện tượng rớt dòng hoặc méo bố cục trên các kích thước màn hình khác nhau.

---

### 4. 🧹 Tối Ưu Container Chuẩn Senior Developer (Auto-Unwrap Redundant Containers)
- **Dọn dẹp container lồng nhau:** Loại bỏ hoàn toàn các thẻ Flexbox Container bọc ngoài vô nghĩa (wrapper rỗng không mang style riêng).
- **Thuật toán Flatten DOM thông minh:** Khi phát hiện Container cha chỉ chứa duy nhất 1 Container con và container con đó chứa các phần tử nội dung trực tiếp, hệ thống tự động unwrap, chuyển các thuộc tính style (padding, background, border) lên container cha. Giúp DOM sạch sẽ, giảm độ sâu DOM và tối ưu điểm số Google PageSpeed / Core Web Vitals tối đa.
- **Bảo toàn layout đa khối:** Tự động nhận biết và giữ nguyên các container khi đóng vai trò phân chia cột hoặc khối anh em (siblings).

---

### 5. 🔘 Tự Động Nhận Diện Button Icon & Dynamic Styling
- **Tách Icon trong Button thông minh:** Tự động quét và phát hiện các biểu tượng (Vector, SVG, FontAwesome) nằm bên trong cụm Button.
- **Ánh xạ vào Native Elementor Button Widget:** Tự động điền icon vào thuộc tính `selected_icon`, tính toán chính xác hướng hiển thị (`icon_align`: `left` hoặc `right`), và tự động sinh khoảng cách `icon_indent` theo đúng thiết kế Figma.
- **Đầy đủ kiểu dáng:** Hỗ trợ đầy đủ các dạng nút bấm: Solid Color, Gradient Fill, Border Outline, Shadow nổi khối và các trạng thái Hover.

---

### 6. 🧭 Quy Trình 4 Bước Chuẩn Mực (Interactive 4-Step Stepper)
Plugin tích hợp giao diện điều hướng 4 bước trực quan, dẫn dắt từ bản vẽ thô đến website hoàn chỉnh:
1. **Bước 1: Bố cục & Responsive (Layout Fixer & Adaptive Matrix)**
   - Nút *Fix & Optimize Layout*: Tự động gom các vector rời rạc thành Icon duy nhất và chuyển đổi các Frame thiết kế tự do sang Figma Auto-Layout.
   - Cơ chế *Virtual Auto-Layout*: Tự động suy luận bố cục `row`/`column`, `gap`, `padding` ngay cả khi thiết kế quên bật Auto-Layout.
   - Ma trận Responsive: Tự động tính toán thông số màn hình `_tablet` và `_mobile` từ 1 Frame Desktop, hoặc ghép 3 Frame (Desktop + Tablet + Mobile) thành 1 trang duy nhất.
2. **Bước 2: Nhận Diện Widget AI & Danh Mục 86 Widget Elementor**
   - Hỗ trợ toàn bộ **86 widgets** chính thức của Elementor (Free & Pro).
   - Cơ chế nhận diện 3 tầng: Gắn thẻ trực tiếp trên cây Layer UI $\rightarrow$ Quy ước tiền tố layer (`[btn]`, `[form]`, `[nav]`, `[accordion]`, `[tabs]`, v.v.) $\rightarrow$ Thuật toán đoán tự động (Smart Heuristics).
   - Tích hợp **Gemini Vision AI** phân tích giao diện thị giác các khối phức tạp để đề xuất widget tối ưu.
3. **Bước 3: Design System & Tokens (Global Colors & Typography)**
   - Quét toàn bộ bảng màu (Figma Color Variables) và kiểu chữ (Text Styles) trong thiết kế.
   - Chuyển đổi thành **Elementor Global Colors** (`globals/colors`) và **Elementor Global Fonts** (`globals/typography`).
   - Cung cấp nút đồng bộ 1-click trực tiếp lên WordPress Site Settings.
4. **Bước 4: Xuất Bản Đa Nền Tảng (Multi-Channel Exporters)**
   - Chọn định dạng ảnh (PNG trong suốt, JPG, WebP) và độ phân giải xuất (1x, 2x chuẩn Retina).
   - Hỗ trợ đầy đủ 3 phương thức chuyển đổi linh hoạt.

---

### 7. 🚀 3 Phương Thức Chuyển Đổi Siêu Tốc
1. **Sao chép & Dán trực tiếp (`Ctrl+V`):**
   - Bấm nút sao chép trên Figma Plugin, mở Elementor Editor và bấm `Ctrl+V`.
   - Script Editor Bridge tự động bắt dữ liệu clipboard, tạo widget/container và tự động upload toàn bộ ảnh Base64 vào WordPress Media Library trong tích tắc.
2. **Live Push & Incremental Re-sync qua REST API:**
   - Kết nối trực tiếp Figma với WordPress thông qua kết nối bảo mật Token.
   - Đẩy trực tiếp vào Trang (WP Page) hoặc Elementor Theme Builder Template (Header, Footer, Single Post, Archive, Loop Item).
   - **Cơ chế Incremental Re-sync độc quyền:** Ghi nhớ `_f2e_node_id` của từng layer. Khi bạn sửa một phần tử trên Figma, chỉ cần bấm Re-sync để cập nhật đúng phần tử đó mà không làm mất các chỉnh sửa khác trên trang WordPress.
3. **Gói Bundle Ngoại Tuyến (`.f2e.json` & `.json`):**
   - Xuất file `.f2e.json` (chứa toàn bộ cấu trúc trang, ảnh Base64, mã SVG và bộ Tokens).
   - Xuất file `.json` Elementor Template tiêu chuẩn để nhập thủ công khi website nằm trong mạng nội bộ hoặc bị chặn Firewall/CORS.

---

### 8. ⚡ Hỗ Trợ Song Song Elementor v3 & Elementor v4 (Atomic Widgets)
- **Elementor v3 (Mặc định):** Xuất ra cấu trúc Flexbox Container và CSS Grid Container hiện đại nhất, không sử dụng hệ thống Section/Column cũ kỹ.
- **Elementor v4 (Tùy chọn):** Sẵn sàng cho tương lai với hệ thống Atomic Widgets mới nhất của Elementor (`e-flexbox`, `e-heading`, `e-paragraph`, `e-button`, `e-image`, `e-svg`) kèm class-based responsive styling.

---

### 9. 🧩 Hỗ Trợ Toàn Diện Composite & Dynamic Widgets
- **Accordion & Toggle:** Tự động gom các cụm Title + Description thành các mục Accordion có thể đóng mở mượt mà.
- **Tabs (Tabbed Content):** Chuyển đổi các khối tab chuyển đổi nội dung thành widget Tabs hoàn chỉnh.
- **Counter & Milestones:** Tự động tách số đếm, tiền tố/hậu tố, tiêu đề phụ và gán hiệu ứng đếm số sinh động.
- **Form Liên Hệ:** Chuyển đổi các trường nhập liệu (Input, Textarea, Checkbox, Submit Button) thành widget Form với cấu trúc field chuẩn.
- **Testimonials & Reviews:** Tự động nhận diện avatar tròn, lời đánh giá, tên tác giả và chức danh.

---

### 10. 🔒 Quản Lý Media & Chống Trùng Lặp SHA-256
- **Asset Store thông minh:** Toàn bộ ảnh trích xuất được tính mã băm SHA-256. Nếu ảnh đã tồn tại trong WordPress Media Library, hệ thống tái sử dụng ngay lập tức thay vì upload trùng lặp.
- **Bộ lọc bảo mật SVG Sanitizer:** Mọi đoạn mã Inline SVG đều được làm sạch qua `AssetStore::sanitizeSvg`, loại bỏ hoàn toàn các script độc hại hoặc mã lạ (chống XSS).
- **Composite Background Baking:** Tự động gom các lớp hiệu ứng nền phức tạp (nhiều lớp phủ, blend mode, noise) thành một bức ảnh nền 2x duy nhất để website hiển thị mượt mà và nhẹ nhàng.

---

## 🚀 Hướng Dẫn Cài Đặt & Sử Dụng

### Bước 1: Cài Đặt Figma Plugin (Trên Figma Desktop)
1. Mở ứng dụng **Figma Desktop** và mở một file thiết kế bất kỳ.
2. Trên thanh menu trên cùng, chọn **Plugins** → **Development** → **Import plugin from manifest...**
3. Trỏ tới file:
   `packages/figma-plugin/manifest.json` trong thư mục dự án của bạn.
4. Mở plugin: **Plugins** → **Development** → **F2E Bridge — Figma to Elementor (Free & Pro)**.

### Bước 2: Cài Đặt WordPress Plugin
1. Copy thư mục `packages/wordpress-plugin` vào thư mục `wp-content/plugins/figma-to-elementor-bridge` của website WordPress (hoặc nén thư mục `wordpress-plugin` thành file `.zip` rồi vào **WP Admin → Plugins → Add New → Upload Plugin**).
2. Kích hoạt plugin **F2E Bridge — Figma to Elementor (Free & Pro)**.
3. Trong menu quản trị WordPress, mở menu **F2E Bridge** để lấy **WordPress Site URL** và **Connection Token** (hoặc dùng khu vực **Import File Thủ Công**).

### Bước 3: Chuyển Đổi Thiết Kế Từ Figma Sang Elementor
- **Cách 1: Sao chép & Dán trực tiếp (`Ctrl+V`) — Nhanh nhất:**
  1. Chọn Frame thiết kế trên Figma.
  2. Tại Bước 4 của Figma Plugin, bấm **⚡ Sao chép Elementor JSON (Ctrl + V)**.
  3. Mở trang Elementor Editor trên trình duyệt và bấm `Ctrl+V` (hoặc chuột phải chọn *Paste from other site*).
- **Cách 2: Đẩy trực tiếp qua REST API (Live Push & Re-sync):**
  1. Trong phần kết nối WordPress trên Figma Plugin, thêm **Site URL** và **Connection Token**.
  2. Chọn trang hoặc template cần cập nhật và bấm **🚀 Đẩy giao diện lên WordPress**.
  3. Khi cần sửa thiết kế, chỉ cần chọn lại frame và bấm đẩy lại với chế độ **Đồng bộ gia tăng (Re-sync)**.
- **Cách 3: Xuất file dự phòng (`.f2e.json` / `.json`):**
  1. Bấm **📥 Tải gói Bundle đầy đủ (.f2e.json)** hoặc **📄 Tải Elementor v3 (.json)**.
  2. Vào **WP Admin → F2E Bridge** (đối với `.f2e.json`) hoặc **Elementor → Templates → Import Templates** (đối với `.json`) để tải lên.

---

## 🧪 Phát Triển & Kiểm Thử

Khi cần chỉnh sửa mã nguồn của Figma Plugin trong `packages/figma-plugin/src/`, chạy các lệnh sau để đóng gói và kiểm thử tự động:

```bash
cd packages/figma-plugin
node scripts/build.mjs
node --test tests/plugin.test.mjs
node --test tests/image-pipeline-fixes.test.mjs tests/e2e-schema.test.mjs
```
