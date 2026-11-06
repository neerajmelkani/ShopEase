package com.ecommerce.controller;

import com.ecommerce.dto.request.UpdateOrderStatusRequest;
import com.ecommerce.dto.response.OrderResponse;
import com.ecommerce.dto.response.OrderSummaryResponse;
import com.ecommerce.service.OrderService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/orders")
    public ResponseEntity<OrderResponse> placeOrder() {
        return ResponseEntity.status(HttpStatus.CREATED).body(orderService.placeOrder());
    }

    @GetMapping("/orders")
    public List<OrderSummaryResponse> getCustomerOrders() {
        return orderService.getCustomerOrders();
    }

    @GetMapping("/orders/{id}")
    public OrderResponse getCustomerOrder(@PathVariable @Positive Long id) {
        return orderService.getCustomerOrder(id);
    }

    @PutMapping("/orders/{id}/cancel")
    public OrderResponse cancelOrder(@PathVariable @Positive Long id) {
        return orderService.cancelCustomerOrder(id);
    }

    @GetMapping("/admin/orders")
    public List<OrderSummaryResponse> getAllOrders() {
        return orderService.getAllOrders();
    }

    @PutMapping("/admin/orders/{id}/status")
    public OrderResponse updateOrderStatus(
            @PathVariable @Positive Long id,
            @Valid @RequestBody UpdateOrderStatusRequest request) {
        return orderService.updateOrderStatus(id, request);
    }
}
