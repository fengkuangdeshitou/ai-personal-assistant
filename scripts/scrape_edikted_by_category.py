#!/usr/bin/env python3
"""
Scraper for https://edikted.com
Fetches ~30 items from each major clothing category and saves to Desktop.
"""

import json
import os
import time
import requests

BASE_URL = "https://edikted.com"

# Known Edikted collection handles (verified via Shopify collections API)
CATEGORIES = [
    {"handle": "tops",        "label": "Tops"},
    {"handle": "tank-tops",   "label": "Tank Tops"},
    {"handle": "dresses",     "label": "Dresses"},
    {"handle": "pants",       "label": "Pants"},
    {"handle": "shorts",      "label": "Shorts"},
    {"handle": "mini-skirts", "label": "Skirts"},
    {"handle": "swim",        "label": "Swimwear"},
    {"handle": "outerwear",   "label": "Outerwear"},
    {"handle": "sweaters",    "label": "Sweaters"},
    {"handle": "loungewear",  "label": "Loungewear"},
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

TARGET_PER_CATEGORY = 50


def fetch_products(handle: str, limit: int = 30) -> list[dict]:
    """Fetch up to `limit` products from a collection."""
    url = f"{BASE_URL}/collections/{handle}/products.json"
    params = {"limit": limit, "page": 1}
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
        if resp.status_code == 404:
            print(f"  [404] Collection '{handle}' not found, skipping.")
            return []
        resp.raise_for_status()
        return resp.json().get("products", [])
    except Exception as e:
        print(f"  [ERROR] {handle}: {e}")
        return []


def build_item(product: dict) -> dict:
    """Map a Shopify product dict to the desired output shape."""
    variants = product.get("variants", [])
    prices = [float(v["price"]) for v in variants if v.get("price")]

    # Shopify option order: option1=Color, option2=Size (confirmed via options field)
    options = {o["name"].lower(): o["position"] for o in product.get("options", [])}
    color_key = "option1" if options.get("color", 1) == 1 else "option2"
    size_key = "option2" if options.get("size", 2) == 2 else "option1"

    sizes = sorted({v.get(size_key) for v in variants if v.get(size_key)})
    colors = sorted({v.get(color_key) for v in variants if v.get(color_key)})

    price = min(prices) if prices else None
    compare_at_prices = [
        float(v["compare_at_price"])
        for v in variants
        if v.get("compare_at_price")
    ]
    compare_at_price = min(compare_at_prices) if compare_at_prices else None

    discount_pct = None
    if price and compare_at_price and compare_at_price > 0:
        discount_pct = round((1 - price / compare_at_price) * 100)

    images = [img["src"] for img in product.get("images", [])]
    handle = product.get("handle", "")

    return {
        "id": product.get("id"),
        "title": product.get("title"),
        "detail_url": f"{BASE_URL}/products/{handle}" if handle else None,
        "price_usd": price,
        "compare_at_price_usd": compare_at_price,
        "discount_percent": discount_pct,
        "available_sizes": [s for s in sizes if s],
        "colors": [c for c in colors if c],
        "product_type": product.get("product_type"),
        "tags": product.get("tags", []),
        "thumbnail": images[0] if images else None,
        "images": images,
        "created_at": product.get("created_at"),
        "updated_at": product.get("updated_at"),
    }


def main():
    result: dict[str, list] = {}
    valid_categories = []

    for cat in CATEGORIES:
        handle = cat["handle"]
        label = cat["label"]
        print(f"Fetching '{label}' ({handle})...", flush=True)

        products = fetch_products(handle, limit=TARGET_PER_CATEGORY)
        if products:
            items = [build_item(p) for p in products]
            result[label] = items
            valid_categories.append(label)
            print(f"  → {len(items)} items collected")
        else:
            print(f"  → skipped (no data)")

        time.sleep(1.2)  # polite delay to avoid rate limiting

    # Build final output
    output = {
        "source": "https://edikted.com",
        "scraped_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "categories": valid_categories,
        "items_per_category": TARGET_PER_CATEGORY,
        "data": result,
    }

    total = sum(len(v) for v in result.values())
    print(f"\nTotal items: {total} across {len(result)} categories")

    # Save to Desktop
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    os.makedirs(desktop, exist_ok=True)
    output_path = os.path.join(desktop, "edikted_by_category.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Saved to {output_path}")
    return output_path


if __name__ == "__main__":
    main()
