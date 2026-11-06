package com.ecommerce.exception;

import com.ecommerce.enums.OrderStatus;

public class InvalidOrderStatusTransitionException extends RuntimeException {

    public InvalidOrderStatusTransitionException(OrderStatus current, OrderStatus requested) {
        super("Order status cannot transition from " + current + " to " + requested);
    }
}
