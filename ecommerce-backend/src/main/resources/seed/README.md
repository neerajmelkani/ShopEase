# Market-based demo product catalog

`market-based-demo-products.tsv` is a demo seed catalog with exactly 70 products:

- Computer Accessories: 20
- Electronic Items: 20
- Clothing: 15
- Sports: 15

All `price` values are plain numeric INR values for the existing `Product.price` BigDecimal field. The TSV retains a source URL, research date, and semicolon-separated `imageUrls` column. The application seeder does not persist the price research metadata.

For a new empty database, the seeder requires at least three distinct HTTPS image URLs for every row. The image catalog is complete: all 70 of 70 products have at least three distinct, directly browser-verified product images (210 unique URLs total). The original product fields and pre-existing image URLs were preserved. Image availability was confirmed by opening each selected direct URL in a browser; this confirms successful image delivery at verification time, not ongoing availability or an embedding license. Newly researched source listings: Puma Men's Woven Pants (https://www.myntra.com/track-pants/puma/puma-mens-woven-pants/32649583/buy); Puma Performance SS Drycell Training T-Shirt, Puma Men's Essential Track Pants, and Puma Men Cricket Woven Pants (see batch 7 source URLs in their TSV rows); Biba Botanical Printed V-Neck Kurti (https://www.myntra.com/kurtis/biba/biba-botanical-printed-v-neck-kurti/37755761/buy); Biba Ethnic Motifs Printed Straight Kurti (https://www.myntra.com/kurtis/biba/biba-women-ethnic-motifs-printed-straight-kurti/36069354/buy); Biba Floral Printed Round-Neck Straight Kurti (https://www.myntra.com/kurtis/biba/biba-floral-printed-round-neck-three-quarter-sleeves-straight-kurti/37631150/buy); Biba Floral Printed Kurti (https://www.myntra.com/kurtis/biba/biba-floral-printed-kurti/22278252/buy); Biba Women's Printed Kurti (https://www.myntra.com/kurtis/biba/biba-women-printed-kurti/31683337/buy); Perfly Adult Badminton Racket BR 190 (https://www.decathlon.in/p/8735707/adult-badminton-racket-br-190-set-partner-blue-grey-pink). Perfly model identity was checked against Decathlon's official India listing; no substitute brand was used. There are no incomplete product galleries.

Prices are representative demo selling prices based on Indian retailer listing pages reviewed on 2026-11-02; individual retailer pages may show an earlier listing update date. They are not guaranteed live offers, inventory, or official price quotes. Recheck the row's source URL before using a value commercially. No discounts, MRP values, or original prices are asserted.

## Loading the catalog

The catalog loader is disabled by default and runs only with the `demo-catalog` Spring profile. On an empty products table, it inserts the catalog only when all 70 rows meet the image requirement. If products already exist, it matches catalog rows by product name and adds only the image URLs for rows with three verified photos, leaving product fields and existing image URLs intact. This allows an existing demo database to be repaired without replacing its products.

Configure the normal database and JWT environment variables, then run:

```powershell
mvn spring-boot:run "-Dspring-boot.run.profiles=demo-catalog"
```

The profile is intended for a development/demo database. Disable the profile after loading.
