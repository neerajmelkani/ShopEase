package com.ecommerce.repository;

import com.ecommerce.entity.CartItem;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {

    List<CartItem> findAllByCart_IdOrderByIdAsc(Long cartId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select item from CartItem item where item.cart.id = :cartId order by item.id asc")
    List<CartItem> findAllByCartIdForUpdate(@Param("cartId") Long cartId);

    Optional<CartItem> findByCart_IdAndProduct_Id(Long cartId, Long productId);

    Optional<CartItem> findByIdAndCart_User_Id(Long cartItemId, Long userId);

    void deleteAllByCart_Id(Long cartId);
}
