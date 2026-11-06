package com.ecommerce.dto.response;

import com.ecommerce.enums.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record OrderSummaryResponse(Long id, BigDecimal totalAmount, OrderStatus status, LocalDateTime createdAt) {
}
