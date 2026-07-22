"""
Shopify-based store scraper for windsorstore.com and disturbia.co.uk
Fetches products per category using the Shopify products.json API
"""

import requests
import json
import time
import re
from datetime import datetime, timezone

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

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


def get_shopify_products(base_url: str, collection_handle: str, limit: int = 50) -> list:
    """Fetch products from a Shopify collection using the products.json API."""
    products = []
    page = 1

    while len(products) < limit:
        url = f"{base_url}/collections/{collection_handle}/products.json"
        params = {"limit": min(250, limit - len(products)), "page": page}

        try:
            resp = requests.get(url, headers=HEADERS, params=params, timeout=20)
            resp.raise_for_status()
        except Exception as exc:
            print(f"  ERROR fetching {url}: {exc}")
            break

        data = resp.json().get("products", [])
        if not data:
            break

        products.extend(data)
        if len(data) < params["limit"]:
            break
        page += 1
        time.sleep(0.3)

    return products[:limit]


def parse_shopify_product(product: dict, base_url: str, currency_label: str = "gbp") -> dict:
    """Convert raw Shopify product dict to our target format."""
    variants = product.get("variants", [])
    images = product.get("images", [])

    # Collect sizes from variant option titled 'Size'
    sizes = []
    colour_map = {}

    for v in variants:
        size_val = None
        colour_val = None
        options = product.get("options", [])
        for i, opt in enumerate(options):
            opt_name = opt.get("name", "").lower()
            v_val = v.get(f"option{i + 1}", "")
            if "size" in opt_name:
                size_val = v_val
            elif any(kw in opt_name for kw in ("colour", "color")):
                colour_val = v_val

        if size_val and size_val not in sizes:
            sizes.append(size_val)
        if colour_val:
            colour_map[colour_val] = True

    colours = list(colour_map.keys())

    # Price info from first available variant
    price = None
    compare_price = None
    if variants:
        v0 = variants[0]
        try:
            price = float(v0.get("price") or 0) or None
        except Exception:
            price = None
        try:
            cp = v0.get("compare_at_price")
            compare_price = float(cp) if cp else None
        except Exception:
            compare_price = None

    discount_percent = None
    if price and compare_price and compare_price > price:
        discount_percent = round((1 - price / compare_price) * 100, 1)

    thumbnail = None
    img_urls = []
    for img in images:
        src = img.get("src", "")
        if src:
            img_urls.append(src)
    if img_urls:
        thumbnail = img_urls[0]

    handle = product.get("handle", "")
    detail_url = f"{base_url}/products/{handle}" if handle else None

    price_key = f"price_{currency_label}"
    compare_key = f"compare_at_price_{currency_label}"

    return {
        "id": product.get("id"),
        "title": product.get("title"),
        "detail_url": detail_url,
        price_key: price,
        compare_key: compare_price,
        "discount_percent": discount_percent,
        "available_sizes": sizes,
        "colours": colours,
        "product_type": product.get("product_type", ""),
        "tags": product.get("tags", []),
        "thumbnail": thumbnail,
        "images": img_urls,
        "created_at": product.get("created_at"),
        "updated_at": product.get("updated_at"),
    }


def scrape_windsorstore(output_path: str):
    base_url = "https://www.windsorstore.com"
    print(f"Scraping {base_url}")

    # Map target categories to Windsor Store collection handles
    category_handles = {
        "Tops": "tops",
        "Tank Tops": "tops-tanks-tees",
        "Dresses": "dresses",
        "Pants": "bottoms-pants",
        "Shorts": "bottoms-shorts",
        "Skirts": "bottoms-skirts",
        "Swimwear": "bikinis-swim",
        "Outerwear": "jackets",
        "Sweaters": "sweaters-cardigans",
        "Loungewear": "intimates-sleepwear",
    }

    data = {}
    for category in TARGET_CATEGORIES:
        handle = category_handles[category]
        print(f"  Fetching {category} ({handle})...")
        raw_products = get_shopify_products(base_url, handle, ITEMS_PER_CATEGORY)
        parsed = [parse_shopify_product(p, base_url, "usd") for p in raw_products]
        data[category] = parsed
        print(f"    Got {len(parsed)} products")

    output = {
        "source": base_url,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "categories": TARGET_CATEGORIES,
        "items_per_category": ITEMS_PER_CATEGORY,
        "data": data,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"  Saved to {output_path}")


def scrape_disturbia(output_path: str):
    base_url = "https://www.disturbia.co.uk"
    print(f"\nScraping {base_url}")

    # Map target categories to verified Disturbia collection handles
    category_handles = {
        "Tops": "womens-tops",
        "Tank Tops": None,          # no dedicated collection; filter from all
        "Dresses": "womens-dresses",
        "Pants": "womens-trousers",
        "Shorts": "womens-shorts",
        "Skirts": "womens-skirts",
        "Swimwear": "womens-swimwear",
        "Outerwear": "womens-outerwear",
        "Sweaters": "womens-knitwear",
        "Loungewear": "womens-loungewear",
    }

    # Keywords that identify tank tops / sleeveless garments
    tank_top_keywords = {"tank", "cami", "camisole", "sleeveless", "vest", "strap"}

    data = {}
    for category in TARGET_CATEGORIES:
        handle = category_handles.get(category)

        if handle:
            print(f"  Fetching {category} ({handle})...")
            raw_products = get_shopify_products(base_url, handle, ITEMS_PER_CATEGORY)
        else:
            # Fallback: pull from broad collections and keyword-filter
            print(f"  Fetching {category} (keyword filter from womens-all)...")
            raw_products = get_shopify_products(base_url, "womens-all", 250)
            kws = tank_top_keywords if category == "Tank Tops" else {category.lower()}
            filtered = []
            for p in raw_products:
                combined = " ".join(
                    [p.get("title", ""), p.get("product_type", "")]
                    + p.get("tags", [])
                ).lower()
                if any(kw in combined for kw in kws):
                    filtered.append(p)
            raw_products = filtered[:ITEMS_PER_CATEGORY]

        parsed = [parse_shopify_product(p, base_url, "gbp") for p in raw_products]
        data[category] = parsed
        print(f"    Got {len(parsed)} products")

    output = {
        "source": base_url,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "categories": TARGET_CATEGORIES,
        "items_per_category": ITEMS_PER_CATEGORY,
        "data": data,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"  Saved to {output_path}")


if __name__ == "__main__":
    scrape_windsorstore("/workspace/output/windsorstore_by_category.json")
    scrape_disturbia("/workspace/output/disturbia_by_category.json")
    print("\nDone!")
