package com.ecommerce.exception;

public class InsufficientStockException extends RuntimeException {

    public InsufficientStockException(String productName, int availableQuantity) {
        super("Insufficient stock for product '" + productName + "'. Available quantity: " + availableQuantity);
    }
}
