package com.ecommerce.service;

import com.ecommerce.dto.request.ProductRequest;
import com.ecommerce.dto.response.ProductResponse;
import com.ecommerce.entity.Category;
import com.ecommerce.entity.Product;
import com.ecommerce.exception.CategoryNotFoundException;
import com.ecommerce.exception.ProductNotFoundException;
import com.ecommerce.repository.CategoryRepository;
import com.ecommerce.repository.ProductRepository;
import java.net.URI;
import java.util.Set;
import java.util.HashSet;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ProductService {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("id", "name", "price", "createdAt", "updatedAt");

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    public ProductService(ProductRepository productRepository, CategoryRepository categoryRepository) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
    }

    public ProductResponse addProduct(ProductRequest request) {
        Product product = new Product();
        applyRequest(product, request);
        return toResponse(productRepository.save(product));
    }

    @Transactional(readOnly = true)
    public Page<ProductResponse> getProducts(
            Long categoryId,
            int page,
            int size,
            String sortBy,
            String direction) {
        Pageable pageable = createPageable(page, size, sortBy, direction);
        if (categoryId == null) {
            return productRepository.findAll(pageable).map(ProductService::toResponse);
        }
        ensureCategoryExists(categoryId);
        return productRepository.findByCategory_Id(categoryId, pageable).map(ProductService::toResponse);
    }

    @Transactional(readOnly = true)
    public ProductResponse getProductById(Long id) {
        return toResponse(findProduct(id));
    }

    public ProductResponse updateProduct(Long id, ProductRequest request) {
        Product product = productRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ProductNotFoundException(id));
        applyRequest(product, request);
        return toResponse(productRepository.save(product));
    }

    public void deleteProduct(Long id) {
        productRepository.delete(findProduct(id));
    }

    @Transactional(readOnly = true)
    public Page<ProductResponse> searchProducts(
            String name,
            Long categoryId,
            int page,
            int size,
            String sortBy,
            String direction) {
        Pageable pageable = createPageable(page, size, sortBy, direction);
        String searchName = name == null ? "" : name.trim();
        boolean hasName = !searchName.isBlank();

        if (categoryId != null) {
            ensureCategoryExists(categoryId);
            if (hasName) {
                return productRepository.findByNameContainingIgnoreCaseAndCategory_Id(
                        searchName, categoryId, pageable).map(ProductService::toResponse);
            }
            return productRepository.findByCategory_Id(categoryId, pageable).map(ProductService::toResponse);
        }

        if (hasName) {
            return productRepository.findByNameContainingIgnoreCase(searchName, pageable)
                    .map(ProductService::toResponse);
        }
        return productRepository.findAll(pageable).map(ProductService::toResponse);
    }

    private void applyRequest(Product product, ProductRequest request) {
        product.setName(request.name().trim());
        product.setDescription(request.description());
        product.setPrice(request.price());
        product.setStockQuantity(request.stockQuantity());
        product.setCategory(request.categoryId() == null ? null : findCategory(request.categoryId()));
        if (request.imageUrls() != null) {
            List<String> normalizedImageUrls = request.imageUrls().stream()
                    .map(String::trim)
                    .toList();
            if (normalizedImageUrls.stream().anyMatch(url -> !isValidHttpsUrl(url))) {
                throw new IllegalArgumentException("Product image URLs must be valid HTTPS URLs with a host");
            }
            if (new HashSet<>(normalizedImageUrls).size() != normalizedImageUrls.size()) {
                throw new IllegalArgumentException("Product image URLs must be distinct");
            }
            product.replaceImages(normalizedImageUrls);
        }
    }

    private Product findProduct(Long id) {
        return productRepository.findById(id).orElseThrow(() -> new ProductNotFoundException(id));
    }

    private Category findCategory(Long id) {
        return categoryRepository.findById(id).orElseThrow(() -> new CategoryNotFoundException(id));
    }

    private void ensureCategoryExists(Long id) {
        if (!categoryRepository.existsById(id)) {
            throw new CategoryNotFoundException(id);
        }
    }

    private static Pageable createPageable(int page, int size, String sortBy, String direction) {
        if (page < 0) {
            throw new IllegalArgumentException("Page must be zero or greater");
        }
        if (size < 1 || size > 100) {
            throw new IllegalArgumentException("Page size must be between 1 and 100");
        }
        if (sortBy == null || !ALLOWED_SORT_FIELDS.contains(sortBy)) {
            throw new IllegalArgumentException("Unsupported sort field");
        }

        Sort.Direction sortDirection;
        try {
            sortDirection = Sort.Direction.fromString(direction);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Sort direction must be ASC or DESC");
        }
        return PageRequest.of(page, size, Sort.by(sortDirection, sortBy));
    }

    private static ProductResponse toResponse(Product product) {
        Category category = product.getCategory();
        return new ProductResponse(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getPrice(),
                product.getStockQuantity(),
                category == null ? null : category.getId(),
                category == null ? null : category.getName(),
                product.getCreatedAt(),
                product.getUpdatedAt(),
                product.getImages().stream().map(image -> image.getUrl()).toList());
    }

    private static boolean isValidHttpsUrl(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
