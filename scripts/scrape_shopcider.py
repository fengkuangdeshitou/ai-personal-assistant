"""
Shopcider (www.shopcider.com) scraper using Playwright.

Key findings:
- Product containers: div.product-item
- Product links: a[href*='/goods/']
- Prices: div.product-item-main-price
- Use specific CID-based category URLs for accurate category filtering
- Capsule filters (div.capsule-wrapper) can further filter on-page

Category CID mapping discovered from site navigation:
- Tops: capsule click "Crop Tops & Camis" + supplemental blouses page
- Tank Tops: /category/tanks&camis-cid-2010
- Dresses: /category/dresses-cid-129832
- Pants: capsule click "Pants" + bottoms-cid-24
- Shorts: /category/shorts-cid-25
- Skirts: /category/skirts-cid-120622
- Swimwear: /category/bikini-sets-cid-2465
- Outerwear: /category/blazers&vests-cid-30 + coats
- Sweaters: /category/sweaters-cid-129627
- Loungewear: /category/loungewear-cid-5264
"""

import json
import re
import time
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

BASE_URL = "https://www.shopcider.com"

TARGET_CATEGORIES = [
    "Tops",
    "Tank Tops",
    "Dresses",
    "Pants",
    "Shorts",
    "Skirts",
    "Swimwear",
    "Outerwear",
    "Sweaters",
    "Loungewear",
]

ITEMS_PER_CATEGORY = 50

# Each entry: list of (url_slug, capsule_text_or_None)
# url_slug is navigated to; optional capsule_text triggers a capsule filter click
CATEGORY_SOURCES = {
    "Tops": [
        ("/category/blouses%26shirts-cid-22", None),
        ("/category/tees-cid-2444", None),
        ("/category/short-sleeves-cid-133809", None),
        ("/category/bodysuits-cid-2457", None),
    ],
    "Tank Tops": [
        ("/category/tanks%26camis-cid-2010", None),
        ("/category/tanks%26vests-cid-130007", None),
    ],
    "Dresses": [
        ("/category/midi-dresses-cid-2450", None),
        ("/category/mini-dresses-cid-2449", None),
        ("/category/maxi-dresses-cid-3587", None),
    ],
    "Pants": [
        ("/category/bottoms-cid-24", None),   # general bottoms, keyword-filtered below
        ("/category/jeans-cid-146464", None),
    ],
    "Shorts": [
        ("/category/shorts-cid-25", None),
        ("/category/shorts-cid-122526", None),
    ],
    "Skirts": [
        ("/category/skirts-cid-120622", None),
        ("/category/mini-skirts-cid-119814", None),
        ("/category/midi-skirts-cid-124727", None),
    ],
    "Swimwear": [
        ("/category/bikini-sets-cid-2465", None),
        ("/category/one-pieces-cid-2466", None),
        ("/category/3-piece-bikini-sets-cid-11209", None),
    ],
    "Outerwear": [
        ("/category/blazers%26vests-cid-30", None),
        ("/category/coats-cid-141183", None),
        ("/category/faux-fur%26fleece-cid-143356", None),
    ],
    "Sweaters": [
        ("/category/sweaters-cid-129627", None),
        ("/category/cardigans-cid-625", None),
        ("/category/sweatshirts%26hoodies-cid-226", None),
    ],
    "Loungewear": [
        ("/category/loungewear-cid-5264", None),
        ("/category/nightwear-cid-143366", None),
    ],
}

EXTRACT_JS = """
() => {
    const items = document.querySelectorAll("div.product-item");
    const results = [];
    const seenPaths = new Set();

    for (const item of items) {
        const link = item.querySelector("a[href*='/goods/']");
        if (!link) continue;

        const rawHref = link.getAttribute("href") || "";
        const path = rawHref.split("?")[0];  // strip query string
        if (!path || seenPaths.has(path)) continue;
        seenPaths.add(path);

        // Image
        const img = item.querySelector("img");
        let imgSrc = "";
        if (img) {
            imgSrc = img.src || img.getAttribute("data-src") || "";
            if (imgSrc.includes(",")) imgSrc = imgSrc.split(",")[0].trim().split(" ")[0];
        }

        // Price elements
        const mainPriceEl = item.querySelector(".product-item-main-price");
        const compPriceEl = item.querySelector(".product-item-compare-price");
        const mainPrice = mainPriceEl ? mainPriceEl.textContent.trim() : "";
        const comparePrice = compPriceEl ? compPriceEl.textContent.trim() : "";

        results.push({ path, imgSrc, mainPrice, comparePrice });
    }
    return results;
}
"""


def parse_price(s: str):
    if not s:
        return None
    nums = re.findall(r"[\d.]+", s.replace(",", ""))
    return float(nums[0]) if nums else None


def parse_product(raw: dict) -> dict:
    path = raw["path"]  # e.g. /goods/some-title-here-123456789

    id_match = re.search(r"-(\d{7,})$", path)
    product_id = int(id_match.group(1)) if id_match else None

    slug = path.replace("/goods/", "")
    if id_match:
        slug = slug[: -(len(id_match.group(0)))]
    title = slug.replace("-", " ").strip().title()

    main_price = parse_price(raw.get("mainPrice", ""))
    compare_price = parse_price(raw.get("comparePrice", ""))
    discount_percent = None
    if main_price and compare_price and compare_price > main_price:
        discount_percent = round((1 - main_price / compare_price) * 100, 1)

    img = raw.get("imgSrc", "") or ""
    img_clean = img.split("x-oss-process")[0].rstrip("?&/") if "x-oss-process" in img else img

    return {
        "id": product_id,
        "title": title,
        "detail_url": f"{BASE_URL}{path}",
        "price_usd": main_price,
        "compare_at_price_usd": compare_price,
        "discount_percent": discount_percent,
        "available_sizes": [],
        "colours": [],
        "product_type": "",
        "tags": [],
        "thumbnail": img_clean or None,
        "images": [img_clean] if img_clean else [],
        "created_at": None,
        "updated_at": None,
    }


def try_capsule_click(page, capsule_text: str) -> bool:
    """Try clicking a capsule-wrapper with the given text. Return True if clicked."""
    capsules = page.query_selector_all(".capsule-wrapper")
    for cap in capsules:
        try:
            txt = cap.inner_text().strip()
            if capsule_text.lower() in txt.lower():
                cap.scroll_into_view_if_needed()
                cap.click()
                return True
        except Exception:
            pass
    return False


def scrape_category(page, category: str, seen_ids: set) -> list:
    """Scrape a category by visiting one or more source URLs."""
    sources = CATEGORY_SOURCES[category]
    products = []

    for slug, capsule_text in sources:
        if len(products) >= ITEMS_PER_CATEGORY:
            break

        url = f"{BASE_URL}{slug}"
        print(f"    Loading {url}...")
        try:
            page.goto(url, timeout=30000, wait_until="networkidle")
        except Exception:
            try:
                page.goto(url, timeout=30000, wait_until="domcontentloaded")
            except Exception as exc:
                print(f"    ERROR: {exc}")
                continue

        time.sleep(2)

        # Optional capsule click to further filter
        if capsule_text:
            clicked = try_capsule_click(page, capsule_text)
            if clicked:
                print(f"    Clicked capsule: {capsule_text}")
                time.sleep(3)

        # Scroll to load more products
        for _ in range(3):
            page.evaluate("window.scrollBy(0, 1800)")
            time.sleep(1.2)

        raw_items = page.evaluate(EXTRACT_JS)
        print(f"    Found {len(raw_items)} product cards")

        for raw in raw_items:
            if len(products) >= ITEMS_PER_CATEGORY:
                break
            prod = parse_product(raw)
            if not prod["id"] or prod["id"] in seen_ids:
                continue
            # For Pants: keyword-filter from bottoms collection
            if category == "Pants":
                t = prod["title"].lower()
                pants_kws = {"pants", "trouser", "jean", "legging", "jogger", "capri", "culotte", "sweatpant"}
                exclude_kws = {"skirt", " short", "romper", "jumpsuit"}
                if not any(kw in t for kw in pants_kws):
                    continue
                if any(kw in t for kw in exclude_kws):
                    continue
            seen_ids.add(prod["id"])
            products.append(prod)

    return products


def scrape_shopcider(output_path: str):
    print(f"Scraping {BASE_URL}")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
        )
        page = context.new_page()

        # Warm up with homepage
        try:
            page.goto(BASE_URL, timeout=20000, wait_until="domcontentloaded")
            time.sleep(2)
        except Exception:
            pass

        data = {}
        global_seen_ids: set = set()

        for category in TARGET_CATEGORIES:
            print(f"  Fetching {category}...")
            # Each category gets its own seen set for dedup within category
            category_seen: set = set()
            items = scrape_category(page, category, category_seen)
            data[category] = items
            print(f"  -> {len(items)} items for {category}")
            time.sleep(1)

        browser.close()

    output = {
        "source": BASE_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "categories": TARGET_CATEGORIES,
        "items_per_category": ITEMS_PER_CATEGORY,
        "data": data,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"  Saved to {output_path}")


if __name__ == "__main__":
    scrape_shopcider("/workspace/output/shopcider_by_category.json")
    print("Done!")
