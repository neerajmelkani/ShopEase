package com.ecommerce.dto.response;

import com.ecommerce.enums.Role;

public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        Long userId,
        String name,
        String email,
        Role role) {
}
