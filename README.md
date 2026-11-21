# Pennywise 💰

Pennywise tracks shared-group expenses in INR, calculates equal shares and balances, and records repayments made outside the app. It does not transfer money or track personal income/budgets.

---

## 🏗 Repository Structure

```
Pennywise/
├── client/       # React Native / Expo mobile application
├── server/       # Express.js & TypeScript REST API backend
└── docs/         # API specifications and architecture documentation
```

---

## 🚀 Features

- **Shared Expenses**: Everyone, selected members, or everyone with exclusions; standard/custom categories.
- **Group Records**: Atomic activity history, corrected member statements, and group spending statements.
- **Secure Authentication**: JWT-based session security with bcrypt password hashing.
- **Cross-Platform Mobile Client**: Built with Expo (React Native) for iOS, Android, and Web.
- **Containerized Backend**: Docker and Docker Compose support for reproducible development and deployment.
- **Emerald Light/Dark Themes**: System, Light, and Dark preferences; cached offline reads without an offline write queue.

---

## 🛠 Tech Stack

### Client
- **Framework**: React Native with Expo SDK 58, Expo Router
- **Language**: TypeScript
- **State Management & UI**: Native components, Ionicons, React Context, SecureStore and account-scoped AsyncStorage caches

### Server
- **Runtime**: Node.js & Express
- **Language**: TypeScript
- **Database**: MongoDB (via Mongoose)
- **Validation**: Zod
- **Testing**: Jest, Supertest, mongodb-memory-server
- **DevOps**: Docker, Docker Compose

---

## 🚦 Getting Started

### 1. Prerequisites
- Node.js 22.13+ and npm
- MongoDB 8.x or Atlas for a persistent backend (standalone supported)
- Android/iOS development build or a browser for web preview

### 2. Backend Setup
```bash
cd server
npm ci
cp .env.example .env
# Set MONGODB_URI and a random JWT_SECRET in .env before starting.
npm run dev
```

### 3. Client Setup
```bash
cd client
npm ci
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to the backend URL reachable from your device.
npm start
```

---

## 📖 Documentation

Detailed architectural and API guides are available in the [`docs/`](./docs) folder:
- [API Documentation](./docs/api.md)
- [Client Setup & Behavior](./client/README.md)
- [Backend Setup Guide](./docs/backend-setup.md)
- [Backend Audit & Architecture](./docs/backend-audit.md)
