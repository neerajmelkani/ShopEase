package com.ecommerce.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record CodPaymentRequest(
        @NotNull(message = "Order ID is required")
        @Positive(message = "Order ID must be positive")
        Long orderId) {
}
