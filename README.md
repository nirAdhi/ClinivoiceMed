# Clinivoice - AI-Powered Clinical Voice Dictation Platform

Complete web application for clinical voice dictation with AI-generated SOAP notes.

## 🚀 Quick Start

### Prerequisites
- Node.js 14+
- XAMPP (MySQL)
- npm

### Installation

1. **Start XAMPP MySQL**
2. **Create Database** (in phpMyAdmin or MySQL shell):
   ```sql
   CREATE DATABASE clinivoice;
   ```
3. **Install Backend Dependencies**:
   ```bash
   npm install
   ```
4. **Install Desktop App**:
   ```bash
   npm run install:desktop
   ```
5. **Configure Environment**: Copy `.env.example` to `.env` and update MySQL credentials

### Running Locally

1. **Start Backend**:
   ```bash
   npm start
   ```
2. **Start Desktop App** (new terminal):
   ```bash
   npm run dev:desktop
   ```
3. **Access**: Open `http://localhost:5173`

## ✨ Features

- 🎙️ Desktop microphone recording
- 🤖 AI-generated SOAP notes
- 💊 ICD/CPT coding suggestions
- 👥 Patient management
- 📊 Dashboard analytics
- 🌓 Dark/Light theme toggle
- ⚙️ Settings & Quick Actions

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, MySQL
- **Frontend**: React, Vite
- **AI**: OpenAI Whisper + GPT-4

## 📝 Usage

1. Login with any User ID
2. Select Dental or Medical domain
3. Click "Start Recording"
4. Speak your clinical notes
5. Click "Generate SOAP Note"
6. Review and save

## 🔐 Security

- No sensitive data cached client-side
- HTTPS required for production
- MySQL for secure data storage

## 📦 Production Build

```bash
npm run build:desktop
npm start
```

Access at: `http://localhost:3000/desktop`
