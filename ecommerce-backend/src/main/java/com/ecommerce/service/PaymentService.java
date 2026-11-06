package com.ecommerce.service;

import com.ecommerce.dto.request.CodPaymentRequest;
import com.ecommerce.dto.response.PaymentResponse;
import com.ecommerce.entity.Order;
import com.ecommerce.entity.Payment;
import com.ecommerce.entity.User;
import com.ecommerce.enums.OrderStatus;
import com.ecommerce.enums.PaymentMethod;
import com.ecommerce.enums.PaymentStatus;
import com.ecommerce.exception.OrderNotFoundException;
import com.ecommerce.exception.PaymentConflictException;
import com.ecommerce.exception.PaymentNotFoundException;
import com.ecommerce.repository.OrderRepository;
import com.ecommerce.repository.PaymentRepository;
import com.ecommerce.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    public PaymentService(
            PaymentRepository paymentRepository,
            OrderRepository orderRepository,
            UserRepository userRepository) {
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
    }

    public PaymentResponse createCodPayment(CodPaymentRequest request) {
        User customer = getAuthenticatedUser();
        Order order = orderRepository.findOwnedByIdForUpdate(request.orderId(), customer.getId())
                .orElseThrow(() -> new OrderNotFoundException(request.orderId()));

        if (order.getStatus() != OrderStatus.PENDING) {
            throw new PaymentConflictException("Only pending orders can be paid with COD");
        }
        if (paymentRepository.existsByOrder_Id(order.getId())) {
            throw new PaymentConflictException("A payment record already exists for this order");
        }

        Payment payment = new Payment();
        payment.setOrder(order);
        payment.setAmount(order.getTotalAmount());
        payment.setPaymentMethod(PaymentMethod.COD);
        // COD remains pending until delivery and collection are confirmed by a trusted workflow.
        payment.setPaymentStatus(PaymentStatus.PENDING);

        return toResponse(paymentRepository.saveAndFlush(payment));
    }

    @Transactional(readOnly = true)
    public PaymentResponse getPayment(Long paymentId) {
        User customer = getAuthenticatedUser();
        Payment payment = paymentRepository.findByIdAndOrder_User_Id(paymentId, customer.getId())
                .orElseThrow(() -> new PaymentNotFoundException(paymentId));
        return toResponse(payment);
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

    private static PaymentResponse toResponse(Payment payment) {
        return new PaymentResponse(
                payment.getId(),
                payment.getOrder().getId(),
                payment.getTransactionId(),
                payment.getAmount(),
                payment.getPaymentMethod(),
                payment.getPaymentStatus(),
                payment.getCreatedAt());
    }
}
