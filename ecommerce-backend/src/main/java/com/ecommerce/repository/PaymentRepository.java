package com.ecommerce.repository;

import com.ecommerce.entity.Payment;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    boolean existsByOrder_Id(Long orderId);

    Optional<Payment> findByIdAndOrder_User_Id(Long paymentId, Long userId);
}
