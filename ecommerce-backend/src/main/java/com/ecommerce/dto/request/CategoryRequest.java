package com.ecommerce.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategoryRequest(
        @NotBlank(message = "Category name is required")
        @Size(max = 255, message = "Category name must be at most 255 characters")
        String name,
        @Size(max = 2000, message = "Description must be at most 2000 characters")
        String description) {
}
