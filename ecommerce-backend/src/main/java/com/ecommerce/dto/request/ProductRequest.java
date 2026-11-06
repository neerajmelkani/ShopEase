package com.ecommerce.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.util.List;

public record ProductRequest(
        @NotBlank(message = "Product name is required")
        @Size(max = 255, message = "Product name must be at most 255 characters")
        String name,
        @Size(max = 2000, message = "Description must be at most 2000 characters")
        String description,
        @NotNull(message = "Price is required")
        @DecimalMin(value = "0.0", inclusive = false, message = "Price must be greater than zero")
        @Digits(integer = 10, fraction = 2, message = "Price must have at most 10 integer and 2 fraction digits")
        BigDecimal price,
        @NotNull(message = "Stock quantity is required")
        @PositiveOrZero(message = "Stock quantity must be non-negative")
        Integer stockQuantity,
        @Positive(message = "Category ID must be positive")
        Long categoryId,
        @Size(max = 20, message = "A product can have at most 20 images")
        List<@NotBlank(message = "Image URL cannot be blank")
                @Size(max = 2048, message = "Image URL must be at most 2048 characters")
                @Pattern(regexp = "^https://.+", message = "Image URLs must use HTTPS") String> imageUrls) {
}
