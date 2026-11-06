package com.ecommerce.service;

import com.ecommerce.dto.request.AddToCartRequest;
import com.ecommerce.dto.request.UpdateCartItemRequest;
import com.ecommerce.dto.response.CartItemResponse;
import com.ecommerce.dto.response.CartResponse;
import com.ecommerce.entity.Cart;
import com.ecommerce.entity.CartItem;
import com.ecommerce.entity.Product;
import com.ecommerce.entity.User;
import com.ecommerce.exception.CartItemNotFoundException;
import com.ecommerce.exception.InsufficientStockException;
import com.ecommerce.exception.ProductNotFoundException;
import com.ecommerce.repository.CartItemRepository;
import com.ecommerce.repository.CartRepository;
import com.ecommerce.repository.ProductRepository;
import com.ecommerce.repository.UserRepository;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class CartService {

    private final CartRepository cartRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;

    public CartService(
            CartRepository cartRepository,
            CartItemRepository cartItemRepository,
            ProductRepository productRepository,
            UserRepository userRepository) {
        this.cartRepository = cartRepository;
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
    }

    public CartResponse addItem(AddToCartRequest request) {
        if (request.quantity() == null || request.quantity() <= 0) {
            throw new IllegalArgumentException("Quantity must be greater than zero");
        }

        User user = getAuthenticatedUser();
        Cart cart = findOrCreateCartForUpdate(user);
        Product product = productRepository.findById(request.productId())
                .orElseThrow(() -> new ProductNotFoundException(request.productId()));

        CartItem item = cartItemRepository.findByCart_IdAndProduct_Id(cart.getId(), product.getId())
                .orElseGet(() -> {
                    CartItem newItem = new CartItem();
                    newItem.setCart(cart);
                    newItem.setProduct(product);
                    newItem.setQuantity(0);
                    return newItem;
                });

        int newQuantity;
        try {
            newQuantity = Math.addExact(item.getQuantity(), request.quantity());
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException("Requested quantity is too large");
        }
        ensureStockAvailable(product, newQuantity);
        item.setQuantity(newQuantity);
        cartItemRepository.save(item);
        return toCartResponse(cart);
    }

    public CartResponse getCart() {
        Cart cart = findOrCreateCartForUpdate(getAuthenticatedUser());
        return toCartResponse(cart);
    }

    public CartResponse updateItem(Long cartItemId, UpdateCartItemRequest request) {
        if (request.quantity() == null || request.quantity() <= 0) {
            throw new IllegalArgumentException("Quantity must be greater than zero");
        }

        User user = getAuthenticatedUser();
        lockUser(user.getId());
        lockCart(user.getId());
        CartItem item = findOwnedCartItem(cartItemId, user.getId());
        ensureStockAvailable(item.getProduct(), request.quantity());
        item.setQuantity(request.quantity());
        cartItemRepository.save(item);
        return toCartResponse(item.getCart());
    }

    public void removeItem(Long cartItemId) {
        User user = getAuthenticatedUser();
        lockUser(user.getId());
        lockCart(user.getId());
        CartItem item = findOwnedCartItem(cartItemId, user.getId());
        cartItemRepository.delete(item);
    }

    public void clearCart() {
        User user = getAuthenticatedUser();
        lockUser(user.getId());
        cartRepository.findByUserIdForUpdate(user.getId())
                .ifPresent(cart -> cartItemRepository.deleteAllByCart_Id(cart.getId()));
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

    private Cart findOrCreateCartForUpdate(User user) {
        lockUser(user.getId());
        return cartRepository.findByUserIdForUpdate(user.getId()).orElseGet(() -> {
            Cart cart = new Cart();
            cart.setUser(user);
            return cartRepository.save(cart);
        });
    }

    private void lockUser(Long userId) {
        userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }

    private void lockCart(Long userId) {
        cartRepository.findByUserIdForUpdate(userId);
    }

    private CartItem findOwnedCartItem(Long cartItemId, Long userId) {
        return cartItemRepository.findByIdAndCart_User_Id(cartItemId, userId)
                .orElseThrow(() -> new CartItemNotFoundException(cartItemId));
    }

    private static void ensureStockAvailable(Product product, int quantity) {
        if (quantity > product.getStockQuantity()) {
            throw new InsufficientStockException(product.getName(), product.getStockQuantity());
        }
    }

    private CartResponse toCartResponse(Cart cart) {
        List<CartItemResponse> items = cartItemRepository.findAllByCart_IdOrderByIdAsc(cart.getId()).stream()
                .map(CartService::toCartItemResponse)
                .toList();
        BigDecimal totalAmount = items.stream()
                .map(CartItemResponse::subtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CartResponse(cart.getId(), items, totalAmount);
    }

    private static CartItemResponse toCartItemResponse(CartItem item) {
        BigDecimal subtotal = item.getProduct().getPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
        return new CartItemResponse(
                item.getId(),
                item.getProduct().getId(),
                item.getProduct().getName(),
                item.getProduct().getPrice(),
                item.getQuantity(),
                subtotal);
    }
}
