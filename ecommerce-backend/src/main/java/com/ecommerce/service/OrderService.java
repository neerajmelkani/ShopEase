package com.ecommerce.service;

import com.ecommerce.dto.request.UpdateOrderStatusRequest;
import com.ecommerce.dto.response.OrderItemResponse;
import com.ecommerce.dto.response.OrderResponse;
import com.ecommerce.dto.response.OrderSummaryResponse;
import com.ecommerce.entity.Cart;
import com.ecommerce.entity.CartItem;
import com.ecommerce.entity.Order;
import com.ecommerce.entity.OrderItem;
import com.ecommerce.entity.Product;
import com.ecommerce.entity.User;
import com.ecommerce.enums.OrderStatus;
import com.ecommerce.exception.EmptyCartException;
import com.ecommerce.exception.InsufficientStockException;
import com.ecommerce.exception.InvalidOrderStatusTransitionException;
import com.ecommerce.exception.OrderNotFoundException;
import com.ecommerce.exception.ProductNotFoundException;
import com.ecommerce.repository.CartItemRepository;
import com.ecommerce.repository.CartRepository;
import com.ecommerce.repository.OrderItemRepository;
import com.ecommerce.repository.OrderRepository;
import com.ecommerce.repository.ProductRepository;
import com.ecommerce.repository.UserRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final CartRepository cartRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;

    public OrderService(
            OrderRepository orderRepository,
            OrderItemRepository orderItemRepository,
            CartRepository cartRepository,
            CartItemRepository cartItemRepository,
            ProductRepository productRepository,
            UserRepository userRepository) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.cartRepository = cartRepository;
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
    }

    public OrderResponse placeOrder() {
        User user = getAuthenticatedUser();
        User lockedUser = lockUser(user.getId());
        Cart cart = cartRepository.findByUserIdForUpdate(lockedUser.getId())
                .orElseThrow(EmptyCartException::new);
        List<CartItem> cartItems = cartItemRepository.findAllByCartIdForUpdate(cart.getId());
        if (cartItems.isEmpty()) {
            throw new EmptyCartException();
        }

        Map<Long, Product> lockedProducts = lockProductsForItems(cartItems);
        Order order = new Order();
        order.setUser(lockedUser);
        order.setStatus(OrderStatus.PENDING);

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<OrderItem> orderItems = new ArrayList<>();
        for (CartItem cartItem : cartItems) {
            int quantity = cartItem.getQuantity();
            if (quantity <= 0) {
                throw new IllegalArgumentException("Cart contains an invalid quantity");
            }

            Product product = lockedProducts.get(cartItem.getProduct().getId());
            if (product == null) {
                throw new ProductNotFoundException(cartItem.getProduct().getId());
            }
            if (product.getStockQuantity() < quantity) {
                throw new InsufficientStockException(product.getName(), product.getStockQuantity());
            }

            BigDecimal price = product.getPrice();
            BigDecimal subtotal = price.multiply(BigDecimal.valueOf(quantity));
            totalAmount = totalAmount.add(subtotal);
            product.setStockQuantity(product.getStockQuantity() - quantity);

            OrderItem orderItem = new OrderItem();
            orderItem.setOrder(order);
            orderItem.setProduct(product);
            orderItem.setProductName(product.getName());
            orderItem.setPrice(price);
            orderItem.setQuantity(quantity);
            orderItem.setSubtotal(subtotal);
            orderItems.add(orderItem);
        }

        order.setTotalAmount(totalAmount);
        order.setItems(orderItems);
        Order savedOrder = orderRepository.saveAndFlush(order);

        // The cart is emptied only after the order and its snapshots have flushed successfully.
        cartItemRepository.deleteAll(cartItems);
        return toOrderResponse(savedOrder);
    }

    @Transactional(readOnly = true)
    public List<OrderSummaryResponse> getCustomerOrders() {
        User user = getAuthenticatedUser();
        return orderRepository.findAllByUser_IdOrderByCreatedAtDesc(user.getId()).stream()
                .map(OrderService::toSummaryResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public OrderResponse getCustomerOrder(Long orderId) {
        User user = getAuthenticatedUser();
        Order order = orderRepository.findByIdAndUser_Id(orderId, user.getId())
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        return toOrderResponse(order);
    }

    public OrderResponse cancelCustomerOrder(Long orderId) {
        User user = getAuthenticatedUser();
        Order order = orderRepository.findOwnedByIdForUpdate(orderId, user.getId())
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!isValidTransition(order.getStatus(), OrderStatus.CANCELLED)) {
            throw new InvalidOrderStatusTransitionException(order.getStatus(), OrderStatus.CANCELLED);
        }
        transitionTo(order, OrderStatus.CANCELLED);
        return toOrderResponse(orderRepository.saveAndFlush(order));
    }

    @Transactional(readOnly = true)
    public List<OrderSummaryResponse> getAllOrders() {
        return orderRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(OrderService::toSummaryResponse)
                .toList();
    }

    public OrderResponse updateOrderStatus(Long orderId, UpdateOrderStatusRequest request) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        OrderStatus requestedStatus = request.status();
        if (requestedStatus == null || !isValidTransition(order.getStatus(), requestedStatus)) {
            throw new InvalidOrderStatusTransitionException(order.getStatus(), requestedStatus);
        }
        transitionTo(order, requestedStatus);
        return toOrderResponse(orderRepository.saveAndFlush(order));
    }

    private Map<Long, Product> lockProductsForItems(List<CartItem> cartItems) {
        List<Long> productIds = cartItems.stream()
                .map(item -> item.getProduct().getId())
                .distinct()
                .sorted()
                .toList();
        Map<Long, Product> lockedProducts = new LinkedHashMap<>();
        for (Long productId : productIds) {
            Product product = productRepository.findByIdForUpdate(productId)
                    .orElseThrow(() -> new ProductNotFoundException(productId));
            lockedProducts.put(productId, product);
        }
        return lockedProducts;
    }

    private void transitionTo(Order order, OrderStatus status) {
        if (status == OrderStatus.CANCELLED) {
            restoreStock(order);
        }
        order.setStatus(status);
    }

    private void restoreStock(Order order) {
        Map<Long, Integer> quantityByProductId = new TreeMap<>();
        for (OrderItem item : orderItemRepository.findAllByOrder_IdOrderByIdAsc(order.getId())) {
            Long productId = item.getProduct().getId();
            quantityByProductId.merge(productId, item.getQuantity(), Math::addExact);
        }

        Map<Long, Product> lockedProducts = new LinkedHashMap<>();
        for (Long productId : quantityByProductId.keySet()) {
            Product product = productRepository.findByIdForUpdate(productId)
                    .orElseThrow(() -> new ProductNotFoundException(productId));
            lockedProducts.put(productId, product);
        }

        for (Map.Entry<Long, Integer> entry : quantityByProductId.entrySet()) {
            Product product = lockedProducts.get(entry.getKey());
            try {
                product.setStockQuantity(Math.addExact(product.getStockQuantity(), entry.getValue()));
            } catch (ArithmeticException exception) {
                throw new IllegalStateException("Stock quantity overflow while restoring an order", exception);
            }
        }
    }

    private static boolean isValidTransition(OrderStatus current, OrderStatus requested) {
        if (current == requested) {
            return false;
        }
        return switch (current) {
            case PENDING -> requested == OrderStatus.CONFIRMED || requested == OrderStatus.CANCELLED;
            case CONFIRMED -> requested == OrderStatus.PROCESSING || requested == OrderStatus.CANCELLED;
            case PROCESSING -> requested == OrderStatus.SHIPPED || requested == OrderStatus.CANCELLED;
            case SHIPPED -> requested == OrderStatus.DELIVERED;
            case DELIVERED, CANCELLED -> false;
        };
    }

    private User getAuthenticatedUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication is required");
        }
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }

    private User lockUser(Long userId) {
        return userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }

    private OrderResponse toOrderResponse(Order order) {
        List<OrderItemResponse> items = orderItemRepository.findAllByOrder_IdOrderByIdAsc(order.getId()).stream()
                .map(OrderService::toOrderItemResponse)
                .toList();
        return new OrderResponse(order.getId(), order.getTotalAmount(), order.getStatus(), order.getCreatedAt(), items);
    }

    private static OrderSummaryResponse toSummaryResponse(Order order) {
        return new OrderSummaryResponse(order.getId(), order.getTotalAmount(), order.getStatus(), order.getCreatedAt());
    }

    private static OrderItemResponse toOrderItemResponse(OrderItem item) {
        return new OrderItemResponse(
                item.getId(),
                item.getProduct().getId(),
                item.getProductName(),
                item.getPrice(),
                item.getQuantity(),
                item.getSubtotal());
    }
}
