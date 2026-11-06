package com.ecommerce.dto.response;

import com.ecommerce.enums.Role;

public record RegisterResponse(Long id, String name, String email, Role role) {
}
