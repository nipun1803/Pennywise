# Pennywise 💰

Pennywise is a full-stack personal finance and expense tracking application designed to help users budget, monitor transactions, and gain actionable financial insights.

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

- **Expense & Income Tracking**: Record and categorize daily financial activities.
- **Budgeting & Analytics**: Set budgets and inspect spending trends.
- **Secure Authentication**: JWT-based session security with bcrypt password hashing.
- **Cross-Platform Mobile Client**: Built with Expo (React Native) for iOS, Android, and Web.
- **Containerized Backend**: Docker and Docker Compose support for reproducible development and deployment.

---

## 🛠 Tech Stack

### Client
- **Framework**: React Native with Expo (SDK 52), Expo Router
- **Language**: TypeScript
- **State Management & UI**: Native components, Lucide Icons, React Context

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
- Node.js (v18+)
- npm or yarn
- MongoDB (local instance or Docker)
- Expo Go app on mobile or iOS/Android simulator

### 2. Backend Setup
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

### 3. Client Setup
```bash
cd client
npm install
npm start
```

---

## 📖 Documentation

Detailed architectural and API guides are available in the [`docs/`](./docs) folder:
- [API Documentation](./docs/api.md)
- [Backend Setup Guide](./docs/backend-setup.md)
- [Backend Audit & Architecture](./docs/backend-audit.md)
