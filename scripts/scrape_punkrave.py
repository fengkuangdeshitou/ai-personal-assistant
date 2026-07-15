#!/usr/bin/env python3
"""
Scraper for https://punkrave.ch
Fetches ~50 items from each of the 10 standard clothing categories.
Output format mirrors edikted_by_category.json / disturbia_by_category.json.
"""

import json
import os
import time
import datetime
import requests

BASE_URL = "https://punkrave.ch"

# 10 standard categories → best matching punkrave.ch collection handles
# (Swimwear / Sweaters / Loungewear have no dedicated collection on this site)
CATEGORIES = [
    {"handle": "tops",                    "label": "Tops"},
    {"handle": "tank-tops",               "label": "Tank Tops"},
    {"handle": "women-dresses",           "label": "Dresses"},
    {"handle": "bottoms-1",               "label": "Pants"},
    {"handle": "shorts",                  "label": "Shorts"},
    {"handle": "skirts",                  "label": "Skirts"},
    {"handle": "outerwear",               "label": "Outerwear"},
    {"handle": "coats-jackets-for-women", "label": "Sweaters"},
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

TARGET = 50


def fetch_products(handle: str, limit: int = 50) -> list[dict]:
    url = f"{BASE_URL}/collections/{handle}/products.json"
    try:
        resp = requests.get(url, params={"limit": limit, "page": 1},
                            headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            print(f"  [{resp.status_code}] '{handle}' – skipping")
            return []
        return resp.json().get("products", [])
    except Exception as e:
        print(f"  [ERROR] {handle}: {e}")
        return []


def build_item(product: dict) -> dict:
    variants = product.get("variants", [])
    prices = [float(v["price"]) for v in variants if v.get("price")]

    # Detect option slots: option1=Size, option2=Color (confirmed from site)
    options = {o["name"].lower(): o["position"] for o in product.get("options", [])}
    size_pos   = options.get("size", 1)
    colour_pos = options.get("color", options.get("colour", 2 if size_pos == 1 else 1))
    size_key   = f"option{size_pos}"
    colour_key = f"option{colour_pos}"

    sizes   = sorted({v.get(size_key)   for v in variants if v.get(size_key)})
    colours = sorted({v.get(colour_key) for v in variants
                      if v.get(colour_key) and colour_pos != size_pos})

    price = min(prices) if prices else None
    compare_raw = [
        float(v["compare_at_price"])
        for v in variants if v.get("compare_at_price")
    ]
    compare_at_price = min(compare_raw) if compare_raw else None

    discount_pct = None
    if price and compare_at_price and compare_at_price > price:
        discount_pct = round((1 - price / compare_at_price) * 100)

    images = [img["src"] for img in product.get("images", [])]
    handle = product.get("handle", "")

    return {
        "id":                   product.get("id"),
        "title":                product.get("title"),
        "detail_url":           f"{BASE_URL}/products/{handle}" if handle else None,
        "price_chf":            price,
        "compare_at_price_chf": compare_at_price,
        "discount_percent":     discount_pct,
        "available_sizes":      [s for s in sizes if s],
        "colours":              [c for c in colours if c],
        "product_type":         product.get("product_type"),
        "tags":                 product.get("tags", []),
        "thumbnail":            images[0] if images else None,
        "images":               images,
        "created_at":           product.get("created_at"),
        "updated_at":           product.get("updated_at"),
    }


def main():
    result: dict[str, list] = {}
    valid_categories: list[str] = []

    for cat in CATEGORIES:
        handle, label = cat["handle"], cat["label"]
        print(f"Fetching '{label}' ({handle})…", flush=True)
        products = fetch_products(handle, limit=TARGET)
        if products:
            items = [build_item(p) for p in products]
            result[label] = items
            valid_categories.append(label)
            print(f"  → {len(items)} items")
        else:
            print(f"  → skipped (no data)")
        time.sleep(1.0)

    total = sum(len(v) for v in result.values())
    print(f"\nTotal: {total} items across {len(result)} categories")

    output = {
        "source":             BASE_URL,
        "scraped_at":         datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "categories":         valid_categories,
        "items_per_category": TARGET,
        "data":               result,
    }

    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    os.makedirs(desktop, exist_ok=True)
    out_path = os.path.join(desktop, "punkrave_by_category.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Saved → {out_path}")
    return out_path


if __name__ == "__main__":
    main()
