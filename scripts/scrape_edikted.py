#!/usr/bin/env python3
"""
Scraper for https://edikted.com/collections/best-sellers
Fetches all product items and outputs a JSON array.
"""

import json
import time
import requests

BASE_URL = "https://edikted.com"
COLLECTION = "best-sellers"
PRODUCTS_API = f"{BASE_URL}/collections/{COLLECTION}/products.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

def fetch_page(page: int, limit: int = 250) -> list[dict]:
    params = {"limit": limit, "page": page}
    resp = requests.get(PRODUCTS_API, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json().get("products", [])


def build_item(product: dict) -> dict:
    """Map a Shopify product dict to the desired output shape."""
    # Collect all variant prices
    variants = product.get("variants", [])
    prices = [float(v["price"]) for v in variants if v.get("price")]
    sizes = list({v["option1"] for v in variants if v.get("option1")})

    # Use the lowest price as the displayed price
    price = min(prices) if prices else None
    compare_at_prices = [
        float(v["compare_at_price"])
        for v in variants
        if v.get("compare_at_price")
    ]
    compare_at_price = min(compare_at_prices) if compare_at_prices else None

    # Images
    images = [img["src"] for img in product.get("images", [])]

    # Product detail URL
    handle = product.get("handle", "")
    detail_url = f"{BASE_URL}/products/{handle}" if handle else None

    # Discount percentage
    discount_pct = None
    if price and compare_at_price and compare_at_price > 0:
        discount_pct = round((1 - price / compare_at_price) * 100)

    return {
        "id": product.get("id"),
        "title": product.get("title"),
        "detail_url": detail_url,
        "price": price,
        "currency": "EUR",
        "compare_at_price": compare_at_price,
        "discount_percent": discount_pct,
        "available_sizes": sorted(sizes),
        "product_type": product.get("product_type"),
        "tags": product.get("tags", []),
        "images": images,
        "thumbnail": images[0] if images else None,
        "created_at": product.get("created_at"),
        "updated_at": product.get("updated_at"),
    }


def main():
    all_items = []
    page = 1
    while True:
        print(f"Fetching page {page}...", flush=True)
        products = fetch_page(page)
        if not products:
            break
        for p in products:
            all_items.append(build_item(p))
        print(f"  → {len(products)} products (total so far: {len(all_items)})")
        if len(products) < 250:
            break
        page += 1
        time.sleep(0.5)  # polite delay

    print(f"\nTotal products collected: {len(all_items)}")

    output_path = "/workspace/edikted_best_sellers.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_items, f, ensure_ascii=False, indent=2)
    print(f"Saved to {output_path}")


if __name__ == "__main__":
    main()
