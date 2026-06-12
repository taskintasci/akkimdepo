"""
Haftalık Plan sayfası görsel test scripti.
Masaüstü ve mobil viewport'ta ekran görüntüsü alır.
"""
import http.server
import threading
import os
import time
from playwright.sync_api import sync_playwright

PORT = 8787
APP_DIR = r"c:\Users\taski\Desktop\Akkim_iip\akkim-plan-modern_v5"
OUT_DIR = r"c:\Users\taski\Desktop\Akkim_iip\screenshots"

os.makedirs(OUT_DIR, exist_ok=True)

# Basit HTTP sunucusu
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

os.chdir(APP_DIR)
server = http.server.HTTPServer(("", PORT), Handler)
thread = threading.Thread(target=server.serve_forever)
thread.daemon = True
thread.start()
print(f"Sunucu başladı: http://localhost:{PORT}")
time.sleep(1)

VIEWPORTS = [
    {"name": "desktop_1280", "width": 1280, "height": 800},
    {"name": "desktop_960",  "width": 960,  "height": 800},
    {"name": "mobile_390",   "width": 390,  "height": 844},
    {"name": "mobile_430",   "width": 430,  "height": 932},
]

def select_user_and_app(page):
    """Launcher -> kullanıcı sec -> Haftalık Plan'a git"""
    page.wait_for_load_state("domcontentloaded")
    time.sleep(2)

    # Misafir olarak gir
    page.locator(".user-card[data-id='misafir']").click()
    time.sleep(1)

    # Haftalık Plan kartına tıkla
    page.locator(".app-card[data-view='haftalik']").click()
    time.sleep(2)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for vp in VIEWPORTS:
        print(f"\n── {vp['name']} ({vp['width']}×{vp['height']}) ──")
        ctx = browser.new_context(
            viewport={"width": vp["width"], "height": vp["height"]},
            device_scale_factor=1,
        )
        page = ctx.new_page()

        # Konsol hatalarını yakala
        errors = []
        page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

        page.goto(f"http://localhost:{PORT}/index.html", wait_until="domcontentloaded")
        select_user_and_app(page)

        # 1. Tam sayfa
        path = os.path.join(OUT_DIR, f"{vp['name']}_01_full.png")
        page.screenshot(path=path, full_page=True)
        print(f"  ✓ {path}")

        # 2. Viewport (görünür alan)
        path = os.path.join(OUT_DIR, f"{vp['name']}_02_viewport.png")
        page.screenshot(path=path)
        print(f"  ✓ {path}")

        # 3. Header yakın plan
        header = page.locator(".app-header")
        if header.count():
            path = os.path.join(OUT_DIR, f"{vp['name']}_03_header.png")
            header.screenshot(path=path)
            print(f"  ✓ {path}")

        # 4. Toolbar yakın plan
        toolbar = page.locator(".haftalik-toolbar")
        if toolbar.count():
            path = os.path.join(OUT_DIR, f"{vp['name']}_04_toolbar.png")
            toolbar.screenshot(path=path)
            print(f"  ✓ {path}")

        # 5. Tablo başlığı yakın plan
        thead = page.locator(".haftalik-table thead")
        if thead.count():
            path = os.path.join(OUT_DIR, f"{vp['name']}_05_thead.png")
            thead.screenshot(path=path)
            print(f"  ✓ {path}")

        # 6. Sayfa aşağı scroll → thead sticky kontrolü
        page.evaluate("window.scrollBy(0, 400)")
        time.sleep(0.3)
        path = os.path.join(OUT_DIR, f"{vp['name']}_06_scrolled.png")
        page.screenshot(path=path)
        print(f"  ✓ {path}")
        page.evaluate("window.scrollTo(0, 0)")

        # 6. Boyut ve overflow bilgileri
        info = page.evaluate("""() => {
            const header  = document.querySelector('.app-header');
            const toolbar = document.querySelector('.haftalik-toolbar');
            const table   = document.querySelector('.haftalik-table');
            const outer   = document.querySelector('.haftalik-table-outer');
            return {
                viewport: { w: window.innerWidth, h: window.innerHeight },
                bodyScroll: { x: document.body.scrollWidth, y: document.body.scrollHeight },
                header:  header  ? { w: header.offsetWidth,  h: header.offsetHeight,  sticky: getComputedStyle(header).position  } : null,
                toolbar: toolbar ? { w: toolbar.offsetWidth, h: toolbar.offsetHeight, sticky: getComputedStyle(toolbar).position, minW: getComputedStyle(toolbar).minWidth } : null,
                table:   table   ? { w: table.offsetWidth,   minW: getComputedStyle(table).minWidth   } : null,
                outer:   outer   ? { w: outer.offsetWidth,   overflow: getComputedStyle(outer).overflow } : null,
            };
        }""")
        print(f"  📐 viewport: {info['viewport']}")
        print(f"  📐 body scroll: {info['bodyScroll']}")
        print(f"  📐 header:  {info['header']}")
        print(f"  📐 toolbar: {info['toolbar']}")
        print(f"  📐 table:   {info['table']}")
        print(f"  📐 outer:   {info['outer']}")

        if errors:
            print(f"  ⚠️  JS Hataları:")
            for e in errors[:5]:
                print(f"     {e}")

        ctx.close()

    browser.close()
    server.shutdown()
    print("\n✅ Test tamamlandı. Ekran görüntüleri:", OUT_DIR)
