"""
Process H&M product data scraped via WebFetch from www2.hm.com.
Since H&M blocks Python requests from this environment, raw product
markdown text has been collected via the WebFetch tool and is embedded
here. This script parses those results and builds a structured JSON
matching the target schema.
"""

import json
import re
from datetime import datetime, timezone

BASE_URL = "https://www2.hm.com"

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

# ─────────────────────────────────────────────────────────────────────────────
# Raw WebFetch markdown content collected from H&M pages
# ─────────────────────────────────────────────────────────────────────────────

HM_PRODUCTS_PAGE = """
Save to Favorites Ponte Capri Pants
## Ponte Capri Pants
https://www2.hm.com/en_us/productpage.1316954001.html
$24.99

Save to Favorites Ribbed Button-Front Top
## Ribbed Button-Front Top
https://www2.hm.com/en_us/productpage.1343036002.html
$14.99

Save to Favorites Lace-Trimmed Skirt
## Lace-Trimmed Skirt
https://www2.hm.com/en_us/productpage.1330502003.html
$44.99

Save to Favorites Slacks
## Slacks
https://www2.hm.com/en_us/productpage.1295947001.html
$29.99

Save to Favorites Ribbed Button-Front Top
## Ribbed Button-Front Top
https://www2.hm.com/en_us/productpage.1343036004.html
$14.99

Save to Favorites Asymmetric Dual-Fabric Dress
## Asymmetric Dual-Fabric Dress
https://www2.hm.com/en_us/productpage.1338299002.html
$29.99

Save to Favorites Oversized Printed T-Shirt
## Oversized Printed T-Shirt
https://www2.hm.com/en_us/productpage.1341688020.html
$19.99

Save to Favorites Ribbed V-Neck Tank Top
## Ribbed V-Neck Tank Top
https://www2.hm.com/en_us/productpage.1343831002.html
$9.99

Save to Favorites Long-Sleeved Boat-Neck Top
## Long-Sleeved Boat-Neck Top
https://www2.hm.com/en_us/productpage.1351927001.html
$19.99

Save to Favorites Ribbed V-Neck Tank Top
## Ribbed V-Neck Tank Top
https://www2.hm.com/en_us/productpage.1343831001.html
$9.99

Save to Favorites Midi Skirt
## Midi Skirt
https://www2.hm.com/en_us/productpage.1246922049.html
$29.99

Save to Favorites Viscose-Blend Top with Keyhole Detail
## Viscose-Blend Top with Keyhole Detail
https://www2.hm.com/en_us/productpage.1340767001.html
$24.99

Save to Favorites Viscose-Blend Capri Pants
## Viscose-Blend Capri Pants
https://www2.hm.com/en_us/productpage.1343069001.html
$22.99

Save to Favorites Oversized Printed T-Shirt
## Oversized Printed T-Shirt
https://www2.hm.com/en_us/productpage.1341689025.html
$19.99

Save to Favorites Harper High Rise Wide Leg Jeans
## Harper High Rise Wide Leg Jeans
https://www2.hm.com/en_us/productpage.1045459082.html
$34.99

Save to Favorites Padded-Cup High-Leg Swimsuit
## Padded-Cup High-Leg Swimsuit
https://www2.hm.com/en_us/productpage.1343574001.html
$49.99

Save to Favorites Brazilian Bikini Bottoms
## Brazilian Bikini Bottoms
https://www2.hm.com/en_us/productpage.1318704005.html
$19.99

Save to Favorites Padded Bandeau Bikini Top
## Padded Bandeau Bikini Top
https://www2.hm.com/en_us/productpage.1327446004.html
$19.99

Save to Favorites Padded Triangle Bikini Top
## Padded Triangle Bikini Top
https://www2.hm.com/en_us/productpage.1338806003.html
$19.99

Save to Favorites Poplin Shirt Dress
## Poplin Shirt Dress
https://www2.hm.com/en_us/productpage.1365113001.html
$44.99

Save to Favorites Long-Sleeved Boat-Neck Top
## Long-Sleeved Boat-Neck Top
https://www2.hm.com/en_us/productpage.1351927003.html
$19.99

Save to Favorites Cotton T-shirt
## Cotton T-shirt
https://www2.hm.com/en_us/productpage.0963662002.html
$9.99

Save to Favorites Ribbed Tank Top
## Ribbed Tank Top
https://www2.hm.com/en_us/productpage.1257593007.html
$9.99

Save to Favorites Oversized T-shirt
## Oversized T-shirt
https://www2.hm.com/en_us/productpage.1246290001.html
$12.99

Save to Favorites Fitted T-Shirt
## Fitted T-Shirt
https://www2.hm.com/en_us/productpage.1341808001.html
$14.99

Save to Favorites Cotton T-shirt
## Cotton T-shirt
https://www2.hm.com/en_us/productpage.0963662180.html
$9.99

Save to Favorites Lace-Trimmed Cotton T-Shirt
## Lace-Trimmed Cotton T-Shirt
https://www2.hm.com/en_us/productpage.1367091003.html
$19.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541001.html
$17.99

Save to Favorites Lace-Trimmed Cotton T-Shirt
## Lace-Trimmed Cotton T-Shirt
https://www2.hm.com/en_us/productpage.1367091002.html
$19.99

Save to Favorites Long-Sleeved Cotton Top
## Long-Sleeved Cotton Top
https://www2.hm.com/en_us/productpage.1345596002.html
$19.99
"""

HM_NEW_ARRIVALS_PAGE = """
Save to Favorites Asymmetric Butterfly-Sleeved Top
## Asymmetric Butterfly-Sleeved Top
https://www2.hm.com/en_us/productpage.1347085005.html
$24.99

Save to Favorites Ponte Halterneck Top
## Ponte Halterneck Top
https://www2.hm.com/en_us/productpage.1347302002.html
$19.99

Save to Favorites One-Shoulder Dress with Twisted Detail
## One-Shoulder Dress with Twisted Detail
https://www2.hm.com/en_us/productpage.1348951001.html
$59.99

Save to Favorites Asymmetric Tie-Detail Dress
## Asymmetric Tie-Detail Dress
https://www2.hm.com/en_us/productpage.1349075002.html
$24.99

Save to Favorites Sleeveless Wrap Top
## Sleeveless Wrap Top
https://www2.hm.com/en_us/productpage.1348799002.html
$9.99

Save to Favorites Dressy Shorts
## Dressy Shorts
https://www2.hm.com/en_us/productpage.1344297001.html
$39.99

Save to Favorites Viscose-Blend Shorts with Belt
## Viscose-Blend Shorts with Belt
https://www2.hm.com/en_us/productpage.1346024001.html
$37.99

Save to Favorites Buckle-Detail Balloon-Leg Pants
## Buckle-Detail Balloon-Leg Pants
https://www2.hm.com/en_us/productpage.1349315001.html
$44.99

Save to Favorites Tie-Belt Barrel-Leg Pants
## Tie-Belt Barrel-Leg Pants
https://www2.hm.com/en_us/productpage.1355228001.html
$34.99

Save to Favorites Short-Sleeved Blazer
## Short-Sleeved Blazer
https://www2.hm.com/en_us/productpage.1349027001.html
$49.99

Save to Favorites Printed Cowl-Neck Dress
## Printed Cowl-Neck Dress
https://www2.hm.com/en_us/productpage.1349264001.html
$39.99

Save to Favorites Poplin Shirt Dress
## Poplin Shirt Dress
https://www2.hm.com/en_us/productpage.1365113002.html
$44.99

Save to Favorites Puff-Sleeved Blouse
## Puff-Sleeved Blouse
https://www2.hm.com/en_us/productpage.1350227002.html
$29.99

Save to Favorites Mom Slim-Fit High-Waist Ankle Jeans
## Mom Slim-Fit High-Waist Ankle Jeans
https://www2.hm.com/en_us/productpage.0941666089.html
$34.99

Save to Favorites Flared-Skirt Denim Dress
## Flared-Skirt Denim Dress
https://www2.hm.com/en_us/productpage.1328040002.html
$59.99

Save to Favorites Tie-Strap Viscose-Blend Dress
## Tie-Strap Viscose-Blend Dress
https://www2.hm.com/en_us/productpage.1361336002.html
$69.99

Save to Favorites Denim Bermuda Shorts
## Denim Bermuda Shorts
https://www2.hm.com/en_us/productpage.1353445002.html
$39.99

Save to Favorites Tiered Eyelet Embroidery Skirt
## Tiered Eyelet Embroidery Skirt
https://www2.hm.com/en_us/productpage.1359498002.html
$39.99

Save to Favorites Ruffle-Trimmed Lyocell Top
## Ruffle-Trimmed Lyocell Top
https://www2.hm.com/en_us/productpage.1351441001.html
$24.99

Save to Favorites Harper High Rise Wide Leg Jeans
## Harper High Rise Wide Leg Jeans
https://www2.hm.com/en_us/productpage.1045459080.html
$34.99

Save to Favorites Cotton Dress with Eyelet Embroidery
## Cotton Dress with Eyelet Embroidery
https://www2.hm.com/en_us/productpage.1346336001.html
$109.00

Save to Favorites Oversized Twill Jacket
## Oversized Twill Jacket
https://www2.hm.com/en_us/productpage.1346059003.html
$49.99

Save to Favorites Barrel Regular Waist Ankle Jeans
## Barrel Regular Waist Ankle Jeans
https://www2.hm.com/en_us/productpage.1353052001.html
$44.99

Save to Favorites Crepe Jersey Jacket
## Crepe Jersey Jacket
https://www2.hm.com/en_us/productpage.1356122003.html
$44.99

Save to Favorites Bubble-Hem Skirt
## Bubble-Hem Skirt
https://www2.hm.com/en_us/productpage.1344309001.html
$44.99

Save to Favorites Lace-Trimmed Viscose Top
## Lace-Trimmed Viscose Top
https://www2.hm.com/en_us/productpage.1347695002.html
$29.99

Save to Favorites Short Cotton Jacket
## Short Cotton Jacket
https://www2.hm.com/en_us/productpage.1358852001.html
$69.99

Save to Favorites Cargo Pants with Belt
## Cargo Pants with Belt
https://www2.hm.com/en_us/productpage.1349243001.html
$44.99

Save to Favorites Draped Tunic Dress
## Draped Tunic Dress
https://www2.hm.com/en_us/productpage.1344069004.html
$39.99

Save to Favorites Lyocell-Blend Drawstring Skirt
## Lyocell-Blend Drawstring Skirt
https://www2.hm.com/en_us/productpage.1359530001.html
$39.99

Save to Favorites Straight-Leg Pants with Belt
## Straight-Leg Pants with Belt
https://www2.hm.com/en_us/productpage.1343397003.html
$42.99

Save to Favorites Textured-Knit Tank Top
## Textured-Knit Tank Top
https://www2.hm.com/en_us/productpage.1365256002.html
$29.99

Save to Favorites Lace-Trimmed Blouse
## Lace-Trimmed Blouse
https://www2.hm.com/en_us/productpage.1359346001.html
$39.99

Save to Favorites Denim Wrap Shirt
## Denim Wrap Shirt
https://www2.hm.com/en_us/productpage.1342803001.html
$27.99

Save to Favorites Tie-Detail Boat-Neck Top
## Tie-Detail Boat-Neck Top
https://www2.hm.com/en_us/productpage.1342780001.html
$24.99

Save to Favorites Denim One-Shoulder Top
## Denim One-Shoulder Top
https://www2.hm.com/en_us/productpage.1342775001.html
$24.99

Save to Favorites Dressy Barrel-Leg Pants
## Dressy Barrel-Leg Pants
https://www2.hm.com/en_us/productpage.1342781001.html
$29.99

Save to Favorites Wide Low Waist Jeans
## Wide Low Waist Jeans
https://www2.hm.com/en_us/productpage.1342778001.html
$39.99

Save to Favorites Asymmetric Halterneck Top
## Asymmetric Halterneck Top
https://www2.hm.com/en_us/productpage.1350154003.html
$14.99

Save to Favorites Oversized Printed T-Shirt
## Oversized Printed T-Shirt
https://www2.hm.com/en_us/productpage.1341689029.html
$19.99

Save to Favorites Cutout Denim Dress
## Cutout Denim Dress
https://www2.hm.com/en_us/productpage.1343932001.html
$39.99

Save to Favorites Half-Zip Sweatshirt with Motif
## Half-Zip Sweatshirt with Motif
https://www2.hm.com/en_us/productpage.1350033001.html
$24.99

Save to Favorites Barrel High Waist Jeans
## Barrel High Waist Jeans
https://www2.hm.com/en_us/productpage.1348996007.html
$39.99

Save to Favorites Flared Tie-Detail Skirt
## Flared Tie-Detail Skirt
https://www2.hm.com/en_us/productpage.1344744001.html
$29.99

Save to Favorites Balloon-Sleeved Coated Jacket
## Balloon-Sleeved Coated Jacket
https://www2.hm.com/en_us/productpage.1346344002.html
$69.99

Save to Favorites Cable-Knit Viscose-Blend Sweater
## Cable-Knit Viscose-Blend Sweater
https://www2.hm.com/en_us/productpage.1340618004.html
$19.99

Save to Favorites Crinkled Satin Top
## Crinkled Satin Top
https://www2.hm.com/en_us/productpage.1340752002.html
$19.99

Save to Favorites Draped Halterneck Top
## Draped Halterneck Top
https://www2.hm.com/en_us/productpage.1350347001.html
$19.99

Save to Favorites Barrel-Leg High-Waist Jeans
## Barrel-Leg High-Waist Jeans
https://www2.hm.com/en_us/productpage.1309848010.html
$39.99

Save to Favorites Asymmetric Denim Skirt
## Asymmetric Denim Skirt
https://www2.hm.com/en_us/productpage.1327944003.html
$39.99

Save to Favorites Oversized Jacket with Belt
## Oversized Jacket with Belt
https://www2.hm.com/en_us/productpage.1346346001.html
$54.99

Save to Favorites Cutout Satin Top
## Cutout Satin Top
https://www2.hm.com/en_us/productpage.1340733002.html
$22.99

Save to Favorites Draped Jersey Dress
## Draped Jersey Dress
https://www2.hm.com/en_us/productpage.1343978001.html
$24.99

Save to Favorites Dual-Fabric Draped-Panel Dress
## Dual-Fabric Draped-Panel Dress
https://www2.hm.com/en_us/productpage.1338297002.html
$19.99

Save to Favorites Wide-Leg Regular Waist Jeans
## Wide-Leg Regular Waist Jeans
https://www2.hm.com/en_us/productpage.1344686002.html
$49.99

Save to Favorites Double-Breasted Denim Jacket
## Double-Breasted Denim Jacket
https://www2.hm.com/en_us/productpage.1346353001.html
$49.99

Save to Favorites Crinkled Asymmetric Top
## Crinkled Asymmetric Top
https://www2.hm.com/en_us/productpage.1343011001.html
$14.99
"""

HM_SWIMWEAR_PAGE = """
Save to Favorites Bikini Top
## Bikini Top
https://www2.hm.com/en_us/productpage.1338487003.html
$24.99

Save to Favorites Brazilian Bikini Bottoms
## Brazilian Bikini Bottoms
https://www2.hm.com/en_us/productpage.1348228002.html
$12.99

Save to Favorites Padded-Cup Swimsuit
## Padded-Cup Swimsuit
https://www2.hm.com/en_us/productpage.1318698005.html
$44.99

Save to Favorites Padded One-Shoulder Bikini Top
## Padded One-Shoulder Bikini Top
https://www2.hm.com/en_us/productpage.1344165001.html
$24.99

Save to Favorites Padded Bikini Top
## Padded Bikini Top
https://www2.hm.com/en_us/productpage.1343571002.html
$24.99

Save to Favorites Padded Triangle Bikini Top
## Padded Triangle Bikini Top
https://www2.hm.com/en_us/productpage.1344138001.html
$22.99

Save to Favorites Cheeky Bikini Bottoms
## Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1339307002.html
$19.99

Save to Favorites Padded-Cup High-Leg Swimsuit
## Padded-Cup High-Leg Swimsuit
https://www2.hm.com/en_us/productpage.1351306003.html
$49.99

Save to Favorites Tie Bikini Bottoms
## Tie Bikini Bottoms
https://www2.hm.com/en_us/productpage.1311419029.html
$12.99

Save to Favorites Halterneck Wrapover Beach Dress
## Halterneck Wrapover Beach Dress
https://www2.hm.com/en_us/productpage.1349832003.html
$29.99

Save to Favorites Push-Up Triangle Bikini Top
## Push-Up Triangle Bikini Top
https://www2.hm.com/en_us/productpage.1321607006.html
$24.99

Save to Favorites Tie Cheeky Bikini Bottoms
## Tie Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1319685010.html
$19.99

Save to Favorites Padded triangle bikini top
## Padded triangle bikini top
https://www2.hm.com/en_us/productpage.1327892005.html
$19.99

Save to Favorites Fine-Knit Beach Shorts
## Fine-Knit Beach Shorts
https://www2.hm.com/en_us/productpage.1357515002.html
$29.99

Save to Favorites Cheeky Bikini Bottoms
## Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1343852001.html
$19.99

Save to Favorites Halterneck Wrapover Beach Dress
## Halterneck Wrapover Beach Dress
https://www2.hm.com/en_us/productpage.1349832001.html
$29.99

Save to Favorites Long Cotton Shirt
## Long Cotton Shirt
https://www2.hm.com/en_us/productpage.1225768001.html
$24.99

Save to Favorites Padded Triangle Bikini Top
## Padded Triangle Bikini Top
https://www2.hm.com/en_us/productpage.1298180018.html
$14.99

Save to Favorites Padded Triangle Bikini Top
## Padded Triangle Bikini Top
https://www2.hm.com/en_us/productpage.1349480001.html
$22.99

Save to Favorites Cheeky Bikini Bottoms
## Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1293114057.html
$9.99

Save to Favorites Cotton muslin beach shorts
## Cotton muslin beach shorts
https://www2.hm.com/en_us/productpage.1330881004.html
$24.99

Save to Favorites Tie Thong Bikini Bottoms
## Tie Thong Bikini Bottoms
https://www2.hm.com/en_us/productpage.1351010006.html
$14.99

Save to Favorites Padded Triangle Bikini Top
## Padded Triangle Bikini Top
https://www2.hm.com/en_us/productpage.1338349002.html
$19.99

Save to Favorites Cheeky Bikini Bottoms
## Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1293114056.html
$9.99

Save to Favorites Padded Triangle Bikini Top
## Padded Triangle Bikini Top
https://www2.hm.com/en_us/productpage.1298180002.html
$14.99

Save to Favorites Loose-Fit Beach Shorts
## Loose-Fit Beach Shorts
https://www2.hm.com/en_us/productpage.1315652001.html
$29.99

Save to Favorites Tie Bikini Bottoms
## Tie Bikini Bottoms
https://www2.hm.com/en_us/productpage.1311419025.html
$12.99

Save to Favorites Padded-Cup High-Leg Swimsuit
## Padded-Cup High-Leg Swimsuit
https://www2.hm.com/en_us/productpage.1343574002.html
$49.99

Save to Favorites Padded Bikini Top
## Padded Bikini Top
https://www2.hm.com/en_us/productpage.1339308002.html
$19.99

Save to Favorites Padded Bikini Top
## Padded Bikini Top
https://www2.hm.com/en_us/productpage.1344276001.html
$24.99

Save to Favorites Padded Triangle Bikini Top
## Padded Triangle Bikini Top
https://www2.hm.com/en_us/productpage.1338349001.html
$19.99

Save to Favorites Oversized Beach Shirt
## Oversized Beach Shirt
https://www2.hm.com/en_us/productpage.1315651001.html
$39.99

Save to Favorites Cheeky Bikini Bottoms
## Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1321296008.html
$19.99

Save to Favorites Cheeky Bikini Bottoms
## Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1293114060.html
$9.99

Save to Favorites Cheeky Bikini Bottoms
## Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1268221019.html
$12.99
"""

HM_TOPS_PAGE = """
Save to Favorites Ribbed Button-Front Top
## Ribbed Button-Front Top
https://www2.hm.com/en_us/productpage.1343036002.html
$14.99

Save to Favorites Ribbed Button-Front Top
## Ribbed Button-Front Top
https://www2.hm.com/en_us/productpage.1343036004.html
$14.99

Save to Favorites Oversized Printed T-Shirt
## Oversized Printed T-Shirt
https://www2.hm.com/en_us/productpage.1341688020.html
$19.99

Save to Favorites Ribbed V-Neck Tank Top
## Ribbed V-Neck Tank Top
https://www2.hm.com/en_us/productpage.1343831002.html
$9.99

Save to Favorites Long-Sleeved Boat-Neck Top
## Long-Sleeved Boat-Neck Top
https://www2.hm.com/en_us/productpage.1351927001.html
$19.99

Save to Favorites Ribbed V-Neck Tank Top
## Ribbed V-Neck Tank Top
https://www2.hm.com/en_us/productpage.1343831001.html
$9.99

Save to Favorites Viscose-Blend Top with Keyhole Detail
## Viscose-Blend Top with Keyhole Detail
https://www2.hm.com/en_us/productpage.1340767001.html
$24.99

Save to Favorites Oversized Printed T-Shirt
## Oversized Printed T-Shirt
https://www2.hm.com/en_us/productpage.1341689025.html
$19.99

Save to Favorites Printed T-Shirt
## Printed T-Shirt
https://www2.hm.com/en_us/productpage.1330170033.html
$12.99

Save to Favorites Draped Viscose Top
## Draped Viscose Top
https://www2.hm.com/en_us/productpage.1347125003.html
$14.99

Save to Favorites Fitted Modal T-Shirt
## Fitted Modal T-Shirt
https://www2.hm.com/en_us/productpage.1347186001.html
$9.99

Save to Favorites Batwing-Sleeved Viscose Top
## Batwing-Sleeved Viscose Top
https://www2.hm.com/en_us/productpage.1351938003.html
$19.99

Save to Favorites Draped Viscose Top
## Draped Viscose Top
https://www2.hm.com/en_us/productpage.1347125002.html
$14.99

Save to Favorites Oversized Printed T-Shirt
## Oversized Printed T-Shirt
https://www2.hm.com/en_us/productpage.1341688019.html
$19.99

Save to Favorites Fitted Modal T-Shirt
## Fitted Modal T-Shirt
https://www2.hm.com/en_us/productpage.1347186008.html
$9.99

Save to Favorites Long-Sleeved Boat-Neck Top
## Long-Sleeved Boat-Neck Top
https://www2.hm.com/en_us/productpage.1351927003.html
$19.99

Save to Favorites Cotton T-shirt
## Cotton T-shirt
https://www2.hm.com/en_us/productpage.0963662002.html
$9.99

Save to Favorites Ribbed Tank Top
## Ribbed Tank Top
https://www2.hm.com/en_us/productpage.1257593007.html
$9.99

Save to Favorites Oversized T-shirt
## Oversized T-shirt
https://www2.hm.com/en_us/productpage.1246290001.html
$12.99

Save to Favorites Fitted T-Shirt
## Fitted T-Shirt
https://www2.hm.com/en_us/productpage.1341808001.html
$14.99

Save to Favorites Cotton T-shirt
## Cotton T-shirt
https://www2.hm.com/en_us/productpage.0963662180.html
$9.99

Save to Favorites Lace-Trimmed Cotton T-Shirt
## Lace-Trimmed Cotton T-Shirt
https://www2.hm.com/en_us/productpage.1367091003.html
$19.99

Save to Favorites Lace-Trimmed Cotton T-Shirt
## Lace-Trimmed Cotton T-Shirt
https://www2.hm.com/en_us/productpage.1367091002.html
$19.99

Save to Favorites Long-Sleeved Cotton Top
## Long-Sleeved Cotton Top
https://www2.hm.com/en_us/productpage.1345596002.html
$19.99

Save to Favorites Cotton T-shirt
## Cotton T-shirt
https://www2.hm.com/en_us/productpage.0963662167.html
$9.99

Save to Favorites Fitted Microfiber T-shirt
## Fitted Microfiber T-shirt
https://www2.hm.com/en_us/productpage.1142908008.html
$12.99

Save to Favorites Lace-Trimmed Cotton T-Shirt
## Lace-Trimmed Cotton T-Shirt
https://www2.hm.com/en_us/productpage.1367091001.html
$19.99

Save to Favorites Long-sleeved Jersey Top
## Long-sleeved Jersey Top
https://www2.hm.com/en_us/productpage.1254718022.html
$14.99

Save to Favorites Ribbed Boat-Neck Top
## Ribbed Boat-Neck Top
https://www2.hm.com/en_us/productpage.1328441014.html
$12.99

Save to Favorites Oversized T-shirt
## Oversized T-shirt
https://www2.hm.com/en_us/productpage.1246290031.html
$12.99

Save to Favorites Oversized T-shirt
## Oversized T-shirt
https://www2.hm.com/en_us/productpage.1246290030.html
$12.99

Save to Favorites Ribbed Cotton Tank Top
## Ribbed Cotton Tank Top
https://www2.hm.com/en_us/productpage.1340697002.html
$12.99

Save to Favorites Cotton Polo Shirt
## Cotton Polo Shirt
https://www2.hm.com/en_us/productpage.1351340002.html
$19.99

Save to Favorites Fitted Microfiber T-shirt
## Fitted Microfiber T-shirt
https://www2.hm.com/en_us/productpage.1142908087.html
$12.99

Save to Favorites Printed Cotton T-Shirt
## Printed Cotton T-Shirt
https://www2.hm.com/en_us/productpage.1357162003.html
$19.99

Save to Favorites Draped Asymmetric Top
## Draped Asymmetric Top
https://www2.hm.com/en_us/productpage.1348991003.html
$14.99
"""

HM_PANTS_PAGE = """
Save to Favorites Ponte Capri Pants
## Ponte Capri Pants
https://www2.hm.com/en_us/productpage.1316954001.html
$24.99

Save to Favorites Slacks
## Slacks
https://www2.hm.com/en_us/productpage.1295947001.html
$29.99

Save to Favorites Viscose-Blend Capri Pants
## Viscose-Blend Capri Pants
https://www2.hm.com/en_us/productpage.1343069001.html
$22.99

Save to Favorites Slacks
## Slacks
https://www2.hm.com/en_us/productpage.1295947003.html
$29.99

Save to Favorites Capri Pants
## Capri Pants
https://www2.hm.com/en_us/productpage.1340768001.html
$24.99

Save to Favorites Crinkled Pull-On Pants
## Crinkled Pull-On Pants
https://www2.hm.com/en_us/productpage.1348995001.html
$19.99

Save to Favorites Wide-Leg Pants with Belt
## Wide-Leg Pants with Belt
https://www2.hm.com/en_us/productpage.1346094001.html
$34.99

Save to Favorites Crinkled Pull-On Pants
## Crinkled Pull-On Pants
https://www2.hm.com/en_us/productpage.1348995002.html
$19.99

Save to Favorites Crinkled Pull-On Pants
## Crinkled Pull-On Pants
https://www2.hm.com/en_us/productpage.1348995003.html
$19.99

Save to Favorites Flared Satin Pants
## Flared Satin Pants
https://www2.hm.com/en_us/productpage.1336592002.html
$24.99

Save to Favorites Pleated Drawstring Pants
## Pleated Drawstring Pants
https://www2.hm.com/en_us/productpage.1348986002.html
$24.99

Save to Favorites Wide-Leg Pants with Belt
## Wide-Leg Pants with Belt
https://www2.hm.com/en_us/productpage.1346094002.html
$34.99

Save to Favorites Pleated Drawstring Pants
## Pleated Drawstring Pants
https://www2.hm.com/en_us/productpage.1348986001.html
$24.99

Save to Favorites Drawstring-Detail Balloon-Leg Pants
## Drawstring-Detail Balloon-Leg Pants
https://www2.hm.com/en_us/productpage.1340919002.html
$19.99

Save to Favorites Flared Satin Pants
## Flared Satin Pants
https://www2.hm.com/en_us/productpage.1336592004.html
$24.99

Save to Favorites Crinkled Beach Pants
## Crinkled Beach Pants
https://www2.hm.com/en_us/productpage.1321089001.html
$29.99

Save to Favorites Wide-leg Joggers
## Wide-leg Joggers
https://www2.hm.com/en_us/productpage.1199249015.html
$19.99

Save to Favorites Slacks
## Slacks
https://www2.hm.com/en_us/productpage.1295947002.html
$29.99

Save to Favorites Wide-leg Joggers
## Wide-leg Joggers
https://www2.hm.com/en_us/productpage.1199249063.html
$19.99

Save to Favorites Knit Drawstring Pants
## Knit Drawstring Pants
https://www2.hm.com/en_us/productpage.1362514001.html
$24.99

Save to Favorites Wide-leg Joggers
## Wide-leg Joggers
https://www2.hm.com/en_us/productpage.1199249058.html
$19.99

Save to Favorites Wide-cut Pull-on Pants
## Wide-cut Pull-on Pants
https://www2.hm.com/en_us/productpage.1216645001.html
$19.99

Save to Favorites Flared Pull-On Pants
## Flared Pull-On Pants
https://www2.hm.com/en_us/productpage.1347632001.html
$29.99

Save to Favorites Wide-leg Joggers
## Wide-leg Joggers
https://www2.hm.com/en_us/productpage.1199249067.html
$19.99

Save to Favorites Jersey Drawstring Pants
## Jersey Drawstring Pants
https://www2.hm.com/en_us/productpage.1353714007.html
$27.99

Save to Favorites Wide-Leg Dress Pants
## Wide-Leg Dress Pants
https://www2.hm.com/en_us/productpage.1340460003.html
$39.99

Save to Favorites Tie-Belt Cargo Pants
## Tie-Belt Cargo Pants
https://www2.hm.com/en_us/productpage.1336390001.html
$29.99

Save to Favorites Dressy Linen-Blend Culottes
## Dressy Linen-Blend Culottes
https://www2.hm.com/en_us/productpage.1340897002.html
$24.99

Save to Favorites Drawstring-Detail Balloon-Leg Pants
## Drawstring-Detail Balloon-Leg Pants
https://www2.hm.com/en_us/productpage.1340919001.html
$19.99

Save to Favorites Dressy Barrel-Leg Pants
## Dressy Barrel-Leg Pants
https://www2.hm.com/en_us/productpage.1342781001.html
$29.99

Save to Favorites Slacks
## Slacks
https://www2.hm.com/en_us/productpage.1295947017.html
$29.99

Save to Favorites Straight-Leg Joggers
## Straight-Leg Joggers
https://www2.hm.com/en_us/productpage.1330301002.html
$19.99

Save to Favorites Crinkled Satin Pants
## Crinkled Satin Pants
https://www2.hm.com/en_us/productpage.1340756002.html
$19.99

Save to Favorites Satin Drawstring Pants
## Satin Drawstring Pants
https://www2.hm.com/en_us/productpage.1347595001.html
$39.99

Save to Favorites Wide-leg Joggers
## Wide-leg Joggers
https://www2.hm.com/en_us/productpage.1199249072.html
$19.99

Save to Favorites Balloon-Leg Poplin Pants
## Balloon-Leg Poplin Pants
https://www2.hm.com/en_us/productpage.1329534002.html
$24.99
"""

HM_SHORTS_PAGE = """
Save to Favorites Denim Shorts
## Denim Shorts
https://www2.hm.com/en_us/productpage.1336299002.html
$29.99

Save to Favorites Cotton Shorts
## Cotton Shorts
https://www2.hm.com/en_us/productpage.1333545003.html
$19.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1152096001.html
$12.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1329687008.html
$12.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1152096037.html
$12.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1152096071.html
$12.99

Save to Favorites Raw-Edge Denim Shorts
## Raw-Edge Denim Shorts
https://www2.hm.com/en_us/productpage.1337692007.html
$24.99

Save to Favorites Denim Bermuda Shorts
## Denim Bermuda Shorts
https://www2.hm.com/en_us/productpage.1353445001.html
$39.99

Save to Favorites Denim Bermuda Shorts
## Denim Bermuda Shorts
https://www2.hm.com/en_us/productpage.1327577013.html
$29.99

Save to Favorites Raw-Edge Denim Shorts
## Raw-Edge Denim Shorts
https://www2.hm.com/en_us/productpage.1337692001.html
$24.99

Save to Favorites Denim Bermuda Shorts
## Denim Bermuda Shorts
https://www2.hm.com/en_us/productpage.1343725002.html
$42.99

Save to Favorites Biking Shorts with SoftMove
## Biking Shorts with SoftMove
https://www2.hm.com/en_us/productpage.1255289068.html
$19.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1152096062.html
$12.99

Save to Favorites Dressy Linen-Blend Shorts
## Dressy Linen-Blend Shorts
https://www2.hm.com/en_us/productpage.1333444001.html
$29.99

Save to Favorites Biking Shorts with SoftMove
## Biking Shorts with SoftMove
https://www2.hm.com/en_us/productpage.1255289001.html
$19.99

Save to Favorites Pleat-Front Shorts
## Pleat-Front Shorts
https://www2.hm.com/en_us/productpage.1332567004.html
$24.99

Save to Favorites Denim Pull-On Shorts
## Denim Pull-On Shorts
https://www2.hm.com/en_us/productpage.1290168004.html
$24.99

Save to Favorites SoftMove Pocket Bike Shorts
## SoftMove Pocket Bike Shorts
https://www2.hm.com/en_us/productpage.1320452001.html
$24.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1152096072.html
$12.99

Save to Favorites Frayed Denim Shorts
## Frayed Denim Shorts
https://www2.hm.com/en_us/productpage.1331705001.html
$29.99

Save to Favorites Loose-Fit Beach Shorts
## Loose-Fit Beach Shorts
https://www2.hm.com/en_us/productpage.1315652002.html
$29.99

Save to Favorites Denim Pull-On Shorts
## Denim Pull-On Shorts
https://www2.hm.com/en_us/productpage.1336306001.html
$24.99

Save to Favorites Linen-Blend Bermuda Shorts
## Linen-Blend Bermuda Shorts
https://www2.hm.com/en_us/productpage.1344972002.html
$29.99

Save to Favorites Bermuda Shorts with Eyelet Embroidery
## Bermuda Shorts with Eyelet Embroidery
https://www2.hm.com/en_us/productpage.1350089001.html
$44.99

Save to Favorites High-Waist Denim Shorts
## High-Waist Denim Shorts
https://www2.hm.com/en_us/productpage.1327496005.html
$24.99

Save to Favorites Denim Pull-On Shorts
## Denim Pull-On Shorts
https://www2.hm.com/en_us/productpage.1290168006.html
$24.99

Save to Favorites Denim Bermuda Shorts
## Denim Bermuda Shorts
https://www2.hm.com/en_us/productpage.1353445002.html
$39.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1329687003.html
$12.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1152096063.html
$12.99

Save to Favorites Denim Pull-On Shorts
## Denim Pull-On Shorts
https://www2.hm.com/en_us/productpage.1290168005.html
$24.99

Save to Favorites Cotton Beach Shorts with Eyelet Embroidery
## Cotton Beach Shorts with Eyelet Embroidery
https://www2.hm.com/en_us/productpage.1343982001.html
$39.99

Save to Favorites Layered Sports Shorts with Pocket
## Layered Sports Shorts with Pocket
https://www2.hm.com/en_us/productpage.1317503018.html
$29.99
"""

HM_SKIRTS_PAGE = """
Save to Favorites Lace-Trimmed Skirt
## Lace-Trimmed Skirt
https://www2.hm.com/en_us/productpage.1330502003.html
$44.99

Save to Favorites Midi Skirt
## Midi Skirt
https://www2.hm.com/en_us/productpage.1246922049.html
$29.99

Save to Favorites Midi Skirt
## Midi Skirt
https://www2.hm.com/en_us/productpage.1246922058.html
$29.99

Save to Favorites Satin Slip Skirt
## Satin Slip Skirt
https://www2.hm.com/en_us/productpage.1345513001.html
$29.99

Save to Favorites Bubble-Hem Skirt
## Bubble-Hem Skirt
https://www2.hm.com/en_us/productpage.1344309001.html
$44.99

Save to Favorites Jersey Pencil Skirt
## Jersey Pencil Skirt
https://www2.hm.com/en_us/productpage.1349307001.html
$24.99

Save to Favorites Satin Slip Skirt
## Satin Slip Skirt
https://www2.hm.com/en_us/productpage.1345513003.html
$29.99

Save to Favorites Satin Slip Skirt
## Satin Slip Skirt
https://www2.hm.com/en_us/productpage.1345513002.html
$29.99

Save to Favorites Lace-Trimmed Skirt
## Lace-Trimmed Skirt
https://www2.hm.com/en_us/productpage.1330502004.html
$44.99

Save to Favorites Printed wrap skirt
## Printed wrap skirt
https://www2.hm.com/en_us/productpage.1351911002.html
$49.99

Save to Favorites Lace-Trimmed Skirt
## Lace-Trimmed Skirt
https://www2.hm.com/en_us/productpage.1330502005.html
$44.99

Save to Favorites Satin Maxi Skirt
## Satin Maxi Skirt
https://www2.hm.com/en_us/productpage.1350292001.html
$44.99

Save to Favorites Tiered Viscose Mini Skirt
## Tiered Viscose Mini Skirt
https://www2.hm.com/en_us/productpage.1314358001.html
$24.99

Save to Favorites Short Denim Skirt
## Short Denim Skirt
https://www2.hm.com/en_us/productpage.1322224001.html
$24.99

Save to Favorites Linen-Blend Slip Skirt
## Linen-Blend Slip Skirt
https://www2.hm.com/en_us/productpage.1348523001.html
$29.99

Save to Favorites Gathered Crepe Skirt
## Gathered Crepe Skirt
https://www2.hm.com/en_us/productpage.1350595002.html
$49.99

Save to Favorites Smocked-Waist Skirt
## Smocked-Waist Skirt
https://www2.hm.com/en_us/productpage.1348838001.html
$34.99

Save to Favorites Bubble-Hem Mini Skirt
## Bubble-Hem Mini Skirt
https://www2.hm.com/en_us/productpage.1346445001.html
$29.99

Save to Favorites Tie-Detail Poplin Skirt
## Tie-Detail Poplin Skirt
https://www2.hm.com/en_us/productpage.1328292002.html
$59.99

Save to Favorites Midi Skirt
## Midi Skirt
https://www2.hm.com/en_us/productpage.1246922051.html
$29.99

Save to Favorites Fringed Mini Skirt
## Fringed Mini Skirt
https://www2.hm.com/en_us/productpage.1338150003.html
$37.99

Save to Favorites Lace-Inset Cotton Skirt
## Lace-Inset Cotton Skirt
https://www2.hm.com/en_us/productpage.1333768002.html
$39.99

Save to Favorites Long Handkerchief Skirt
## Long Handkerchief Skirt
https://www2.hm.com/en_us/productpage.1348428001.html
$39.99

Save to Favorites Asymmetric Denim Skirt
## Asymmetric Denim Skirt
https://www2.hm.com/en_us/productpage.1327944003.html
$39.99

Save to Favorites Asymmetric Satin Skirt
## Asymmetric Satin Skirt
https://www2.hm.com/en_us/productpage.1340887005.html
$34.99

Save to Favorites Lace-Trimmed Satin Skirt
## Lace-Trimmed Satin Skirt
https://www2.hm.com/en_us/productpage.1330277003.html
$49.99

Save to Favorites Flounced Viscose-Blend Skirt
## Flounced Viscose-Blend Skirt
https://www2.hm.com/en_us/productpage.1357311001.html
$59.99

Save to Favorites Cotton Balloon Skirt
## Cotton Balloon Skirt
https://www2.hm.com/en_us/productpage.1358073001.html
$39.99

Save to Favorites Cupro-Blend Bubble-Hem Skirt
## Cupro-Blend Bubble-Hem Skirt
https://www2.hm.com/en_us/productpage.1345515001.html
$44.99

Save to Favorites Lace-Trimmed Lyocell-Blend Skirt
## Lace-Trimmed Lyocell-Blend Skirt
https://www2.hm.com/en_us/productpage.1354118001.html
$49.99

Save to Favorites Sheer Maxi Skirt
## Sheer Maxi Skirt
https://www2.hm.com/en_us/productpage.1329916004.html
$39.99

Save to Favorites Midi Skirt
## Midi Skirt
https://www2.hm.com/en_us/productpage.1184662001.html
$39.99

Save to Favorites Lace-Trimmed Tiered Skirt
## Lace-Trimmed Tiered Skirt
https://www2.hm.com/en_us/productpage.1346466001.html
$44.99
"""

HM_DRESSES_PAGE = """
Save to Favorites Asymmetric Dual-Fabric Dress
## Asymmetric Dual-Fabric Dress
https://www2.hm.com/en_us/productpage.1338299002.html
$29.99

Save to Favorites Lace-Trimmed Dress
## Lace-Trimmed Dress
https://www2.hm.com/en_us/productpage.1360779001.html
$49.99

Save to Favorites Button-Front Midi Dress
## Button-Front Midi Dress
https://www2.hm.com/en_us/productpage.1348924003.html
$34.99

Save to Favorites Dress with Flared Skirt
## Dress with Flared Skirt
https://www2.hm.com/en_us/productpage.1361330001.html
$44.99

Save to Favorites Tie-Belt Dress
## Tie-Belt Dress
https://www2.hm.com/en_us/productpage.1360182003.html
$44.99

Save to Favorites Tie-Belt Dress
## Tie-Belt Dress
https://www2.hm.com/en_us/productpage.1360182002.html
$44.99

Save to Favorites Button-Front Midi Dress
## Button-Front Midi Dress
https://www2.hm.com/en_us/productpage.1348924001.html
$34.99

Save to Favorites Printed Tiered Dress
## Printed Tiered Dress
https://www2.hm.com/en_us/productpage.1347763001.html
$49.99

Save to Favorites Knot-Detail Draped Dress
## Knot-Detail Draped Dress
https://www2.hm.com/en_us/productpage.1322235005.html
$49.99

Save to Favorites Printed Tiered Dress
## Printed Tiered Dress
https://www2.hm.com/en_us/productpage.1347763002.html
$49.99

Save to Favorites Button-Front Midi Dress
## Button-Front Midi Dress
https://www2.hm.com/en_us/productpage.1348924002.html
$34.99

Save to Favorites Tie-Back Poplin Dress
## Tie-Back Poplin Dress
https://www2.hm.com/en_us/productpage.1350110002.html
$44.99

Save to Favorites Tie-Strap Viscose-Blend Dress
## Tie-Strap Viscose-Blend Dress
https://www2.hm.com/en_us/productpage.1361336002.html
$69.99

Save to Favorites Lace-Detail Cotton Dress
## Lace-Detail Cotton Dress
https://www2.hm.com/en_us/productpage.1332593004.html
$69.99

Save to Favorites Printed Tiered Dress
## Printed Tiered Dress
https://www2.hm.com/en_us/productpage.1347763003.html
$49.99

Save to Favorites Crochet-Look Beach Dress
## Crochet-Look Beach Dress
https://www2.hm.com/en_us/productpage.1344212001.html
$49.99

Save to Favorites Halterneck Beach Dress
## Halterneck Beach Dress
https://www2.hm.com/en_us/productpage.1349033001.html
$29.99

Save to Favorites Poplin Shirt Dress
## Poplin Shirt Dress
https://www2.hm.com/en_us/productpage.1365113003.html
$44.99

Save to Favorites A-Line Strappy Dress
## A-Line Strappy Dress
https://www2.hm.com/en_us/productpage.1335518002.html
$44.99

Save to Favorites Midi Dress with Flared Skirt
## Midi Dress with Flared Skirt
https://www2.hm.com/en_us/productpage.1343565001.html
$49.99

Save to Favorites Tie-Belt Tunic Dress
## Tie-Belt Tunic Dress
https://www2.hm.com/en_us/productpage.1361333001.html
$49.99

Save to Favorites Crinkled Boat-Neck Dress
## Crinkled Boat-Neck Dress
https://www2.hm.com/en_us/productpage.1347439001.html
$39.99

Save to Favorites Tie-Detail Button-Front Dress
## Tie-Detail Button-Front Dress
https://www2.hm.com/en_us/productpage.1351648001.html
$39.99

Save to Favorites Lace-Trimmed Dress
## Lace-Trimmed Dress
https://www2.hm.com/en_us/productpage.1360779002.html
$49.99

Save to Favorites Tie-Detail Cutout Dress
## Tie-Detail Cutout Dress
https://www2.hm.com/en_us/productpage.1362957001.html
$59.99

Save to Favorites Cap-sleeved Dress
## Cap-sleeved Dress
https://www2.hm.com/en_us/productpage.1239334026.html
$24.99

Save to Favorites Cap-sleeved Dress
## Cap-sleeved Dress
https://www2.hm.com/en_us/productpage.1239334025.html
$24.99

Save to Favorites Sleeveless Crepe Dress
## Sleeveless Crepe Dress
https://www2.hm.com/en_us/productpage.1365117003.html
$39.99

Save to Favorites Short-Sleeved Shirt Dress
## Short-Sleeved Shirt Dress
https://www2.hm.com/en_us/productpage.1357622001.html
$34.99

Save to Favorites Wrap Midi Dress
## Wrap Midi Dress
https://www2.hm.com/en_us/productpage.1351647002.html
$49.99

Save to Favorites Satin Midi Dress
## Satin Midi Dress
https://www2.hm.com/en_us/productpage.1351651002.html
$49.99

Save to Favorites Short-Sleeved Shirt Dress
## Short-Sleeved Shirt Dress
https://www2.hm.com/en_us/productpage.1357622006.html
$34.99

Save to Favorites Draped Halterneck Dress
## Draped Halterneck Dress
https://www2.hm.com/en_us/productpage.1341041001.html
$19.99

Save to Favorites Smocked Strappy Dress
## Smocked Strappy Dress
https://www2.hm.com/en_us/productpage.1325468003.html
$19.99

Save to Favorites Viscose Tunic Dress
## Viscose Tunic Dress
https://www2.hm.com/en_us/productpage.1333631012.html
$19.99

Save to Favorites Lace-Inset Cotton Dress
## Lace-Inset Cotton Dress
https://www2.hm.com/en_us/productpage.1355887001.html
$49.99
"""

HM_LOUNGEWEAR_PAGE = """
Save to Favorites Long T-Shirt Dress
## Long T-Shirt Dress
https://www2.hm.com/en_us/productpage.1322872006.html
$24.99

Save to Favorites Jersey Capri Pants
## Jersey Capri Pants
https://www2.hm.com/en_us/productpage.1367475001.html
$19.99

Save to Favorites Cotton-Blend Pants
## Cotton-Blend Pants
https://www2.hm.com/en_us/productpage.1229229011.html
$24.99

Save to Favorites Fine-Knit Drawstring-Detail Top
## Fine-Knit Drawstring-Detail Top
https://www2.hm.com/en_us/productpage.1352361002.html
$39.99

Save to Favorites Fine-Knit T-Shirt
## Fine-Knit T-Shirt
https://www2.hm.com/en_us/productpage.1346029001.html
$29.99

Save to Favorites Cotton-Blend Pants
## Cotton-Blend Pants
https://www2.hm.com/en_us/productpage.1229229025.html
$24.99

Save to Favorites Rib-Knit Tank Top
## Rib-Knit Tank Top
https://www2.hm.com/en_us/productpage.1352588001.html
$24.99

Save to Favorites Rib-Knit Long-Sleeved Top
## Rib-Knit Long-Sleeved Top
https://www2.hm.com/en_us/productpage.1352587001.html
$39.99

Save to Favorites Fine-Knit Balloon Pants
## Fine-Knit Balloon Pants
https://www2.hm.com/en_us/productpage.1352366001.html
$44.99

Save to Favorites Crinkled Viscose-Blend Shirt
## Crinkled Viscose-Blend Shirt
https://www2.hm.com/en_us/productpage.1338961002.html
$44.99

Save to Favorites Rib-Knit V-Neck Top
## Rib-Knit V-Neck Top
https://www2.hm.com/en_us/productpage.1347116002.html
$39.99

Save to Favorites Fine-Knit Drawstring-Detail Top
## Fine-Knit Drawstring-Detail Top
https://www2.hm.com/en_us/productpage.1352361001.html
$39.99

Save to Favorites Fine-Knit Drawstring Shorts
## Fine-Knit Drawstring Shorts
https://www2.hm.com/en_us/productpage.1346027002.html
$29.99

Save to Favorites Oversized Fine-Knit Sweater
## Oversized Fine-Knit Sweater
https://www2.hm.com/en_us/productpage.1347099005.html
$44.99

Save to Favorites Fine-Knit Pants
## Fine-Knit Pants
https://www2.hm.com/en_us/productpage.1347095005.html
$39.99

Save to Favorites Fine-Knit Pants
## Fine-Knit Pants
https://www2.hm.com/en_us/productpage.1347095002.html
$39.99

Save to Favorites Fine-Knit Balloon Pants
## Fine-Knit Balloon Pants
https://www2.hm.com/en_us/productpage.1352366002.html
$44.99

Save to Favorites Fine-Knit Hooded Jacket
## Fine-Knit Hooded Jacket
https://www2.hm.com/en_us/productpage.1346026002.html
$44.99

Save to Favorites Fine-Knit T-Shirt
## Fine-Knit T-Shirt
https://www2.hm.com/en_us/productpage.1346029004.html
$29.99

Save to Favorites Viscose-Blend Drawstring Pants
## Viscose-Blend Drawstring Pants
https://www2.hm.com/en_us/productpage.1346037001.html
$39.99

Save to Favorites Long T-Shirt Dress
## Long T-Shirt Dress
https://www2.hm.com/en_us/productpage.1322872001.html
$24.99

Save to Favorites Rib-Knit Wrap Cardigan
## Rib-Knit Wrap Cardigan
https://www2.hm.com/en_us/productpage.1322880004.html
$44.99

Save to Favorites Rib-Knit Wrap Cardigan
## Rib-Knit Wrap Cardigan
https://www2.hm.com/en_us/productpage.1322880005.html
$44.99

Save to Favorites Rib-Knit Pants
## Rib-Knit Pants
https://www2.hm.com/en_us/productpage.1322881005.html
$39.99

Save to Favorites Rib-Knit Pants
## Rib-Knit Pants
https://www2.hm.com/en_us/productpage.1322881003.html
$39.99

Save to Favorites Wide-Leg Knit Pants
## Wide-Leg Knit Pants
https://www2.hm.com/en_us/productpage.1347086005.html
$44.99

Save to Favorites Wide-Leg Knit Pants
## Wide-Leg Knit Pants
https://www2.hm.com/en_us/productpage.1347086006.html
$44.99

Save to Favorites Crinkled Viscose-Blend Shirt
## Crinkled Viscose-Blend Shirt
https://www2.hm.com/en_us/productpage.1338961001.html
$44.99

Save to Favorites Brushed Jersey T-Shirt
## Brushed Jersey T-Shirt
https://www2.hm.com/en_us/productpage.1356558001.html
$14.99

Save to Favorites Viscose-Blend Drawstring Pants
## Viscose-Blend Drawstring Pants
https://www2.hm.com/en_us/productpage.1338962002.html
$44.99

Save to Favorites Cardigan
## Cardigan
https://www2.hm.com/en_us/productpage.1195866009.html
$44.99

Save to Favorites Long Fine-Knit Top
## Long Fine-Knit Top
https://www2.hm.com/en_us/productpage.1345727002.html
$29.99

Save to Favorites Brushed Jersey Wrap Top
## Brushed Jersey Wrap Top
https://www2.hm.com/en_us/productpage.1318714003.html
$24.99

Save to Favorites Viscose-Blend Hooded Jacket
## Viscose-Blend Hooded Jacket
https://www2.hm.com/en_us/productpage.1346035002.html
$39.99

Save to Favorites Fine-Knit Pants
## Fine-Knit Pants
https://www2.hm.com/en_us/productpage.1345733001.html
$39.99

Save to Favorites Wide-Leg Fine-Knit Pants
## Wide-Leg Fine-Knit Pants
https://www2.hm.com/en_us/productpage.1295969007.html
$44.99
"""

HM_KNITWEAR_PAGE = """
Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541001.html
$17.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541221.html
$17.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541227.html
$17.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541211.html
$17.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541228.html
$17.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541215.html
$17.99

Save to Favorites Fine-Knit T-Shirt
## Fine-Knit T-Shirt
https://www2.hm.com/en_us/productpage.1323374003.html
$24.99

Save to Favorites Fine-Knit T-Shirt
## Fine-Knit T-Shirt
https://www2.hm.com/en_us/productpage.1323374005.html
$24.99

Save to Favorites Rib-Knit Peplum Top
## Rib-Knit Peplum Top
https://www2.hm.com/en_us/productpage.1295275004.html
$29.99

Save to Favorites Knit Top
## Knit Top
https://www2.hm.com/en_us/productpage.1339573003.html
$39.99

Save to Favorites Batwing-Sleeved Knit Top
## Batwing-Sleeved Knit Top
https://www2.hm.com/en_us/productpage.1320795002.html
$19.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541174.html
$17.99

Save to Favorites Fine-Knit T-Shirt
## Fine-Knit T-Shirt
https://www2.hm.com/en_us/productpage.1323374004.html
$24.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541192.html
$17.99

Save to Favorites Fine-Knit T-Shirt
## Fine-Knit T-Shirt
https://www2.hm.com/en_us/productpage.1323374001.html
$24.99

Save to Favorites Fine-Knit Cardigan
## Fine-Knit Cardigan
https://www2.hm.com/en_us/productpage.0579541213.html
$17.99
"""

HM_SALE_PAGE = """
Save to Favorites MAMA Wide-leg Pants
## MAMA Wide-leg Pants
https://www2.hm.com/en_us/productpage.1229840007.html
Discounted price$11.49Regular price$39.99

Save to Favorites Smocked Chiffon Skirt
## Smocked Chiffon Skirt
https://www2.hm.com/en_us/productpage.1331691001.html
Discounted price$13.99Regular price$44.99

Save to Favorites Sports Leggings with SoftMove
## Sports Leggings with SoftMove
https://www2.hm.com/en_us/productpage.1237735017.html
Discounted price$11.99Regular price$39.99

Save to Favorites Modal-Blend Mock Turtleneck Top
## Modal-Blend Mock Turtleneck Top
https://www2.hm.com/en_us/productpage.1354109001.html
Discounted price$3.99Regular price$12.99

Save to Favorites Jersey Vest
## Jersey Vest
https://www2.hm.com/en_us/productpage.1292064007.html
Discounted price$11.99Regular price$19.99

Save to Favorites Balloon-Leg Pants with Drawstring
## Balloon-Leg Pants with Drawstring
https://www2.hm.com/en_us/productpage.1333306002.html
Discounted price$14.99Regular price$29.99

Save to Favorites Ruffle-Trimmed Halterneck Top
## Ruffle-Trimmed Halterneck Top
https://www2.hm.com/en_us/productpage.1346795001.html
Discounted price$8.49Regular price$29.99

Save to Favorites Padded Bandeau Bikini Top
## Padded Bandeau Bikini Top
https://www2.hm.com/en_us/productpage.1327449001.html
Discounted price$7.49Regular price$24.99

Save to Favorites Cheeky Bikini Bottoms
## Cheeky Bikini Bottoms
https://www2.hm.com/en_us/productpage.1268221011.html
Discounted price$4.99Regular price$12.99

Save to Favorites Frayed Denim Shorts
## Frayed Denim Shorts
https://www2.hm.com/en_us/productpage.1331705009.html
Discounted price$17.99Regular price$29.99

Save to Favorites Draped-Back Maxi Dress
## Draped-Back Maxi Dress
https://www2.hm.com/en_us/productpage.1339948001.html
Discounted price$8.49Regular price$29.99

Save to Favorites Lace-Trimmed Tank Top
## Lace-Trimmed Tank Top
https://www2.hm.com/en_us/productpage.1316944003.html
Discounted price$11.49Regular price$19.99

Save to Favorites Smocked Bandeau Dress
## Smocked Bandeau Dress
https://www2.hm.com/en_us/productpage.1338792002.html
Discounted price$12.49Regular price$39.99

Save to Favorites Bleecker High Rise Wide Leg Jeans
## Bleecker High Rise Wide Leg Jeans
https://www2.hm.com/en_us/productpage.0871889100.html
Discounted price$23.99Regular price$39.99

Save to Favorites Crochet-Look Polo Shirt
## Crochet-Look Polo Shirt
https://www2.hm.com/en_us/productpage.1342447002.html
Discounted price$14.99Regular price$24.99

Save to Favorites Cotton Shorts
## Cotton Shorts
https://www2.hm.com/en_us/productpage.1333545002.html
Discounted price$7.99Regular price$19.99

Save to Favorites Asymmetric Cowl-Neck Top
## Asymmetric Cowl-Neck Top
https://www2.hm.com/en_us/productpage.1344791001.html
Discounted price$8.99Regular price$29.99

Save to Favorites Straight-Leg Drawstring Pants
## Straight-Leg Drawstring Pants
https://www2.hm.com/en_us/productpage.1328264003.html
Discounted price$23.99Regular price$39.99

Save to Favorites Flounced One-Shoulder Dress
## Flounced One-Shoulder Dress
https://www2.hm.com/en_us/productpage.1337629001.html
Discounted price$8.49Regular price$29.99

Save to Favorites Sweatshorts
## Sweatshorts
https://www2.hm.com/en_us/productpage.1329687007.html
Discounted price$7.99Regular price$12.99

Save to Favorites Lace-Trimmed Tank Top
## Lace-Trimmed Tank Top
https://www2.hm.com/en_us/productpage.1316944001.html
Discounted price$11.99Regular price$19.99

Save to Favorites Shorts with Eyelet Embroidery
## Shorts with Eyelet Embroidery
https://www2.hm.com/en_us/productpage.1269003009.html
Discounted price$15.99Regular price$29.99

Save to Favorites Straight Leg High Waist Jeans
## Straight Leg High Waist Jeans
https://www2.hm.com/en_us/productpage.1330250001.html
Discounted price$14.99Regular price$49.99

Save to Favorites Ribbed Tank Top
## Ribbed Tank Top
https://www2.hm.com/en_us/productpage.1357355003.html
Discounted price$7.49Regular price$12.99

Save to Favorites Tie-Detail Mesh Blouse
## Tie-Detail Mesh Blouse
https://www2.hm.com/en_us/productpage.1326306003.html
Discounted price$5.99Regular price$19.99

Save to Favorites Pointelle-Knit Top
## Pointelle-Knit Top
https://www2.hm.com/en_us/productpage.1333907001.html
Discounted price$7.49Regular price$19.99

Save to Favorites Linen-Blend Cutout Dress
## Linen-Blend Cutout Dress
https://www2.hm.com/en_us/productpage.1329926004.html
Discounted price$14.99Regular price$44.99

Save to Favorites Wrap-Detail Satin Pants
## Wrap-Detail Satin Pants
https://www2.hm.com/en_us/productpage.1313956002.html
Discounted price$10.99Regular price$27.99

Save to Favorites Pointelle-Knit Beach Dress
## Pointelle-Knit Beach Dress
https://www2.hm.com/en_us/productpage.1339995002.html
Discounted price$17.99Regular price$49.99

Save to Favorites Embellished One-Shoulder Top
## Embellished One-Shoulder Top
https://www2.hm.com/en_us/productpage.1348235001.html
Discounted price$21.99Regular price$39.99
"""

# ─────────────────────────────────────────────────────────────────────────────
# Category classification rules (keyword-based)
# ─────────────────────────────────────────────────────────────────────────────

# Items that should be excluded (shoes, accessories, underwear, etc.)
EXCLUDE_KEYWORDS = {
    "sandal", "flat", "heel", "shoe", "boot", "sneaker",
    "scarf", "sunglasses", "eyeglasses", "glasses", "bag", "purse",
    "thong brief", "briefs", "bra", "shapewear", "bathrobe", "robe",
    "sarong", "maternity", "mama", "nursing",
    "earring", "necklace", "bracelet", "belt",
}

# Category rules: checked in order, first match wins
# Each rule is (category_name, list_of_keywords_any_of_which_trigger_match)
CATEGORY_RULES = [
    ("Swimwear", [
        "swimsuit", "bikini", "swimwear", "beach dress", "beach shirt",
        "beach shorts", "bathing suit", "coverup", "cover-up",
    ]),
    ("Tank Tops", [
        "tank top", "camisole", "sleeveless top", "vest",
    ]),
    ("Shorts", ["shorts"]),
    ("Skirts", ["skirt"]),
    ("Dresses", ["dress"]),
    ("Outerwear", [
        "jacket", "coat", "blazer",
    ]),
    ("Sweaters", [
        "sweater", "cardigan", "knit", "sweatshirt", "hoodie",
        "pullover", "turtleneck",
    ]),
    ("Loungewear", [
        "lounge", "jogger", "pajama", "pyjama", "legging", "active", "sport",
        "sweatpant",
    ]),
    ("Pants", [
        "pants", "jeans", "trouser", "slacks", "capri",
    ]),
    ("Tops", [
        "top", "blouse", "shirt", "t-shirt", "tee", "bodysuit",
    ]),
]


def parse_hm_markdown(text: str) -> list:
    """
    Parse markdown text from WebFetch H&M pages.
    Returns list of (title, url, price, compare_price).
    """
    products = []
    seen_urls = set()

    # Pattern: ## Title\nURL\nprice text
    blocks = re.split(r"\n(?=Save to Favorites |## )", text)

    for block in blocks:
        lines = [l.strip() for l in block.strip().splitlines() if l.strip()]
        title = None
        url = None
        price = None
        compare_price = None

        for line in lines:
            # Title line
            h2 = re.match(r"^##\s+(.+)$", line)
            if h2:
                title = h2.group(1).strip()
                continue
            # URL line
            if re.match(r"https://www2\.hm\.com/", line):
                url = line.strip()
                continue
            # Price: plain price like $24.99
            plain = re.match(r"^\$(\d+\.\d+)$", line)
            if plain:
                price = float(plain.group(1))
                continue
            # Sale price like "Discounted price$11.49Regular price$39.99"
            sale = re.search(r"Discounted price\$(\d+\.\d+)Regular price\$(\d+\.\d+)", line)
            if sale:
                price = float(sale.group(1))
                compare_price = float(sale.group(2))
                continue

        if title and url and url not in seen_urls:
            seen_urls.add(url)
            products.append((title, url, price, compare_price))

    return products


def classify_product(title: str) -> str | None:
    """Return the target category for this product title, or None to exclude."""
    title_lower = title.lower()

    # Check exclusions
    for excl in EXCLUDE_KEYWORDS:
        if excl in title_lower:
            return None

    for category, keywords in CATEGORY_RULES:
        for kw in keywords:
            if kw in title_lower:
                return category

    return None


def build_product_record(title: str, url: str, price: float, compare_price: float,
                          category: str) -> dict:
    """Build a product dict in the target schema."""
    # Extract numeric ID from URL
    id_match = re.search(r"productpage\.(\d+)\.html", url)
    product_id = int(id_match.group(1)) if id_match else None

    discount_percent = None
    if price and compare_price and compare_price > price:
        discount_percent = round((1 - price / compare_price) * 100, 1)

    return {
        "id": product_id,
        "title": title,
        "detail_url": url,
        "price_usd": price,
        "compare_at_price_usd": compare_price,
        "discount_percent": discount_percent,
        "available_sizes": [],
        "colours": [],
        "product_type": category,
        "tags": [],
        "thumbnail": None,
        "images": [],
        "created_at": None,
        "updated_at": None,
    }


def parse_dedicated_page(raw_text: str, category: str) -> list:
    """
    Parse a dedicated category page – all products on that page are assigned
    to the given category without keyword filtering (source already categorized).
    Non-clothing items (shoes, accessories) are still excluded.
    """
    records = []
    seen = set()
    for title, url, price, compare_price in parse_hm_markdown(raw_text):
        if url in seen:
            continue
        seen.add(url)
        title_lower = title.lower()
        if any(excl in title_lower for excl in EXCLUDE_KEYWORDS):
            continue
        records.append(build_product_record(title, url, price, compare_price, category))
    return records


def process_hm():
    """Parse all collected H&M markdown pages and build categorized data."""

    # 1. Build dedicated-page datasets for categories that have them
    dedicated: dict[str, list] = {
        "Tops": parse_dedicated_page(HM_TOPS_PAGE, "Tops"),
        "Dresses": parse_dedicated_page(HM_DRESSES_PAGE, "Dresses"),
        "Pants": parse_dedicated_page(HM_PANTS_PAGE, "Pants"),
        "Shorts": parse_dedicated_page(HM_SHORTS_PAGE, "Shorts"),
        "Skirts": parse_dedicated_page(HM_SKIRTS_PAGE, "Skirts"),
        "Swimwear": parse_dedicated_page(HM_SWIMWEAR_PAGE, "Swimwear"),
        "Loungewear": parse_dedicated_page(HM_LOUNGEWEAR_PAGE, "Loungewear"),
        "Sweaters": parse_dedicated_page(HM_KNITWEAR_PAGE, "Sweaters"),
    }

    # 2. For Tank Tops – filter from tops page
    tank_top_kws = {"tank top", "camisole", "vest", "rib-knit tank", "sleeveless"}
    tank_tops = []
    seen_tank = set()
    for rec in dedicated["Tops"]:
        t = rec["title"].lower()
        if any(kw in t for kw in tank_top_kws) and rec["detail_url"] not in seen_tank:
            seen_tank.add(rec["detail_url"])
            tank_tops.append({**rec, "product_type": "Tank Tops"})
    # Also check swimwear page for camisole-like items (unlikely but possible)
    dedicated["Tank Tops"] = tank_tops

    # 3. For Outerwear – extract from general pages by keyword
    outerwear_kws = {"jacket", "coat", "blazer", "shacket", "trench"}
    outerwear_seen = set()
    outerwear = []
    for raw_text in [HM_NEW_ARRIVALS_PAGE, HM_SALE_PAGE, HM_PRODUCTS_PAGE]:
        for title, url, price, compare_price in parse_hm_markdown(raw_text):
            if url in outerwear_seen:
                continue
            t_lower = title.lower()
            if any(kw in t_lower for kw in outerwear_kws) and not any(
                excl in t_lower for excl in EXCLUDE_KEYWORDS
            ):
                outerwear_seen.add(url)
                outerwear.append(build_product_record(title, url, price, compare_price, "Outerwear"))
    dedicated["Outerwear"] = outerwear

    # 4. Supplement Sweaters from general pages
    sweater_kws = {"sweater", "cardigan", "knit", "sweatshirt", "hoodie", "pullover", "turtleneck"}
    sw_seen = {r["detail_url"] for r in dedicated["Sweaters"]}
    for raw_text in [HM_NEW_ARRIVALS_PAGE, HM_SALE_PAGE, HM_PRODUCTS_PAGE]:
        for title, url, price, compare_price in parse_hm_markdown(raw_text):
            if url in sw_seen:
                continue
            t_lower = title.lower()
            if any(kw in t_lower for kw in sweater_kws) and not any(
                excl in t_lower for excl in EXCLUDE_KEYWORDS
            ):
                sw_seen.add(url)
                dedicated["Sweaters"].append(
                    build_product_record(title, url, price, compare_price, "Sweaters")
                )

    # 5. Report and cap
    data = {}
    for category in TARGET_CATEGORIES:
        items = dedicated.get(category, [])[:ITEMS_PER_CATEGORY]
        data[category] = items
        print(f"  {category}: {len(items)} products")

    return data


def scrape_hm(output_path: str):
    print(f"Processing H&M data (www2.hm.com)")
    print("Note: H&M blocks automated requests from this environment.")
    print("Product data was collected via WebFetch and is parsed from embedded text.")

    data = process_hm()

    output = {
        "source": "https://www2.hm.com",
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "categories": TARGET_CATEGORIES,
        "items_per_category": ITEMS_PER_CATEGORY,
        "data": data,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"  Saved to {output_path}")


if __name__ == "__main__":
    scrape_hm("/workspace/output/hm_by_category.json")
    print("Done!")
