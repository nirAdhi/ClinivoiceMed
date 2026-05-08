require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
};

async function setupDatabase() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        console.log('Setting up database...');
        
        // Create database if not exists
        await connection.query('CREATE DATABASE IF NOT EXISTS clinivoice_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        console.log('✅ Database created');
        
        await connection.query('USE clinivoice_v2');
        
        // Create patients table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                external_id VARCHAR(255),
                domain VARCHAR(50) NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_domain (domain),
                INDEX idx_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✅ patients table');
        
        // Create users table with password_hash included
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                name VARCHAR(255),
                domain VARCHAR(50) NOT NULL,
                email VARCHAR(255),
                role VARCHAR(50) DEFAULT 'clinician',
                reset_token VARCHAR(255) NULL,
                reset_expires DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✅ users table');
        
        // Create sessions table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                patient_id INT,
                domain VARCHAR(50) NOT NULL,
                audio_url TEXT,
                transcription TEXT,
                ai_notes TEXT,
                status VARCHAR(50) DEFAULT 'recording',
                duration INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✅ sessions table');
        
        // Create default admin user with secure password
        const bcrypt = require('bcryptjs');
        const adminPassword = process.env.ADMIN_PASSWORD || 'CliniVoice$ecureAdmin2026!';
        const hash = await bcrypt.hash(adminPassword, 10);
        await connection.query(
            'INSERT IGNORE INTO users (user_id, domain, password_hash, role) VALUES (?, ?, ?, ?)',
            ['admin', 'medical', hash, 'admin']
        );
        console.log('🔑 Default admin: admin / ' + adminPassword);
        if (!process.env.ADMIN_PASSWORD) {
            console.log('⚠️  Using default password. Set ADMIN_PASSWORD env var for production!');
        }
        
        await connection.end();
        console.log('\n✅ Database setup complete!');
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

setupDatabase();
