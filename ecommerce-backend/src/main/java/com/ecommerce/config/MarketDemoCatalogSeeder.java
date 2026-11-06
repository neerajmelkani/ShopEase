package com.ecommerce.config;

import com.ecommerce.entity.Category;
import com.ecommerce.entity.Product;
import com.ecommerce.repository.CategoryRepository;
import com.ecommerce.repository.ProductRepository;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Loads the reviewed demo catalog only when the explicit demo-catalog profile is active. */
@Component
@Profile("demo-catalog")
public class MarketDemoCatalogSeeder implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(MarketDemoCatalogSeeder.class);
    private static final String CATALOG_RESOURCE = "seed/market-based-demo-products.tsv";
    private static final List<String> HEADER_FIELDS = List.of(
            "category", "name", "description", "price", "stockQuantity", "researchDate", "sourceUrl", "imageUrls");
    private static final Map<String, Integer> EXPECTED_COUNTS = Map.of(
            "Computer Accessories", 20,
            "Electronic Items", 20,
            "Clothing", 15,
            "Sports", 15);
    private static final Map<String, String> CATEGORY_DESCRIPTIONS = Map.of(
            "Computer Accessories", "Computer peripherals and work accessories.",
            "Electronic Items", "Consumer electronics and charging accessories.",
            "Clothing", "Branded everyday and activewear clothing.",
            "Sports", "Sports equipment, apparel, and fitness accessories.");

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    public MarketDemoCatalogSeeder(ProductRepository productRepository, CategoryRepository categoryRepository) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws IOException {
        long existingProductCount = productRepository.count();

        if (args.containsOption("images-only")) {
            if (existingProductCount == 0) {
                throw new IllegalStateException(
                        "Image-only import requested, but the products table is empty; no products were created.");
            }
            repairExistingProductImages();
            return;
        }

        if (existingProductCount != 0) {
            repairExistingProductImages();
            return;
        }

        List<CatalogRow> rows = readAndValidateCatalog(true);
        Map<String, Category> categories = ensureCategories();
        List<Product> products = rows.stream().map(row -> toProduct(row, categories)).toList();
        productRepository.saveAll(products);
        LOGGER.info("Loaded {} representative demo products (20 computer accessories, 20 electronics, 15 clothing, 15 sports).",
                products.size());
    }

    private void repairExistingProductImages() throws IOException {
        List<CatalogRow> rows = readAndValidateCatalog(false);
        Set<String> catalogNames = rows.stream()
                .map(CatalogRow::name)
                .map(MarketDemoCatalogSeeder::normalizeName)
                .collect(java.util.stream.Collectors.toSet());
        Map<String, Product> productsByName = new HashMap<>();
        Map<String, List<Long>> duplicateProductIds = new HashMap<>();
        for (Product product : productRepository.findAll()) {
            String normalizedName = normalizeName(product.getName());
            if (!catalogNames.contains(normalizedName)) {
                continue;
            }
            Product previous = productsByName.putIfAbsent(normalizedName, product);
            if (previous != null) {
                duplicateProductIds.computeIfAbsent(normalizedName, ignored -> new ArrayList<>(List.of(previous.getId())))
                        .add(product.getId());
            }
        }

        if (!duplicateProductIds.isEmpty()) {
            throw new IllegalStateException("Image import aborted before saving: catalog product names do not map uniquely: "
                    + duplicateProductIds);
        }

        List<String> missingProducts = rows.stream()
                .map(CatalogRow::name)
                .filter(name -> !productsByName.containsKey(normalizeName(name)))
                .toList();
        if (!missingProducts.isEmpty()) {
            throw new IllegalStateException("Image import aborted before saving: " + missingProducts.size()
                    + " catalog products have no existing product mapping: " + String.join(", ", missingProducts));
        }

        LOGGER.info("Starting image-only catalog import: {} catalog rows mapped to existing product IDs.", rows.size());
        int productsWithImagesAdded = 0;
        int imagesInserted = 0;
        int imagesSkipped = 0;
        int productsProcessed = 0;
        for (CatalogRow row : rows) {
            Product product = productsByName.get(normalizeName(row.name()));
            int existingImageCount = product.getImages().size();
            product.addImagesIfMissing(row.imageUrls());
            int insertedForProduct = product.getImages().size() - existingImageCount;
            int skippedForProduct = row.imageUrls().size() - insertedForProduct;
            if (insertedForProduct > 0) {
                // Product is managed; cascade persists only the new ProductImage children.
                productsWithImagesAdded++;
            }
            productsProcessed++;
            imagesInserted += insertedForProduct;
            imagesSkipped += skippedForProduct;
            LOGGER.info("Processed catalog product {}/{}: '{}' -> existing product ID {}; inserted {} image records, skipped {} already-linked URLs.",
                    productsProcessed, rows.size(), row.name(), product.getId(), insertedForProduct, skippedForProduct);
        }
        long productsWithThreeImages = rows.stream()
                .map(row -> productsByName.get(normalizeName(row.name())))
                .filter(product -> product.getImages().stream()
                        .map(image -> image.getUrl())
                        .filter(MarketDemoCatalogSeeder::isValidHttpsUrl)
                        .distinct()
                        .count() >= 3)
                .count();
        LOGGER.info("Image-only import complete: processed {} catalog products; added images to {} existing products; inserted {} image records; skipped {} already-linked URLs. {}/{} catalog products now have at least three distinct HTTPS image URLs. No product records were created, updated, or deleted.",
                productsProcessed, productsWithImagesAdded, imagesInserted, imagesSkipped, productsWithThreeImages, rows.size());
        if (productsWithThreeImages != rows.size()) {
            LOGGER.warn("The image catalog is incomplete. {} existing products still need at least three distinct image URLs.",
                    rows.size() - productsWithThreeImages);
        }
    }

    private List<CatalogRow> readAndValidateCatalog(boolean requireImages) throws IOException {
        ClassPathResource resource = new ClassPathResource(CATALOG_RESOURCE);
        List<CatalogRow> rows = new ArrayList<>();
        Map<String, Integer> counts = new HashMap<>();
        Set<String> names = new HashSet<>();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            String header = reader.readLine();
            if (header == null || !HEADER_FIELDS.equals(parseTsvRow(header, 1))) {
                throw new IllegalStateException("The demo catalog file has an unexpected header.");
            }

            String line;
            int lineNumber = 1;
            while ((line = reader.readLine()) != null) {
                lineNumber++;
                if (line.isBlank()) {
                    continue;
                }

                List<String> fields = parseTsvRow(line, lineNumber);
                if (fields.size() != HEADER_FIELDS.size()) {
                    throw invalidRow(lineNumber, "expected eight tab-separated columns");
                }

                String categoryName = fields.get(0).trim();
                if (!EXPECTED_COUNTS.containsKey(categoryName)) {
                    throw invalidRow(lineNumber, "unknown category");
                }
                String name = fields.get(1).trim();
                if (name.isBlank() || !names.add(normalizeName(name))) {
                    throw invalidRow(lineNumber, "product name is blank or duplicated");
                }
                if (fields.get(2).isBlank()) {
                    throw invalidRow(lineNumber, "description is blank");
                }

                BigDecimal price;
                int stock;
                LocalDate researchedOn;
                try {
                    price = new BigDecimal(fields.get(3));
                    stock = Integer.parseInt(fields.get(4));
                    researchedOn = LocalDate.parse(fields.get(5));
                } catch (NumberFormatException | java.time.DateTimeException exception) {
                    throw invalidRow(lineNumber, "price, stock, or research date is invalid");
                }
                if (price.signum() <= 0 || price.scale() > 2 || price.precision() > 12 || stock < 0) {
                    throw invalidRow(lineNumber, "price or stock is outside the supported range");
                }
                if (!fields.get(6).startsWith("https://")) {
                    throw invalidRow(lineNumber, "a HTTPS source URL is required");
                }

                List<String> imageUrls = fields.get(7).isBlank()
                        ? List.of()
                        : Arrays.stream(fields.get(7).split(";", -1))
                                .map(String::trim)
                                .filter(url -> !url.isBlank())
                                .toList();
                if ((requireImages && imageUrls.size() < 3)
                        || (!imageUrls.isEmpty() && imageUrls.size() < 3)
                        || imageUrls.stream().anyMatch(url -> !isValidHttpsUrl(url))
                        || new HashSet<>(imageUrls).size() != imageUrls.size()) {
                    throw invalidRow(lineNumber, "at least three distinct HTTPS product image URLs are required");
                }

                counts.merge(categoryName, 1, Integer::sum);
                rows.add(new CatalogRow(categoryName, name, fields.get(2).trim(), price, stock, researchedOn, imageUrls));
            }
        }

        if (rows.size() != 70 || !counts.equals(EXPECTED_COUNTS)) {
            throw new IllegalStateException("The demo catalog must contain exactly 70 products in the requested category counts.");
        }
        return rows;
    }

    private List<String> parseTsvRow(String line, int lineNumber) {
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        boolean quoteClosed = false;

        for (int index = 0; index < line.length(); index++) {
            char character = line.charAt(index);
            if (character == '"') {
                if (inQuotes && index + 1 < line.length() && line.charAt(index + 1) == '"') {
                    field.append('"');
                    index++;
                } else if (inQuotes) {
                    inQuotes = false;
                    quoteClosed = true;
                } else if (field.isEmpty() && !quoteClosed) {
                    inQuotes = true;
                } else {
                    throw invalidRow(lineNumber, "unexpected quote in a tab-separated field");
                }
            } else if (character == '\t' && !inQuotes) {
                fields.add(field.toString());
                field.setLength(0);
                quoteClosed = false;
            } else {
                if (quoteClosed) {
                    throw invalidRow(lineNumber, "unexpected content after a quoted field");
                }
                field.append(character);
            }
        }

        if (inQuotes) {
            throw invalidRow(lineNumber, "unterminated quoted field");
        }
        fields.add(field.toString());
        return fields;
    }

    private static String normalizeName(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
    }

    private Map<String, Category> ensureCategories() {
        Map<String, Category> categories = new HashMap<>();
        for (Category existing : categoryRepository.findAll()) {
            categories.put(existing.getName().toLowerCase(Locale.ROOT), existing);
        }

        for (Map.Entry<String, String> expected : CATEGORY_DESCRIPTIONS.entrySet()) {
            categories.computeIfAbsent(expected.getKey().toLowerCase(Locale.ROOT), key -> {
                Category category = new Category();
                category.setName(expected.getKey());
                category.setDescription(expected.getValue());
                return categoryRepository.save(category);
            });
        }
        return categories;
    }

    private Product toProduct(CatalogRow row, Map<String, Category> categories) {
        Product product = new Product();
        product.setName(row.name());
        product.setDescription(row.description());
        product.setPrice(row.price());
        product.setStockQuantity(row.stockQuantity());
        product.setCategory(categories.get(row.categoryName().toLowerCase(Locale.ROOT)));
        product.replaceImages(row.imageUrls());
        return product;
    }

    private IllegalStateException invalidRow(int lineNumber, String reason) {
        return new IllegalStateException("Invalid demo catalog row " + lineNumber + ": " + reason + ".");
    }

    private static boolean isValidHttpsUrl(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private record CatalogRow(
            String categoryName,
            String name,
            String description,
            BigDecimal price,
            int stockQuantity,
            LocalDate researchedOn,
            List<String> imageUrls) {
    }
}
