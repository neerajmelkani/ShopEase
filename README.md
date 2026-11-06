# ShopEase - E-Commerce Application

ShopEase is a full-stack e-commerce application developed using Java, Spring Boot, MySQL, HTML, CSS, and JavaScript. It provides a platform for customers to browse products, manage shopping carts, place orders, and track their purchases. Administrators can manage products, categories, and customer orders.

## Tech Stack

### Backend
- Java 21
- Spring Boot
- Spring Data JPA
- Spring Security
- JWT Authentication
- Hibernate
- Maven

### Frontend
- HTML5
- CSS3
- Vanilla JavaScript

### Database
- MySQL 8

### Tools
- IntelliJ IDEA
- Visual Studio Code
- MySQL Workbench
- Postman
- Git and GitHub

## Features

### Customer Features
- User registration and login.
- JWT-based authentication.
- Browse and search products.
- View product details and images.
- Add products to the shopping cart.
- Update product quantities and remove cart items.
- Place orders using Cash on Delivery (COD).
- View order history and order details.
- Cancel eligible orders.

### Admin Features
- Secure admin authentication.
- Add, update, and delete products.
- Manage product categories.
- View customer orders.
- Update order statuses.
- Manage product stock and pricing.

## Security

- Spring Security for application security.
- JWT-based authentication.
- BCrypt password hashing.
- Role-based authorization for customers and administrators.
- Public registration assigns the CUSTOMER role by default.
- Environment variables for sensitive configuration.

## Project Structure

```text
ShopEase/
│
├── ecommerce-backend/
│   ├── src/
│   │   └── main/
│   │       ├── java/
│   │       └── resources/
│   ├── pom.xml
│   └── ...
│
├── frontend/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── ...
│
├── .gitignore
└── README.md
```

## Prerequisites

Make sure the following are installed:

- JDK 21
- Maven 3.9+
- MySQL 8
- Visual Studio Code or IntelliJ IDEA
- Git

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/neerajmelkani/ShopEase.git
cd ShopEase
```

### 2. Create the MySQL Database

Open MySQL Workbench and execute:

```sql
CREATE DATABASE ecommerce_db;
```

### 3. Configure Environment Variables

Configure the following environment variables before starting the backend:

| Variable | Description |
|---|---|
| DB_URL | MySQL JDBC connection URL |
| DB_USERNAME | MySQL username |
| DB_PASSWORD | MySQL password |
| JWT_SECRET | Secure JWT signing secret |
| ADMIN_EMAIL | Initial administrator email |
| ADMIN_PASSWORD | Initial administrator password |

Example database URL:

```text
jdbc:mysql://localhost:3306/ecommerce_db
```

Use your own credentials and a securely generated JWT secret. Do not commit actual credentials to GitHub.

### 4. Run the Backend

Navigate to the backend directory:

```bash
cd ecommerce-backend
```

Start the Spring Boot application:

```bash
mvn spring-boot:run
```

The backend will run at:

```text
http://localhost:8080
```

### 5. Run the Frontend

Open the `frontend` directory in Visual Studio Code.

Run `index.html` using the Live Server extension.

The frontend will be available at the local URL provided by Live Server.

## API Overview

| Module | Endpoint | Method |
|---|---|---|
| Registration | `/api/auth/register` | POST |
| Login | `/api/auth/login` | POST |
| Products | `/api/products` | GET |
| Categories | `/api/categories` | GET |
| Cart | `/api/cart` | GET |
| Add Cart Item | `/api/cart/items` | POST |
| Update Cart Item | `/api/cart/items/{id}` | PUT |
| Delete Cart Item | `/api/cart/items/{id}` | DELETE |
| Place Order | `/api/orders` | POST |
| Order History | `/api/orders` | GET |
| Order Details | `/api/orders/{id}` | GET |
| Cancel Order | `/api/orders/{id}/cancel` | PUT |
| Admin Orders | `/api/admin/orders` | GET |

Note: Administrative write operations require administrator authorization.

## Payment Method

Currently, ShopEase supports Cash on Delivery (COD). Online payment gateway integration is not included in the current version.

## Future Improvements

- Online payment integration using Razorpay.
- Product reviews and ratings.
- Wishlist functionality.
- Email notifications for order updates.
- Advanced product filtering and sorting.
- Improved order tracking.

## Author

**Neeraj Melkani**

- GitHub: https://github.com/neerajmelkani
- LinkedIn: https://linkedin.com/in/neeraj-melkani-110nm/

## License

This project is developed for learning and portfolio purposes.
