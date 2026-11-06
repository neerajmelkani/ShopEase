package com.ecommerce.config;

import com.ecommerce.entity.User;
import com.ecommerce.enums.Role;
import com.ecommerce.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Creates the first administrator from deployment-provided credentials, once. */
@Component
public class InitialAdminAccountRunner implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(InitialAdminAccountRunner.class);
    private static final String INITIAL_ADMIN_NAME = "ShopEase Administrator";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String configuredEmail;
    private final String configuredPassword;

    public InitialAdminAccountRunner(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            @Value("${ADMIN_EMAIL:}") String configuredEmail,
            @Value("${ADMIN_PASSWORD:}") String configuredPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.configuredEmail = configuredEmail;
        this.configuredPassword = configuredPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.existsByRole(Role.ADMIN)) {
            LOGGER.info("Initial admin setup skipped because an ADMIN account already exists.");
            return;
        }

        boolean emailMissing = configuredEmail == null || configuredEmail.isBlank();
        boolean passwordMissing = configuredPassword == null || configuredPassword.isBlank();

        if (emailMissing && passwordMissing) {
            LOGGER.info("Initial admin setup skipped; ADMIN_EMAIL and ADMIN_PASSWORD are not configured.");
            return;
        }
        if (emailMissing || passwordMissing) {
            throw new IllegalStateException("Configure both ADMIN_EMAIL and ADMIN_PASSWORD for initial admin setup.");
        }

        String email = configuredEmail.trim();
        if (userRepository.findByEmail(email).isPresent()) {
            throw new IllegalStateException(
                    "Initial admin setup cannot use ADMIN_EMAIL because that email already belongs to another account.");
        }

        User admin = new User();
        admin.setName(INITIAL_ADMIN_NAME);
        admin.setEmail(email);
        admin.setPassword(passwordEncoder.encode(configuredPassword));
        admin.setRole(Role.ADMIN);

        try {
            userRepository.save(admin);
            LOGGER.info("Initial ADMIN account created. The configured password was not logged.");
        } catch (DataIntegrityViolationException exception) {
            // A concurrent startup may have created the admin after the existence check.
            if (userRepository.existsByRole(Role.ADMIN)) {
                LOGGER.info("Initial admin setup skipped because an ADMIN account was created concurrently.");
                return;
            }
            throw exception;
        }
    }
}
