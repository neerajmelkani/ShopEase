package com.ecommerce.exception;

public class CategoryInUseException extends RuntimeException {

    public CategoryInUseException(Long id) {
        super("Category cannot be deleted while products are associated with it: " + id);
    }
}
